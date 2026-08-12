# AI 安全/教学约束(beta)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 GuluGulu 的 AI(FIM 补全 / 思路指引)加防作弊+教学约束:比赛禁用、不吐完整代码、只解释 CE、注释驱动逐步生成、思路纯文字。

**Architecture:** 在背景 SW(`api/ai.ts`,所有 AI HTTP 的唯一中继)入口加纯函数 `enforceAiPolicy` 硬门;内容侧(`aiCompletion.ts`)加 `isContest`/`trigger` 上下文与新 `step`/`ce` 两档;UX 上比赛时编辑器 AI 置灰/思路隐藏、加「根据注释生成下一步」Monaco 动作与 Record CE 面板「AI 解释」按钮。

**Tech Stack:** TypeScript · Vue 3 · webextension-polyfill(MV3)· Monaco · vitest(root=src)

## Global Constraints

- 分支:`beta/ai-safeguard`(所有改动在此,`main` 不动)。
- 提交:`shu <sjl0924@users.noreply.github.com>`,**无 Co-Authored-By 尾注**。
- pnpm 坏(corepack):用 `node_modules/.bin/<tool>` 直跑;构建步骤必加 `NODE_ENV=production` 前缀。
- vitest root=src:测试文件**必须在 src 下**;显式 `import { describe, it, expect } from 'vitest'`(globals 未进 tsconfig types)。
- typecheck 基线(pull 后)64;新增代码不得加错。typecheck:`node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`。
- 守卫是防作弊关键 → **硬门在 SW**(内容脚本不可绕过);不开用户开关(防作弊不该可关)。

---

## File Structure

- **Create** `src/background/messageListeners/api/ai.policy.ts` — `AI_POLICY` 常量 + `enforceAiPolicy` 纯函数(SW 守卫核心,无副作用,可单测)。
- **Create** `src/background/messageListeners/api/ai.policy.test.ts` — 表驱动单测。
- **Modify** `src/background/messageListeners/api/ai.ts` — `AIComplete` 与 `handleAiStreamPort` 入口接 `enforceAiPolicy`。
- **Modify** `src/utils/aiCompletion.ts` — `AiIntensity` 加 `step`/`ce`;`AiState` 加 `isContest`/`trigger`;payload 带这些字段;新增 `streamStepCompletion`、`explainCompileError`、`stripCodeBlocks`;`aiGated()` 含 `isContest`。
- **Create** `src/utils/aiCompletion.test.ts` — `stripCodeBlocks` 单测。
- **Modify** `src/contentScripts/views/ProblemDetail/ProblemDetail.vue` — `watch(inContestMode)`→`setAiState({isContest})`;比赛 UX(补全开关置灰、思路按钮隐藏)。
- **Modify** `src/utils/monaco.ts` — 注册 `guly.ai.step` 动作(光标上一行是注释时,调 `streamStepCompletion`)。
- **Modify** `src/contentScripts/views/Record/Record.vue` — CE 面板(`detail.detail.compileResult.message`,≈ line 414)加「AI 解释」按钮 → `explainCompileError`。

**责任边界**:`ai.policy.ts` 只决策(纯函数,可测);`api/ai.ts` 只执行决策+网络;`aiCompletion.ts` 只组请求+流式;UI 只采上下文+呈现。守卫逻辑单一 chokepoint=`enforceAiPolicy`。

---

## Task 1: `enforceAiPolicy` 纯函数 + 单测(TDD)

**Files:**
- Create: `src/background/messageListeners/api/ai.policy.ts`
- Test: `src/background/messageListeners/api/ai.policy.test.ts`

**Interfaces:**
- Produces: `enforceAiPolicy(msg: AiPolicyInput): AiPolicyResult`;`AI_POLICY` 常量。Task 2 消费。

- [ ] **Step 1: 写失败测试**

Create `src/background/messageListeners/api/ai.policy.test.ts`:

```text
import { describe, it, expect } from 'vitest'
import { enforceAiPolicy } from './ai.policy'

describe('enforceAiPolicy', () => {
  it('blocks everything when isContest', () => {
    for (const msg of [
      { mode: 'fim', intensity: 'light', isContest: true },
      { mode: 'chat', intensity: 'guide', isContest: true },
      { mode: 'chat', intensity: 'ce', isContest: true },
      { mode: 'fim', intensity: 'step', isContest: true, trigger: 'comment' },
    ]) {
      const r = enforceAiPolicy(msg)
      expect(r.allowed).toBe(false)
      if (!r.allowed)
        expect(r.reason).toBe('contest')
    }
  })

  it('clamps fim light to single line', () => {
    const r = enforceAiPolicy({ mode: 'fim', intensity: 'light', maxTokens: 999 })
    expect(r.allowed).toBe(true)
    if (r.allowed) {
      expect(r.maxTokens).toBe(64)
      expect(r.stop).toEqual(['\n'])
      expect(r.mode).toBe('fim')
    }
  })

  it('blocks fim strong (no full code)', () => {
    const r = enforceAiPolicy({ mode: 'fim', intensity: 'strong' })
    expect(r.allowed).toBe(false)
    if (!r.allowed)
      expect(r.reason).toBe('no-full-code')
  })

  it('blocks chat strong (no full code)', () => {
    const r = enforceAiPolicy({ mode: 'chat', intensity: 'strong' })
    expect(r.allowed).toBe(false)
    if (!r.allowed)
      expect(r.reason).toBe('no-full-code')
  })

  it('allows fim step only with trigger=comment, caps length', () => {
    const noTrig = enforceAiPolicy({ mode: 'fim', intensity: 'step' })
    expect(noTrig.allowed).toBe(false)
    if (!noTrig.allowed)
      expect(noTrig.reason).toBe('need-comment')

    const ok = enforceAiPolicy({ mode: 'fim', intensity: 'step', trigger: 'comment' })
    expect(ok.allowed).toBe(true)
    if (ok.allowed) {
      expect(ok.maxTokens).toBe(160)
      expect(ok.stop).toEqual(['\n\n', '\n//', '\n#'])
    }
  })

  it('allows chat guide / ce', () => {
    const g = enforceAiPolicy({ mode: 'chat', intensity: 'guide', maxTokens: 512 })
    expect(g.allowed).toBe(true)
    const c = enforceAiPolicy({ mode: 'chat', intensity: 'ce', maxTokens: 384 })
    expect(c.allowed).toBe(true)
  })

  it('rejects unknown mode/intensity', () => {
    expect(enforceAiPolicy({ mode: 'chat', intensity: '???' }).allowed).toBe(false)
    expect(enforceAiPolicy({ mode: 'weird', intensity: 'light' }).allowed).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vitest run src/background/messageListeners/api/ai.policy.test.ts`
Expected: FAIL(`enforceAiPolicy` 未定义 / 模块不存在)。

- [ ] **Step 3: 写实现**

Create `src/background/messageListeners/api/ai.policy.ts`:

```text
/**
 * AI 守卫(防作弊+教学约束)。所有 AI HTTP 在背景 SW 的入口先过这个纯函数:
 *  - 比赛(isContest)→ 全拒
 *  - FIM:只放 light(单行)和 step(注释驱动,限长);禁 strong(完整代码)
 *  - chat:放 guide/ce(纯文字);禁 strong
 *  - step 必须 trigger='comment'(用户先写注释)
 * 单一 chokepoint,内容脚本绕不过。详见 docs/superpowers/specs/2026-07-28-ai-safeguard-design.md。
 */
export interface AiPolicyInput {
  mode?: string
  intensity?: string
  isContest?: boolean
  trigger?: string
  maxTokens?: number
  stop?: string[]
}

export type AiPolicyReason = 'contest' | 'no-full-code' | 'need-comment' | 'unknown-mode'

export type AiPolicyResult =
  | { allowed: true, mode: string, maxTokens: number, stop: string[] }
  | { allowed: false, reason: AiPolicyReason }

export const AI_POLICY = {
  fimLight: { maxTokens: 64, stop: ['\n'] },
  fimStep: { maxTokens: 160, stop: ['\n\n', '\n//', '\n#'] },
} as const

export function enforceAiPolicy(msg: AiPolicyInput): AiPolicyResult {
  if (msg.isContest)
    return { allowed: false, reason: 'contest' }

  const mode = msg.mode
  const intensity = msg.intensity

  if (mode === 'fim') {
    if (intensity === 'strong')
      return { allowed: false, reason: 'no-full-code' }
    if (intensity === 'step') {
      if (msg.trigger !== 'comment')
        return { allowed: false, reason: 'need-comment' }
      return { allowed: true, mode: 'fim', maxTokens: AI_POLICY.fimStep.maxTokens, stop: [...AI_POLICY.fimStep.stop] }
    }
    if (intensity === 'light' || !intensity)
      return { allowed: true, mode: 'fim', maxTokens: AI_POLICY.fimLight.maxTokens, stop: [...AI_POLICY.fimLight.stop] }
    return { allowed: false, reason: 'unknown-mode' }
  }

  if (mode === 'chat') {
    if (intensity === 'strong')
      return { allowed: false, reason: 'no-full-code' }
    if (intensity === 'guide' || intensity === 'ce')
      return { allowed: true, mode: 'chat', maxTokens: msg.maxTokens ?? 512, stop: msg.stop ?? [] }
    return { allowed: false, reason: 'unknown-mode' }
  }

  return { allowed: false, reason: 'unknown-mode' }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vitest run src/background/messageListeners/api/ai.policy.test.ts`
Expected: PASS(7 用例全过)。

- [ ] **Step 5: 提交**

```bash
cd /home/shu/code/GuluGulu
git add src/background/messageListeners/api/ai.policy.ts src/background/messageListeners/api/ai.policy.test.ts
git commit -m "feat(ai-guard): enforceAiPolicy 纯函数 + 表驱动单测(SW 守卫核心)"
```

---

## Task 2: 把 `enforceAiPolicy` 接入 SW 两个入口

**Files:**
- Modify: `src/background/messageListeners/api/ai.ts`(`AIComplete` ≈ line 49、`handleAiStreamPort` ≈ line 74)

**Interfaces:**
- Consumes: `enforceAiPolicy`、`AiPolicyResult`(Task 1)。
- Produces: SW 入口拦截 —— 拒绝时非流式返 `{ok:false,blocked:true,reason}`,流式 port 发 `{blocked:true,reason,done:true}`。Task 3+ 的内容侧会读 `blocked`/`reason`。

- [ ] **Step 1: 改 `AIComplete`(非流式)**

在 `src/background/messageListeners/api/ai.ts` 顶部加 import:

```text
import { enforceAiPolicy } from './ai.policy'
```

把 `AIComplete` 的函数体开头(在 `const { url, body } = buildUrlAndBody(...)` 之前)插守卫,并用守卫返回值覆盖 maxTokens/stop/mode。改后:

```text
  AIComplete: async (message: any) => {
    const pol = enforceAiPolicy(message)
    if (!pol.allowed)
      return { ok: false, blocked: true, reason: pol.reason }
    const guarded = { ...message, mode: pol.mode, maxTokens: pol.maxTokens, stop: pol.stop }
    const { url, body } = buildUrlAndBody({ ...guarded, /* 测试连接强制非流式 */ })
    const nonStreamBody = { ...body, stream: false }
    try {
      // …(原有 fetch/解析逻辑不变)
```

(只改这两行:插入 `pol` 守卫,把 `buildUrlAndBody({ ...message, …})` 改成 `buildUrlAndBody({ ...guarded, …})`。其余 fetch/return 不动。)

- [ ] **Step 2: 改 `handleAiStreamPort`(流式,运行时主路径)**

把 `port.onMessage.addListener` 回调开头改成:

```text
  port.onMessage.addListener(async (message: any) => {
    const pol = enforceAiPolicy(message)
    if (!pol.allowed) {
      try { port.postMessage({ blocked: true, reason: pol.reason, done: true }) }
      catch {}
      return
    }
    const guarded = { ...message, mode: pol.mode, maxTokens: pol.maxTokens, stop: pol.stop }
    const isFim = guarded.mode === 'fim'
    const { url, body } = buildUrlAndBody(guarded)
    try {
      // …(原有 fetch/SSE 循环不变,内部引用 isFim 已用 guarded.mode 计算)
```

(原 `const isFim = message?.mode === 'fim'` 删掉,改用上面 `guarded.mode`。)

- [ ] **Step 3: 构建 SW 验证不破**

Run: `cd /home/shu/code/GuluGulu && NODE_ENV=production node_modules/.bin/tsup 2>&1 | tail -4`
Expected: `ESM ⚡️ Build success`。

- [ ] **Step 4: typecheck 不新增错误**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: `64`(与基线持平,不新增)。

- [ ] **Step 5: 提交**

```bash
cd /home/shu/code/GuluGulu
git add src/background/messageListeners/api/ai.ts
git commit -m "feat(ai-guard): SW 两入口接入 enforceAiPolicy(比赛拒/禁strong/FIM钳长/step需注释)"
```

---

## Task 3: 内容侧 `isContest`/`trigger` 上下文 + 比赛短路

**Files:**
- Modify: `src/utils/aiCompletion.ts`(`AiState` ≈ line 15、`aiGated` ≈ line 70、payload ≈ line 102)
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`(setAiState ≈ line 183)

**Interfaces:**
- Consumes: SW 现在按 `isContest`/`trigger`/`intensity` 决策(Task 2)。
- Produces: payload 带 `isContest`/`trigger`/`intensity`;`aiGated()` 比赛时短路。Task 4/5 消费 `state.isContest` 与新档。

- [ ] **Step 1: 扩 `AiState` + 初始值**

`src/utils/aiCompletion.ts`:

```text
interface AiState {
  enabled: boolean
  intensity: AiIntensity
  baseURL: string
  apiKey: string
  model: string
  thinking: boolean
  fim: boolean
  problemMarkdown: string
  isContest: boolean     // 比赛(?contestId=)→ SW 全拒 + 内容侧短路
  trigger?: 'comment'    // step 档:用户已写注释
}

let state: AiState = { enabled: false, intensity: 'off', baseURL: '', apiKey: '', model: '', thinking: false, fim: true, problemMarkdown: '', isContest: false }
```

(在 `problemMarkdown: string` 后加 `isContest: boolean` 与 `trigger?: 'comment'`;初始值加 `isContest: false`。)

- [ ] **Step 2: `aiGated()` 比赛短路**

```text
export function aiGated(): boolean {
  return !state.enabled || state.isContest || state.intensity === 'off' || !state.baseURL || !state.model
}
```

- [ ] **Step 3: payload 带 `isContest`/`trigger`/`intensity`**

在 `streamInlineCompletion` 的两个 payload 分支(fim / chat)都加字段。fim 分支:

```text
  const payload: any = useFim
    ? {
        mode: 'fim',
        intensity,
        isContest: state.isContest,
        trigger: state.trigger,
        baseURL: base,
        apiKey: state.apiKey,
        model: state.model,
        prompt: prefix,
        suffix,
        maxTokens: FIM_CONFIG[intensity as 'light' | 'strong'].maxTokens,
        stop: FIM_CONFIG[intensity as 'light' | 'strong'].stop,
        temperature,
      }
    : {
        mode: 'chat',
        intensity,
        isContest: state.isContest,
        trigger: state.trigger,
        baseURL: base,
        apiKey: state.apiKey,
        model: state.model,
        messages: buildChatMessages(intensity, lang, prefix),
        maxTokens: state.thinking ? CHAT_MAXTOKENS[intensity] * 2 : CHAT_MAXTOKENS[intensity],
        temperature,
      }
```

(注:`intensity` 此处类型需能含 `'step'`/`'ce'`,Task 4 会扩 `AiIntensity` 与 `FIM_CONFIG`/`CHAT_MAXTOKENS` 的键;本步先加 `intensity`/`isContest`/`trigger` 三字段,`FIM_CONFIG[intensity as ...]` 的索引在 Task 4 补 step 后类型才全 —— 本步若 typecheck 报 `step/ce` 缺键,先在 Task 4 一并解。)

- [ ] **Step 4: ProblemDetail 注入 isContest**

`src/contentScripts/views/ProblemDetail/ProblemDetail.vue` 在 `setAiState({…})` 那个 watcher 之后(`})` 之后,≈ line 193)加一个独立 watcher:

```text
watch(inContestMode, v => setAiState({ isContest: v }), { immediate: true })
```

(`inContestMode` 已在 line 83 定义;独立 watcher 不依赖原 watcher 的 source。)

- [ ] **Step 5: typecheck(预期 Task 4 才补全 step/ce 键,本步可能暂报 FIM_CONFIG/CHAT_MAXTOKENS 缺键 —— 若报,先记下,Task 4 修)**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 若报 `FIM_CONFIG`/`CHAT_MAXTOKENS` 缺 `step`/`ce` 键 → 正常,Task 4 补;其它错误=0。

- [ ] **Step 6: 提交(若 typecheck 因缺键暂不过,合并进 Task 4 一起提交;否则单独提交)**

```bash
cd /home/shu/code/GuluGulu
git add src/utils/aiCompletion.ts src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git commit -m "feat(ai-guard): AiState 加 isContest/trigger,payload 带上下文,比赛 aiGated 短路"
```

---

## Task 4: `step`/`ce` 两档 + `stripCodeBlocks`(TDD)

**Files:**
- Modify: `src/utils/aiCompletion.ts`(类型/常量/新函数)
- Create: `src/utils/aiCompletion.test.ts`

**Interfaces:**
- Consumes: `state`(Task 3)。
- Produces: `AiIntensity` 含 `'step'|'ce'`;`streamStepCompletion(lang,prefix,suffix,onChunk)`、`explainCompileError(ceMessage,onChunk)`、`stripCodeBlocks(text)`。Task 5 的 Monaco 动作与 Record 按钮消费。

- [ ] **Step 1: 写 `stripCodeBlocks` 失败测试**

Create `src/utils/aiCompletion.test.ts`:

```text
import { describe, it, expect } from 'vitest'
import { stripCodeBlocks } from './aiCompletion'

describe('stripCodeBlocks', () => {
  it('removes fenced code blocks, keeps prose', () => {
    const s = '编译错误在第 3 行:\n```cpp\nint a = ;\n```\n少了一个表达式。'
    expect(stripCodeBlocks(s)).toBe('编译错误在第 3 行:\n少了一个表达式。')
  })
  it('removes inline code', () => {
    expect(stripCodeBlocks('用 `sort(a, a+n)` 排序')).toBe('用 排序')
  })
  it('keeps plain text untouched', () => {
    expect(stripCodeBlocks('这一步用双指针,右指针右移即可。')).toBe('这一步用双指针,右指针右移即可。')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vitest run src/utils/aiCompletion.test.ts`
Expected: FAIL(`stripCodeBlocks` 未导出)。

- [ ] **Step 3: 扩类型/常量/提示词,加新函数**

在 `src/utils/aiCompletion.ts`:

扩 `AiIntensity`:
```text
export type AiIntensity = 'off' | 'light' | 'strong' | 'guide' | 'step' | 'ce'
```

扩 `INTENSITY_PROMPT`(补 step/ce):
```text
const INTENSITY_PROMPT: Record<Exclude<AiIntensity, 'off'>, string> = {
  light: 'Complete ONLY the single syntactic construct currently being typed. No new logic, no full algorithms. Example: prefix "for (int i" -> " = 1; i <= n; i++)". Output ONLY the suffix to append, no markdown, no prose, no code fences.',
  strong: 'Based on the preceding comment or context, generate a complete runnable implementation in the same language. Example: prefix "//bfs" -> the full BFS code. Output ONLY code (no markdown fences, no prose).',
  guide: 'Give ONE short Chinese sentence of algorithmic guidance (max ~40 chars), NOT code. Example: "此处应状态转移 dp[i]=min(dp[i-1]+1,…)". Output ONLY that sentence.',
  step: 'Implement ONLY the next step described by the immediately preceding comment. A few lines, stop at the next blank line. No full solutions, no prose, no markdown fences.',
  ce: 'Explain the compiler error in concise Chinese prose: what is wrong and where. Do NOT output code or full fixes (at most one short hint line).',
}
```

扩 `FIM_CONFIG`、`CHAT_MAXTOKENS`(键必须覆盖所有非 off 档):
```text
const FIM_CONFIG: Record<'light' | 'strong' | 'step', { maxTokens: number, stop: string[] }> = {
  light: { maxTokens: 64, stop: ['\n'] },
  strong: { maxTokens: 512, stop: [] },
  step: { maxTokens: 160, stop: ['\n\n', '\n//', '\n#'] },
}

const CHAT_MAXTOKENS: Record<Exclude<AiIntensity, 'off'>, number> = { light: 128, strong: 600, guide: 512, step: 200, ce: 384 }
```

修 Task 3 留的索引:把 `streamInlineCompletion` 里 `FIM_CONFIG[intensity as 'light' | 'strong']` 改成 `FIM_CONFIG[intensity as 'light' | 'strong' | 'step']`(两处:maxTokens、stop)。

新增 `stripCodeBlocks` 与两档流式函数(放在 `streamInlineCompletion` 之后、文件结束前)。先抽公共流式核 `runPortStream`,再让三个入口复用:

```text
/** 去 fenced/inline 代码块,只留文字(guide/ce 文字面板防泄漏代码)。 */
export function stripCodeBlocks(s: string): string {
  return s
    .replace(/```[\w-]*\n?[\s\S]*?\n?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 流式核:发 payload 到 SW port,逐 chunk 回调,resolve 最终文本(空=没拿到/被拦)。 */
function runPortStream(payload: any, onChunk: (acc: string) => void): Promise<string> {
  if (aiGated())
    return Promise.resolve('')
  abortAiStream()
  const port = browser.runtime.connect({ name: 'guly-ai-stream' })
  curPort = port
  let acc = ''
  let reasoningAcc = ''
  return new Promise<string>((resolve) => {
    port.onMessage.addListener((m: any) => {
      if (!m)
        return
      if (m.blocked) {
        console.warn('[guly-ai] blocked by guard', m.reason)
        cleanup(); resolve(''); return
      }
      if (m.chunk) { acc += m.chunk; onChunk(acc) }
      else if (m.reasoning) { reasoningAcc += m.reasoning }
      else if (m.done) {
        const final = acc || reasoningAcc.trim().split('\n').filter(Boolean).slice(-2).join(' ')
        cleanup(); resolve(stripFences(final))
      }
      else if (m.error) { console.warn('[guly-ai] stream error', m.error); cleanup(); resolve('') }
    })
    port.onDisconnect.addListener(() => { if (curPort === port) { cleanup(); resolve(acc) } })
    port.postMessage(payload)
  })
  function cleanup() {
    try { port.disconnect() }
    catch {}
    if (curPort === port)
      curPort = null
  }
}

/** 注释驱动逐步生成:用户写了注释 → AI 只写该步实现。仅非比赛、需 trigger='comment'。 */
export function streamStepCompletion(lang: string, prefix: string, suffix: string, onChunk: (acc: string) => void): Promise<string> {
  if (state.isContest)
    return Promise.resolve('')
  const base = state.baseURL.replace(/\/+$/, '')
  return runPortStream({
    mode: 'fim', intensity: 'step', isContest: false, trigger: 'comment',
    baseURL: base, apiKey: state.apiKey, model: state.model,
    prompt: prefix, suffix,
    maxTokens: FIM_CONFIG.step.maxTokens, stop: FIM_CONFIG.step.stop,
    temperature: 0.2,
  }, onChunk)
}

/** 解释编译错误:把 compileResult.message 喂 chat,要中文纯文字。返回(strip 过的)文字。 */
export function explainCompileError(ceMessage: string, onChunk: (acc: string) => void): Promise<string> {
  if (state.isContest || !state.baseURL || !state.model)
    return Promise.resolve('')
  const base = state.baseURL.replace(/\/+$/, '')
  const p = runPortStream({
    mode: 'chat', intensity: 'ce', isContest: false,
    baseURL: base, apiKey: state.apiKey, model: state.model,
    messages: [
      { role: 'system', content: INTENSITY_PROMPT.ce },
      { role: 'user', content: ceMessage },
    ],
    maxTokens: CHAT_MAXTOKENS.ce, temperature: 0.2,
  }, onChunk)
  return p.then(stripCodeBlocks)
}
```

(把原 `streamInlineCompletion` 内联的 port 逻辑保留不动 —— 不强行重构,避免回归;`runPortStream` 仅供 step/ce 用。`curPort`/`abortAiStream` 为模块级,两套共存即可,新流会 abort 旧流。)

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vitest run src/utils/aiCompletion.test.ts`
Expected: PASS(3 用例)。

- [ ] **Step 5: typecheck 不新增错误**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: `64`(回到基线,Task 3 的缺键已补)。

- [ ] **Step 6: content 构建不破**

Run: `cd /home/shu/code/GuluGulu && NODE_ENV=production node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -4`
Expected: `✓ built`。

- [ ] **Step 7: 提交**

```bash
cd /home/shu/code/GuluGulu
git add src/utils/aiCompletion.ts src/utils/aiCompletion.test.ts src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git commit -m "feat(ai-guard): step/ce 两档 + stripCodeBlocks(+单测);补全 AiIntensity 键"
```

---

## Task 5: UX —— 比赛置灰/隐藏、step 动作、ce 按钮

**Files:**
- Modify: `src/utils/monaco.ts`(`registerInlineAiProvider` 区,≈ line 375-440)
- Modify: `src/contentScripts/views/Record/Record.vue`(CE 面板 ≈ line 414)
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`(思路按钮 + 编辑器 AI 开关;按现状定位)

**Interfaces:**
- Consumes: `streamStepCompletion`、`explainCompileError`(Task 4)、`state.isContest`(Task 3)。
- Produces: 用户可见入口。

### 5A — Record CE 面板「AI 解释」按钮

- [ ] **Step 1: 加按钮 + handler**

`src/contentScripts/views/Record/Record.vue`:在 `<script setup>` 加 import 与状态:

```text
import { explainCompileError } from '~/utils/aiCompletion'
const ceExplaining = ref(false)
const ceExplainText = ref('')
async function explainCe() {
  const msg = detail.value?.detail?.compileResult?.message
  if (!msg)
    return
  ceExplaining.value = true
  ceExplainText.value = ''
  const final = await explainCompileError(msg, (acc) => { ceExplainText.value = acc })
  ceExplainText.value = final || '(AI 未返回解释,检查 AI 设置)'
  ceExplaining.value = false
}
```

在 CE 面板(`v-if="detail.detail?.compileResult?.message"`,≈ line 414)那个块内、`{{ detail.detail.compileResult.message }}` 之后加:

```html
            <div mt-2>
              <Button size="small" :loading="ceExplaining" @click="explainCe">
                AI 解释
              </Button>
              <div v-if="ceExplainText" mt-2 p-3 bg="$bew-fill-1" rounded="$bew-radius" text="sm $bew-text-2" v-html="ceExplainText" />
            </div>
```

(`Button` 组件按项目既有用法;若该视图未 import `Button`,按邻近代码补 import。`v-html` 用于显示 markdown 文字 —— 内容已 `stripCodeBlocks`,风险低;若项目有 markdown 渲染工具可替换。)

- [ ] **Step 2: 构建 + 人工**(此步无单测,留 Task 6 一起验)

Run: `cd /home/shu/code/GuluGulu && NODE_ENV=production node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -3`
Expected: `✓ built`。

### 5B — Monaco「根据注释生成下一步」动作

- [ ] **Step 3: 注册 `guly.ai.step` 动作**

`src/utils/monaco.ts`:在 `registerInlineAiProvider(monaco)` 函数内(provider 注册之后)加动作注册:

```text
  // 根据注释生成下一步:仅当光标上一行是注释时,把该注释之后的实现交给 AI(step 档,SW 守卫限长)
  for (const lang of AI_LANGS) {
    try {
      monaco.editor.registerCommand('guly.ai.step', async (ctx: any) => {
        const editor = ctx?.getEditor?.() ?? ctx
        if (!editor)
          return
        const model = editor.getModel()
        const pos = editor.getPosition()
        if (!model || !pos)
          return
        const lineAbove = model.getLineContent(Math.max(1, pos.lineNumber - 1))
        if (!/^\s*(\/\/|#|\/\*|\*)/.test(lineAbove)) {
          console.warn('[guly-ai] step 需上一行为注释')
          return
        }
        const prefix = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column })
        const suffix = model.getValueInRange({ startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()) })
        const { streamStepCompletion } = await import('./aiCompletion')
        const final = await streamStepCompletion(model.getLanguageId?.() ?? 'cpp', prefix.slice(-1500), suffix.slice(0, 1500), () => {})
        if (final)
          editor.executeEdits('guly-ai-step', [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: final }])
      })
    }
    catch {}
    break // 动作全局注册一次即可
  }
```

(守卫在 SW 侧,内容侧不必再判 isContest;`step` 若在比赛中调用,SW 直接拒、`runPortStream` 收 `blocked` 返 '',安全。`break` 保证只注册一次。键位绑定由编辑器组件按既有 keybinding 模式挂 `guly.ai.step`,此处只注册命令。)

- [ ] **Step 4: typecheck**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: `64`。

### 5C — 比赛时编辑器 AI 置灰 + 思路按钮隐藏

- [ ] **Step 5: ProblemDetail 比赛态隐藏/置灰**

`src/contentScripts/views/ProblemDetail/ProblemDetail.vue`:思路指引按钮与编辑器 AI 开关加 `:disabled="inContestMode"`(或 `v-if="!inContestMode"`),并加 tooltip「比赛中已禁用 AI」。按该文件现有思路按钮/AI 开关模板位置定位(搜 `aiIntensity` / `思路` / 思路指引图标),在其触发元素上加:

```html
    :disabled="inContestMode"
    :title="inContestMode ? '比赛中已禁用 AI' : undefined"
```

(若该元素不支持 `disabled`,改用 `v-if="!inContestMode"` 隐藏,并在旁加一行灰字「比赛中已禁用 AI」。)即使 UI 漏网,SW 守卫仍以 `isContest` 拒绝(双保险,见 Task 2/3)。

- [ ] **Step 6: 构建**

Run: `cd /home/shu/code/GuluGulu && NODE_ENV=production node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 7: 提交**

```bash
cd /home/shu/code/GuluGulu
git add src/utils/monaco.ts src/contentScripts/views/Record/Record.vue src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git commit -m "feat(ai-guard): step Monaco 动作 + Record CE 「AI 解释」按钮 + 比赛态置灰/隐藏"
```

---

## Task 6: debug 日志 + 全量回归

**Files:**
- Modify: `src/background/messageListeners/api/ai.ts`(debug 日志)
- 无新文件

**Interfaces:**
- Consumes: 全部前序任务。
- Produces: 可观测性 + 验收。

- [ ] **Step 1: 加 `__AI_GUARD_DEBUG` 日志**

在 `api/ai.ts` 的 `enforceAiPolicy` 调用处(Task 2 两处),包一层仅 dev 生效的日志:

```text
    const pol = enforceAiPolicy(message)
    if ((globalThis as any).__AI_GUARD_DEBUG)
      console.warn('[guly-ai-guard]', { mode: message?.mode, intensity: message?.intensity, isContest: message?.isContest, trigger: message?.trigger }, '→', pol)
```

(两处入口都加。生产构建无影响。)

- [ ] **Step 2: 跑全部 AI 相关单测**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vitest run src/background/messageListeners/api/ai.policy.test.ts src/utils/aiCompletion.test.ts 2>&1 | tail -8`
Expected: 全 PASS。

- [ ] **Step 3: typecheck + 完整构建链**

Run:
```bash
cd /home/shu/code/GuluGulu
node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'
NODE_ENV=production node_modules/.bin/rimraf --glob extension 'extension.*' >/dev/null 2>&1
NODE_ENV=production node_modules/.bin/vite build >/dev/null 2>&1 && echo web-ok
NODE_ENV=production node_modules/.bin/esno scripts/prepare.ts >/dev/null 2>&1 && echo prepare-ok
NODE_ENV=production node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -2
NODE_ENV=production node_modules/.bin/tsup >/dev/null 2>&1 && echo bg-ok
NODE_ENV=production node_modules/.bin/esno scripts/ascii.ts >/dev/null 2>&1 && echo ascii-ok
```
Expected: typecheck `64`;web/prepare/bg/ascii 全 ok;content `✓ built`;`extension/manifest.json` 存在。

- [ ] **Step 4: 人工真机回归清单(请用户在 beta 分支构建的 extension/ 上验)**

- 普通题(`?contestId=` 不存在):编辑器 FIM 补全只出单行(不整段);`guly.ai.step` 在上一行是注释时生成一步、否则不响应。
- 比赛题(URL 含 `?contestId=`):编辑器 AI 置灰、思路按钮隐藏;即便强制触发,SW 拒(控制台 `__AI_GUARD_DEBUG=true` 时见 `[guly-ai-guard] → {allowed:false,reason:'contest'}`)。
- 思路指引:输出纯文字(无代码)。
- Record 一条 CE 记录:CE 面板「AI 解释」按钮出中文纯文字解释。

- [ ] **Step 5: 提交**

```bash
cd /home/shu/code/GuluGulu
git add src/background/messageListeners/api/ai.ts
git commit -m "chore(ai-guard): __AI_GUARD_DEBUG 决策日志(dev only)"
```

---

## 验收 = spec 全覆盖自检

- §3 规则1 比赛禁 → Task1(contest 拒)+ Task3(isContest)+ Task5C(UX)+ Task2(硬门) ✓
- §3 规则2 FIM 限长 → Task1(fim light 钳 64)+ Task2 ✓
- §3 规则3 不吐完整代码 → Task1(strong 拒)+ Task2 ✓
- §3 规则4 思路纯文字 → Task1(guide 放行)+ Task4(stripCodeBlocks 防泄漏) ✓
- §3 规则5 注释驱动 → Task1(step 需 comment)+ Task4(streamStepCompletion)+ Task5B(Monaco 动作) ✓
- §3 新模式 ce → Task1(ce 放行)+ Task4(explainCompileError)+ Task5A(按钮) ✓
- §4 SW 硬门 → Task1+Task2 ✓
- §9 单测 → Task1(7)+ Task4(3) ✓
- §10 分支/no-toggle/debug flag → Global Constraints + Task6 ✓
