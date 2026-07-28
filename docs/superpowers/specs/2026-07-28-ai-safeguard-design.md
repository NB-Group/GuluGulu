# AI 安全 / 教学约束(beta)

- 日期:2026-07-28
- 状态:Draft(待用户复核 → writing-plans)
- 分支:`beta/ai-safeguard`(spec + impl 全部在此,`main` 不动)
- 作者:shu

## 1. 背景与目标

协作者近期为 GuluGulu 接入了 AI 能力(`src/utils/aiCompletion.ts` + `src/background/messageListeners/api/ai.ts`):Monaco 行内 **FIM 补全**(`light`/`strong` 两档)与 **思路指引**(`guide`,一句中文算法提示)。这套能力能直接生成完整代码,在**比赛中=作弊风险**,在日常=**剥夺独立思考**。

本设计给 AI 加一套**防作弊 + 教学约束**:

- 比赛中禁用一切 AI;
- AI 不再吐完整解题代码;
- AI 只解释编译错误(CE)、按用户写的注释生成「下一步」;
- 思路指引模式只输出纯文字。

意图:把 AI 从「代写器」收敛成「陪练」——逼用户用注释拆解步骤、独立实现,比赛时彻底关闭。

## 2. 非目标(YAGNI,本轮不做)

- 用量配额 / 速率限制 / token 成本上限(留给后续「分发/控成本」方向)。
- 跨 OJ、商店上架、i18n。
- 用户可关守卫的开关——**防作弊约束默认强制开启**,不提供关闭项(仅留 dev flag 便于测试)。

## 3. 用户规则(原始口径)

> 比赛不能用 ai,ai 不能吐完整代码,只能吐编译问题,写长代码需要注释,思路模式只能吐文字

澄清后落地的 5 条 + 2 个新模式:

1. **比赛禁 AI**:URL 含 `?contestId=`(`inContestMode`)→ 所有 AI 调用拒绝。
2. **FIM 补全限长**:非比赛保留补全,但只允许单行/短片段;禁止整段生成。
3. **不吐完整代码**:禁止 `strong`(完整实现)档。
4. **思路模式纯文字**:`guide` 输出不得含代码。
5. **注释驱动逐步生成**(新 `step` 档):用户写一行注释 → AI 只生成该注释描述的「下一步」实现,遇空行即停。
6. **AI 解释编译错误**(新 `ce` 档):把 `compileResult.message` 喂给 AI,要中文纯文字解释。

## 4. 架构 —— 守卫层 = 背景服务进行中的硬门

### 4.1 为什么是 SW

所有 AI HTTP 已统一经背景 SW 中继(内容脚本在 luogu origin 直连 OpenAI 兼容端点会 CORS):
- `AIComplete`(非流式,设置面板「测试连接」用)
- `handleAiStreamPort`(流式,**运行时主路径**,Monaco ghost 逐字)

两个入口都以 `buildUrlAndBody(message)` → `fetch` 收尾。在它们**最前面**插纯函数 `enforceAiPolicy(message)`,把守卫做成单一 chokepoint:**内容脚本/控制台绕不过**——这是防作弊场景的正确深度(prompt-only 可被套话绕过,不可单独依赖)。

### 4.2 数据流

```
Monaco/思路/CE按钮 (content)
  │  采上下文: isContest(from ?contestId=)、trigger('comment')、mode、intensity
  ▼
aiCompletion.ts  →  runtime message/port  →  background SW api/ai.ts
                                                  │
                                          ┌───────▼────────┐
                                          │ enforceAiPolicy │  ← 硬门(单一 chokepoint)
                                          └───────┬────────┘
                                              allowed? ── no → {blocked:true,reason}
                                                │ yes(clamp maxTokens/stop)
                                                ▼
                                          fetch(OpenAI 兼容端点)
                                                │ stream chunks
                                                ▼
                                    content: guide/ce 组装后 strip 代码(软) → 面板
                                              fim/step → Monaco ghost
```

**硬门(SW,不可绕过)**:比赛全拒、禁 strong、FIM 钳长。
**软过滤(content)**:guide/ce 文字去代码块(出问题最多在文字面板多显示一段,prompt 已禁代码,且比赛时全 AI 已关 → 无作弊风险)。

## 5. 策略规格(`enforceAiPolicy`)

输入 `message` 关键字段:`{mode, intensity?, isContest?, trigger?, maxTokens?, stop?}`。
输出:`{allowed:true, mode, maxTokens, stop}` 或 `{allowed:false, reason}`。

| 条件 | 动作 | reason |
|---|---|---|
| `isContest === true`(任意 mode) | 拒 | `'contest'` |
| `mode='fim'` 且非 `step` | 放行,强制 `maxTokens=min(原值,64)`、`stop` 含 `'\n'`(单行) | — |
| `mode='fim'`,`intensity='step'` | 仅 `trigger==='comment'` 放行;`maxTokens≤160`、`stop=['\n\n','\n//','\n#']`;否则拒 | `'need-comment'` |
| `mode='fim'`,`intensity='strong'`(512 等) | 拒 | `'no-full-code'` |
| `mode='chat'`,`intensity='strong'` | 拒 | `'no-full-code'` |
| `mode='chat'`,`intensity='guide'` | 放行(内容侧 strip 代码) | — |
| `mode='chat'`,`intensity='ce'` | 放行(内容侧 strip 代码) | — |
| 其它未登记 mode/intensity | 拒(默认拒绝) | `'unknown-mode'` |

**默认拒绝**:任何未在表内显式放行的组合一律 `{allowed:false}`。

数值依据:`light` 64 tok / `step` 160 tok 经验上对应「单行」与「一个短步骤」;`step` 的 stop 用空行/下一行注释作边界,防止 AI 跨步骤续写。这些常量集中放 `AI_POLICY` 常量块,便于调参。

## 6. 内容侧改动

### 6.1 `AiState` + 消息载荷
- `AiState` 新增 `isContest: boolean`、`trigger?: 'comment' | undefined`。
- 发往 SW 的 message 一并带 `isContest`、`trigger`、`intensity`。
- `ProblemDetail.vue` 已有 `inContestMode`(line 82-83,`?[?&]contestId=(\d+)`),`watch(inContestMode)` → `setAiState({ isContest })`。

### 6.2 `aiCompletion.ts` 新档构造
- `step`(注释驱动,FIM 式):`prompt` = 光标前(含那行注释)+ `suffix` = 光标后;系统提示:"Implement ONLY the next step described by the immediately preceding comment. Stop at the next blank line. No full solutions, no prose." 发送时 `trigger:'comment'`、`intensity:'step'`。
- `ce`(解释编译错误,chat):messages = 系统提示("Explain this compiler error in concise Chinese prose. No code, no fixes unless one short line.")+ user=`compileResult.message`;`intensity:'ce'`。

### 6.3 触发入口
- `step`:Monaco 编辑器命令(快捷键 / 命令面板项)「根据注释生成下一步」。仅当光标上一行是注释时启用(简单正则判别 `^\s*(\/\/|#|\/\*|\*)`)。
- `ce`:**Record 详情页** CE 面板(`Record.vue` 的 `detail.detail.compileResult.message` 渲染处)加「AI 解释」按钮 → 调 `ce` 档 → 文字面板展示。

## 7. 比赛 UX

`inContestMode` 为真时:
- 编辑器 AI 补全开关置灰,tooltip「比赛中已禁用 AI」;
- 思路指引按钮隐藏;
- FIM provider 不触发;
- 即便内容侧误发,SW `enforceAiPolicy` 仍以 `isContest` 拒绝(双保险)。

## 8. 错误处理与文案

- 拦截时:非流式 `AIComplete` 返 `{ok:false, blocked:true, reason}`;流式 port 发 `{blocked:true, reason}` 后发 `{done:true}`。
- `reason` → 中文文案(content 侧映射):
  - `contest` →「比赛中已禁用 AI」
  - `no-full-code` →「AI 不生成完整代码;请用注释拆解步骤,逐下一步生成」
  - `need-comment` →「请先写一行注释描述这一步,AI 再据此生成」
  - `unknown-mode` →「该 AI 模式不可用」
- 网络/上游错误沿用现有 `aiCompletion.ts` 的处理。

## 9. 测试计划

`enforceAiPolicy` 是纯函数 → 表驱动单测,放 `src/background/messageListeners/api/ai.policy.test.ts`(vitest,root=src;显式 `import {describe,it,expect} from 'vitest'`)。

用例(合成 message,无真实网络):
1. `isContest:true` × {fim-light, chat-guide, chat-ce, fim-step} → 全拒 `contest`。
2. `mode:fim,intensity:light` → 放行,`maxTokens≤64`、`stop` 含 `\n`。
3. `mode:fim,intensity:strong` → 拒 `no-full-code`。
4. `mode:chat,intensity:strong` → 拒 `no-full-code`。
5. `mode:fim,intensity:step,trigger:'comment'` → 放行,`maxTokens≤160`、`stop=['\n\n','\n//','\n#']`。
6. `mode:fim,intensity:step`(无 trigger)→ 拒 `need-comment`。
7. `mode:chat,intensity:guide/ce` → 放行。
8. `mode:chat,intensity:'???'` 未知 → 拒 `unknown-mode`。
9. `mode:fim,light` 但传入 `maxTokens:999` → 被钳到 64(验证 clamp 生效)。

`stripCodeBlocks`(content 侧软过滤)单测:含 ``` 代码块 / 裸代码 / 纯文字 → 仅留文字。

## 10. 分支与发布

- 全部改动在 `beta/ai-safeguard`;`main` 不受影响。
- 不新增用户开关;留 `__AI_GUARD_DEBUG`(dev flag,`localStorage`)→ 开时在 SW 控制台打 `enforceAiPolicy` 决策日志,便于测试。生产构建不影响。
- 合入 `main` 时机:beta 验证(真实比赛场景禁用、step/ce 体验)通过后再议。

## 11. 已决定的默认值(用户「continue」未推翻)

- `step` 档:`maxTokens=160`,`stop=['\n\n','\n//','\n#']`,`trigger='comment'` 必填。
- `ce` 入口:Record 详情页 CE 面板的「AI 解释」按钮。
- 分支名:`beta/ai-safeguard`。
- `light` FIM 沿用现有 `maxTokens=64, stop=['\n']`。

## 12. 实现顺序(供 writing-plans 参考)

1. 抽 `AI_POLICY` 常量 + 写 `enforceAiPolicy` 纯函数 + 单测(先把硬门和测试立住)。
2. `api/ai.ts` 的 `AIComplete` 与 `handleAiStreamPort` 入口接 `enforceAiPolicy`,拦截分支接好。
3. `AiState` 加 `isContest`/`trigger`;ProblemDetail 接线;message 载荷补字段。
4. `aiCompletion.ts` 加 `step` / `ce` 构造;`stripCodeBlocks` 软过滤 + 单测。
5. UX:比赛置灰/隐藏;`step` 编辑器命令;`ce` 按钮。
6. `__AI_GUARD_DEBUG` 日志;typecheck + 构建 + 真机回归。
