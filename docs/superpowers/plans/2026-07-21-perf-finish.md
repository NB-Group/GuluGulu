# Perf 线收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收尾 perf agent 遗留提案——M6 shallowRef sweep(9 转 1 跳过)、M9 Messages 滚动节流、L10 删 ProblemDetail 死码、L11 Team 数组外提,行为零回归。

**Architecture:** 纯机械式、行为保持的优化。`shallowRef` 自动导入(无需改 import),每处把装 API payload 的 `ref` 改成 `shallowRef`;字段改写型 ref(`conversations`/`contest`)跳过。M9 用 `useThrottleFn` 包滚动 handler。L10/L11 是零风险清理。每任务一个文件、一个验证周期、一次提交。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Vite(IIFE 内容脚本)+ `unplugin-auto-import`(Vue API 自动导入)+ `@vueuse/core`。

## Global Constraints

(摘自 spec,每个任务隐式遵守)

- **行为零回归**:任何视图的数据更新行为不变。
- **typecheck 净增 0**:基线 **50** 个既有错误(vue-tsc 无 "Found" 汇总行,用 `grep -cE 'error TS'` 计数),只看净增量。
- **build 绿**:内容脚本 IIFE 构建 + 全量构建都通过。
- **pnpm 坏(corepack v11 vs 9.5)**:所有命令走 `node_modules/.bin/<tool>`,不用 `pnpm`/`npm run`。
- **`shallowRef` 已自动导入**(`src/auto-imports.d.ts:47`):直接用,**不加 import**。
- **`useThrottleFn` 未自动导入**:需显式 `import { useThrottleFn } from '@vueuse/core'`(抄 `Home.vue:2`)。
- **提交规范**:中文 conventional commit,**署 shu**,**无 Claude trailer**。`--no-verify` 被 hook 拦,正常提交即可。
- **工作目录**:`/home/shu/code/GuluGulu`(每条 bash 自带 `cd`,cwd 会重置)。

## File Structure

无新文件。修改 7 个视图文件:

| 文件 | 改动 |
|------|------|
| `src/contentScripts/views/Messages/Messages.vue` | M6 `messages`→shallowRef(含 :239 push 重构)+ M9 滚动节流;`conversations` 保留 ref |
| `src/contentScripts/views/ContestDetail/ContestDetail.vue` | M6 `scoreboard`→shallowRef |
| `src/contentScripts/views/Record/Record.vue` | M6 `records`→shallowRef |
| `src/contentScripts/views/UserProfile/UserProfile.vue` | M6 `prizes`/`dailyCounts`/`followList`→shallowRef |
| `src/contentScripts/views/Team/Team.vue` | M6 `teams`/`detail`→shallowRef + L11 数组外提 |
| `src/contentScripts/views/ProblemList/ProblemList.vue` | M6 `problems`→shallowRef |
| `src/contentScripts/views/ProblemDetail/ProblemDetail.vue` | L10 删 `loadingTimer` 死码 |

> **关于验证**:本项目无组件单测(`test: vitest test` 存在但无这些视图的用例),验证载体是 **typecheck 净增量 + build + 重载扩展后的行为观察**。`ref`→`shallowRef` 与 `useThrottleFn` 包裹都是类型安全的(签名不变),故 typecheck 净增 0 是构造性保证;真正的风险(丢响应式)靠重载后观察各视图数据是否仍更新。

## 预检:捕获 typecheck 基线

- [ ] **Step 0: 记录基线错误数**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: `50`(基线)。vue-tsc 不打印 "Found" 汇总行,故用 grep 计 error 行。**记下 50 作为基线**,后续每任务跑完比对,净增必须为 0。

---

## Task 1: Messages.vue — messages shallowRef + M9 滚动节流

**Files:**
- Modify: `src/contentScripts/views/Messages/Messages.vue`(:28、:49-55、:239、:414、import 区)

**Interfaces:** 无跨任务依赖(本文件自洽)。

- [ ] **Step 1: 重构 :239 push → 整体替换(shallowRef 前置)**

`Messages.vue:239`(发送消息路径,`messages.value.push(newMsgObj)`):

```diff
-      messages.value.push(newMsgObj)
+      messages.value = [...messages.value, newMsgObj]
```

语义等价(追加到末尾),改成整体赋值以适配 shallowRef。

- [ ] **Step 2: messages ref → shallowRef(:28)**

```diff
-const messages = ref<Message[]>([])
+const messages = shallowRef<Message[]>([])
```

- [ ] **Step 3: 加 useThrottleFn import**

`Messages.vue` 第 1 行(`<script setup lang="ts">`)下方,作为第一条 import(抄 `Home.vue:2`):

```diff
 <script setup lang="ts">
+import { useThrottleFn } from '@vueuse/core'
 import { renderIcon } from '~/utils/icons'
```

- [ ] **Step 4: 包裹 onMsgListScroll(:49-55)**

原:

```js
function onMsgListScroll() {
  const el = msgListRef.value
  if (!el || loadingOlder.value || chatLoading.value) return
  // Fire at 300px from top — by the time user reaches top, more messages are already there
  if (el.scrollTop <= 300 && msgPage.value > 1) {
    loadOlderMessages()
  }
}
```

改为(逻辑函数改名,再包一层节流常量,模板 :414 `@scroll="onMsgListScroll"` 无需动):

```js
function handleMsgListScroll() {
  const el = msgListRef.value
  if (!el || loadingOlder.value || chatLoading.value) return
  // Fire at 300px from top — by the time user reaches top, more messages are already there
  if (el.scrollTop <= 300 && msgPage.value > 1) {
    loadOlderMessages()
  }
}
// Throttle scroll-driven fetches so a fast scroll-up doesn't fire loadOlderMessages
// repeatedly within the same frame burst.
const onMsgListScroll = useThrottleFn(handleMsgListScroll, 100)
```

- [ ] **Step 5: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线(净增 0)。`messages`/`conversations` 仍被模板正常引用,无新增类型错误。

- [ ] **Step 6: content IIFE build 绿**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -5`
Expected: 构建成功(无报错,生成 content IIFE)。

- [ ] **Step 7: 行为验证(重载扩展)**

重载 unpacked extension,打开洛谷私信页:
- 会话列表(`conversations`,仍 ref)正常渲染、未读数/最新消息更新 ✓
- 收发消息:`messages` 列表实时追加/刷新 ✓(**shallowRef 后响应式仍生效**)
- 滚到顶部加载更多旧消息:节流后仍触发,不丢加载 ✓

- [ ] **Step 8: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/Messages/Messages.vue && git commit -m "perf(messages): messages 改 shallowRef + 滚动加载节流 useThrottleFn 100ms"
```

---

## Task 2: ContestDetail.vue — scoreboard shallowRef

**Files:** Modify `src/contentScripts/views/ContestDetail/ContestDetail.vue:70`

**最高价值项**:进行中的比赛轮询时 scoreboard 是 200 行的大数组,深代理开销最重。

- [ ] **Step 1: scoreboard ref → shallowRef(:70)**

```diff
-const scoreboard = ref<ScoreboardRow[]>([])
+const scoreboard = shallowRef<ScoreboardRow[]>([])
```

(scoreboard 全是整体替换:`:330` `scoreboard.value = page===1 ? items : [...]`、`:333` `scoreboard.value = []`;`:450`/`:480` 仅读取。已核实无字段改写。)

- [ ] **Step 2: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线。

- [ ] **Step 3: content build 绿**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -5`
Expected: 构建成功。

- [ ] **Step 4: 行为验证(重载扩展)**

打开一个**进行中**的比赛详情页 → ranking tab:
- 排行表渲染 ✓
- 等待 scoreboard 轮询刷新(或手动刷新)→ 名次/分数更新 ✓(**shallowRef 后轮询仍触发重渲染**)

- [ ] **Step 5: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/ContestDetail/ContestDetail.vue && git commit -m "perf(contest): scoreboard 改 shallowRef 避免 200 行深代理"
```

---

## Task 3: Record.vue — records shallowRef

**Files:** Modify `src/contentScripts/views/Record/Record.vue:105`

- [ ] **Step 1: records ref → shallowRef(:105)**

```diff
-const records = ref<RecordItem[]>([])
+const records = shallowRef<RecordItem[]>([])
```

(`:131` `records.value = append ? [...] : items`、`:281` `records.value = []` 均整体替换。)

- [ ] **Step 2: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线。

- [ ] **Step 3: content build 绿**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -5`
Expected: 构建成功。

- [ ] **Step 4: 行为验证(重载扩展)**

打开「评测记录」列表页:列表渲染 ✓;翻页/加载更多(`append`)追加 ✓。

- [ ] **Step 5: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/Record/Record.vue && git commit -m "perf(record): records 列表改 shallowRef"
```

---

## Task 4: UserProfile.vue — prizes/dailyCounts/followList shallowRef

**Files:** Modify `src/contentScripts/views/UserProfile/UserProfile.vue:64`、`:66`、`:69`

> 仅转这 3 个(报告点名)。同文件的 `user`(:63)、`gu`(:65)**不在范围**,保留 ref。

- [ ] **Step 1: prizes ref → shallowRef(:64)**

```diff
-const prizes = ref<any[]>([])
+const prizes = shallowRef<any[]>([])
```

- [ ] **Step 2: dailyCounts ref → shallowRef(:66)**

```diff
-const dailyCounts = ref<Record<string, [number, number]>>({})
+const dailyCounts = shallowRef<Record<string, [number, number]>>({})
```

(`:277` `dailyCounts.value[key]` 是**读取**,非改写,安全。)

- [ ] **Step 3: followList ref → shallowRef(:69)**

```diff
-const followList = ref<any[]>([])
+const followList = shallowRef<any[]>([])
```

- [ ] **Step 4: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线。

- [ ] **Step 5: content build 绿**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -5`
Expected: 构建成功。

- [ ] **Step 6: 行为验证(重载扩展)**

打开某用户主页:奖项(`prizes`)渲染 ✓;打卡热力(`dailyCounts`)渲染 ✓;切到关注/粉丝 tab(`followList`)加载并渲染 ✓。

- [ ] **Step 7: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/UserProfile/UserProfile.vue && git commit -m "perf(user): prizes/dailyCounts/followList 改 shallowRef"
```

---

## Task 5: Team.vue — teams/detail shallowRef + L11 数组外提

**Files:** Modify `src/contentScripts/views/Team/Team.vue`(:15、:48、:388 模板)

- [ ] **Step 1: teams ref → shallowRef(:15)**

```diff
-const teams = ref<any[]>([])
+const teams = shallowRef<any[]>([])
```

- [ ] **Step 2: detail ref → shallowRef(:48)**

```diff
-const detail = ref<any>(null)
+const detail = shallowRef<any>(null)
```

(`:69`/`:84`/`:208`/`:216` 均整体赋值;`:84` `detail.value = { ...detail.value, counts }` 是 spread 重建整体赋值,触发 shallowRef 响应式。)

- [ ] **Step 3: L11 — 团队内容数组外提到 setup**

模板 `:388` 内联字面量:

```html
<div v-for="item in [
  {k:'problem',l:'题目',icon:'mingcute:code-line'},
  {k:'training',l:'题单',icon:'mingcute:book-4-line'},
  {k:'homework',l:'作业',icon:'mingcute:file-edit-line'},
  {k:'contest',l:'比赛',icon:'mingcute:trophy-line'},
  {k:'file',l:'文件',icon:'mingcute:folder-line'},
]" :key="item.k" ...>
```

在 `<script setup>` 内(其它 const 附近)新增:

```ts
const teamContentTypes: { k: string, l: string, icon: string }[] = [
  { k: 'problem', l: '题目', icon: 'mingcute:code-line' },
  { k: 'training', l: '题单', icon: 'mingcute:book-4-line' },
  { k: 'homework', l: '作业', icon: 'mingcute:file-edit-line' },
  { k: 'contest', l: '比赛', icon: 'mingcute:trophy-line' },
  { k: 'file', l: '文件', icon: 'mingcute:folder-line' },
]
```

模板改为:

```diff
-              <div v-for="item in [
-                {k:'problem',l:'题目',icon:'mingcute:code-line'},
-                {k:'training',l:'题单',icon:'mingcute:book-4-line'},
-                {k:'homework',l:'作业',icon:'mingcute:file-edit-line'},
-                {k:'contest',l:'比赛',icon:'mingcute:trophy-line'},
-                {k:'file',l:'文件',icon:'mingcute:folder-line'},
-              ]" :key="item.k" bg="$bew-fill-1" rounded="$bew-radius" p-4 cursor="pointer" class="usage-card"
+              <div v-for="item in teamContentTypes" :key="item.k" bg="$bew-fill-1" rounded="$bew-radius" p-4 cursor="pointer" class="usage-card"
```

- [ ] **Step 4: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线。

- [ ] **Step 5: content build 绿**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -5`
Expected: 构建成功。

- [ ] **Step 6: 行为验证(重载扩展)**

团队列表页:`teams` 渲染 ✓;点进团队详情:`detail` 渲染、counts 子项(`:84` 重建)显示 ✓;团队内容 5 个卡片(题目/题单/作业/比赛/文件)渲染、点击跳转 ✓。

- [ ] **Step 7: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/Team/Team.vue && git commit -m "perf(team): teams/detail 改 shallowRef;团队内容数组外提 (L11)"
```

---

## Task 6: ProblemList.vue — problems shallowRef

**Files:** Modify `src/contentScripts/views/ProblemList/ProblemList.vue:27`

- [ ] **Step 1: problems ref → shallowRef(:27)**

```diff
-const problems = ref<ProblemItem[]>([])
+const problems = shallowRef<ProblemItem[]>([])
```

(`:109` `problems.value = append ? [...] : items`、`:134` `problems.value = []` 均整体替换。)

- [ ] **Step 2: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线。

- [ ] **Step 3: content build 绿**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vite build --config vite.config.content.ts 2>&1 | tail -5`
Expected: 构建成功。

- [ ] **Step 4: 行为验证(重载扩展)**

题目列表页:列表渲染 ✓;滚动加载更多(`append`)追加 ✓;切筛选类型重建列表 ✓。

- [ ] **Step 5: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/ProblemList/ProblemList.vue && git commit -m "perf(problems): problems 列表改 shallowRef"
```

---

## Task 7: ProblemDetail.vue — 删 L10 死码

**Files:** Modify `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`(:39、:285-286)

> `loadingTimer` 是 `const = null` 从不赋值(grep 全文件仅命中声明 + onUnmounted 守卫,无任何 `loadingTimer =` 赋值),纯死码。

- [ ] **Step 1: 删 :39 声明**

```diff
 const problemId = computed(() => props.pid || extractPidFromUrl())


-const loadingTimer: ReturnType<typeof setTimeout> | null = null
 // 题解列表(懒加载,切 tab 触发)抽到 useSolutions
```

(连同多余空行一并删,保留一行空行分隔。)

- [ ] **Step 2: 删 onUnmounted 内守卫块(:285-286)**

```diff
 onUnmounted(() => {
   flushLocalCode()
   window.removeEventListener('pagehide', flushLocalCode)
-  if (loadingTimer)
-    clearTimeout(loadingTimer)
 })
```

- [ ] **Step 3: typecheck 净增 0**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线(删死码不应引入错误)。

- [ ] **Step 4: 提交**

```bash
cd /home/shu/code/GuluGulu && git add src/contentScripts/views/ProblemDetail/ProblemDetail.vue && git commit -m "chore(problem): 删除死码 loadingTimer (L10)"
```

---

## Task 8: 终检 — 全量 build + smoke

**Files:** 无修改(仅验证)。

- [ ] **Step 1: 全量 typecheck**

Run: `cd /home/shu/code/GuluGulu && node_modules/.bin/vue-tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: 错误数 == 基线(全程净增 0)。

- [ ] **Step 2: 全量 build(走 node_modules/.bin,pnpm 坏)**

```bash
cd /home/shu/code/GuluGulu && \
node_modules/.bin/rimraf --glob extension extension.* && \
node_modules/.bin/vite build && \
node_modules/.bin/esno scripts/prepare.ts && \
node_modules/.bin/vite build --config vite.config.content.ts && \
node_modules/.bin/tsup && \
node_modules/.bin/esno scripts/ascii.ts
```
Expected: 全链绿(clear→web→prepare→js→bg→ascii),生成 `extension/`。

> bins 已核实:`rimraf`/`esno`/`tsup`/`vite` 均在 `node_modules/.bin`,上述链路可直接跑。

- [ ] **Step 3: smoke probe(若 probe 仍在)**

Run: `node /home/shu/.claude/jobs/47cea4ed/tmp/guly_code.mjs` 2>/dev/null || echo "probe 已清理,跳过"
Expected: probe 在则确认 `#guly` 挂载 + hljs palette 注入;probe 不在则手动重载扩展确认 `#guly` 挂载。

- [ ] **Step 4: 全量行为回归(重载扩展)**

逐个确认受影响视图仍正常:
- 消息(收发 + 滚动加载旧消息)
- 比赛详情 ranking(scoreboard 轮询刷新)
- 评测记录列表(翻页)
- 用户主页(奖项/打卡/关注列表)
- 团队(列表 + 详情 + 5 个内容卡片)
- 题目列表(滚动加载 + 筛选)
- 题目详情(正常,无回归)

- [ ] **Step 5: push(问用户后)**

确认全部绿 + 行为无回归后,征求用户同意再 `git push origin main`。

---

## 实现顺序与回退

- **顺序**:Task 1(Messages,改动最多,含重构)→ 2(scoreboard 最高价值)→ 3-6(其余 shallowRef)→ 7(死码)→ 8(终检)。每任务独立提交,可任意点回退。
- **回退信号**:任一视图重载后数据不更新(丢响应式)→ 该 ref 立即回退为 `ref`(`git revert <commit>` 或手动改回),记录原因,继续其余任务。
