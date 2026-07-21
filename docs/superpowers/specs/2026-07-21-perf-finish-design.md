# Perf 线收尾设计

> 2026-07-21 · GuluGulu · 收尾 perf agent 遗留提案(M6 / M9 / L10 / L11)

## 背景与现状(已核实)

perf agent 当初的报告里,T1/T2/T3/M4/M5(核心)/M7/M8 已在前序会话完成并推送。本次核实代码:

- **T1** ContestDetail timer gating + scoreboard 解耦 nowTs(`:341-460`)
- **T2** markdown LRU 缓存 + katex 加载后失效(`markdown.ts:42-84`)
- **T3** `highlightCode` computed(`Record.vue:220`)
- **M4** scoreboardView 在 memoized computed 内预算格子
- **M5(核心)** 格子样式从模板每渲染调一次 → computed 内预算(进行中比赛每秒 tick 不再产生 2000 次/秒分配)
- **M7** `renderedDescription` 单 computed,两处 v-html 共用(`ContestDetail:366`)
- **M8** msgDelays O(tail-30)(`Messages:266`)

真正剩余:M6、M9、L10、L11。

## 目标 / 成功标准

- 应用 M6/M9/L10/L11,**行为零回归**。
- `vue-tsc --noEmit` **净增 0**(基线 ~51,看净增量)。
- `vite build --config vite.config.content.ts` 绿。
- Playwright smoke probe 挂载 `#guly` ✓。
- M6 专项:每个转过的视图数据仍正常**响应式更新**(排行表轮询刷新、消息收发、record 轮询、用户/团队/题目列表加载)。

## 非目标(本次不做,附理由)

- **conversations**(`Messages.vue:22`):字段改写密集(5 处 index-assign/unshift/push),重构成本 > 收益,且会话列表本身短。
- **M5-CSS**:格子样式 CSS 类化。每轮 scoreboard 重算仍有 2000 次对象分配,但 scoreboard 轮询间隔大(几十秒),边际收益极低;M5 核心问题(每秒 tick 的分配)已解。
- **L12** 嵌套 v-for index keys(advisory)、**L13** App.vue scroll listener(root 组件,benign)。
- **`contest`**(`ContestDetail.vue:32`):`:101` `contest.value.description = cert` 字段改写,转 shallowRef 需重构,不在范围。

---

## M6 — shallowRef sweep

**方案(外科式):** 逐 ref grep `.value` 全部用法 → 分类「整体替换(`.value = …`)」vs「字段改写(`.value.x =` / `[i] =` / `push` / `unshift` / `Object.assign`)」→ 仅转整体替换型;字段改写型跳过并记录。

### 已核实的 10 个候选(对照当前代码)

| # | ref | 文件:行 | 用法分类 | 处置 |
|---|-----|---------|----------|------|
| 1 | `records` | Record.vue:105 | 全整体替换(`:131`/`:281`) | 转 shallowRef |
| 2 | `messages` | Messages.vue:28 | 整体替换 + 1 处 push(`:239`) | 先重构 `:239`,再转 |
| 3 | `scoreboard` | ContestDetail.vue:70 | 全整体替换(`:330`/`:333`);轮询 200 行 | 转 shallowRef(**最高价值**) |
| 4 | `prizes` | UserProfile.vue:64 | 全整体替换(`:222`) | 转 shallowRef |
| 5 | `dailyCounts` | UserProfile.vue:66 | 整体替换(`:224`);`:277` 为读 | 转 shallowRef |
| 6 | `followList` | UserProfile.vue:69 | 全整体替换(`:243`/`:373`) | 转 shallowRef |
| 7 | `teams` | Team.vue:15 | 全整体替换(`:28`) | 转 shallowRef |
| 8 | `detail` | Team.vue:48 | 全整体替换(`:69`/`:84`/`:208`/`:216`;`:84` 为 spread 重建整体赋值) | 转 shallowRef |
| 9 | `problems` | ProblemList.vue:27 | 全整体替换(`:109`/`:134`) | 转 shallowRef |
| 10 | `conversations` | Messages.vue:22 | 5 处字段改写(`:169`/`:244`/`:246`/`:318`/`:320`) | **跳过**,保留深 ref |

### `messages` 的 1 行重构(转 shallowRef 的前置)

`Messages.vue:239`:

```diff
- messages.value.push(newMsgObj)
+ messages.value = [...messages.value, newMsgObj]
```

语义等价(追加到末尾),改成整体替换以适配 shallowRef。其余 `messages.value = […]` 站点不动。

### 实现顺序(每改完一个文件即验证)

1. `messages` 重构 `:239` → 转 `messages`、`conversations` 跳过(Messages.vue)
2. `scoreboard`(ContestDetail.vue)
3. `records`(Record.vue)
4. `prizes` / `dailyCounts` / `followList`(UserProfile.vue)
5. `teams` / `detail`(Team.vue)
6. `problems`(ProblemList.vue)

每步后:`vue-tsc --noEmit`(看净增)+ 受影响视图 smoke。

---

## M9 — Messages 滚动节流

`Messages.vue:49` `onMsgListScroll()` 用 `useThrottleFn(onMsgListScroll, 100)`(`@vueuse/core` 已是依赖)包一层,模板/绑定改用节流后的函数。**阈值 100ms**。

> 实现时先确认绑定站点(template `@scroll` 还是 `addEventListener`),再决定是替换函数引用还是新增 `onMsgListScrollThrottled` 并改绑定。

---

## L10 — 删 ProblemDetail 死码

`ProblemDetail.vue`:

- `:39` `const loadingTimer: ReturnType<typeof setTimeout> | null = null` —— `const` 永不赋值(grep 全文件仅命中此处声明 + onUnmounted 守卫,无任何 `loadingTimer =` 赋值)。
- `:285-286` onUnmounted 内 `if (loadingTimer) clearTimeout(loadingTimer)`。

删除声明 + 守卫块。删前再扫一眼 onUnmounted 上下文,确认确无赋值路径。

---

## L11 — Team 内联数组字面量外提

`Team.vue:388` 模板内:

```html
<div v-for="item in [
  {k:'problem',l:'题目',icon:'mingcute:code-line'},
  {k:'training',l:'题单',icon:'mingcute:book-4-line'},
  {k:'homework',l:'作业',icon:'mingcute:file-edit-line'},
  {k:'contest',l:'比赛',icon:'mingcute:trophy-line'},
  {k:'file',l:'文件',icon:'mingcute:folder-line'},
]" :key="item.k" ...>
```

→ setup 内 `const teamContentTypes = […]`(同内容),模板改 `v-for="item in teamContentTypes"`。静态数组,可放模块顶层。

---

## 风险与回退

- **M6 唯一风险**:误转字段改写 ref → 丢响应式 → 页面不更新。
  - 缓解:已逐个 grep 核实(见上表);`conversations` / `contest` 已识别并跳过;`messages` 的唯一 push 已重构。
  - 兜底:每转完一个文件跑 typecheck + smoke;发现某视图丢更新 → 立即该 ref 回退为 `ref`,记录原因。
- **L10** 删码前复核 onUnmounted 上下文,确认无赋值。
- **L11** 外提后确认 `:key="item.k"` 仍唯一、点击行为不变。

## 验证命令

```bash
cd /home/shu/code/GuluGulu
node_modules/.bin/vue-tsc --noEmit                              # 净增 0
node_modules/.bin/vite build --config vite.config.content.ts    # 绿
node /home/shu/.claude/jobs/47cea4ed/tmp/guly_code.mjs          # smoke:#guly 挂载(probe 若已清理则跳过)
```

转 shallowRef 后,实测每个受影响视图数据仍响应式更新。
