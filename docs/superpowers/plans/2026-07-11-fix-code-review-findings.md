# Fix Code Review Findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 15 bugs found in code review of branch `fix/ide-contest-registration-team`, grouped into 5 logical tasks.

**Architecture:** Each task fixes a set of related bugs in priority order. Group 1 fixes crashes and data corruption first, Group 2 fixes broken functionality, Group 3 addresses robustness and cleanup.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, browser extension (Manifest V3), Shadow DOM

## Global Constraints

- No refactoring outside the scope of the findings
- Match existing code style (UnoCSS attributify, `var(--bew-*)` colors)
- Each fix verified independently before moving to the next task
- Run `npm run typecheck` after each group to catch regressions

---

### Task 1: Fix Crashes and Data Corruption (Findings #1–#4)

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`
- Modify: `src/contentScripts/views/ContestDetail/ContestDetail.vue`

**Interfaces:**
- Consumes: None (standalone fixes)
- Produces: `copiedMarkdown`, `copiedSample` refs restored; `nowTs` reactive timer via setInterval; `contestStatus` single computed; `??` operator for default values

- [ ] **Step 1: Restore `copiedMarkdown` / `copiedSample` ref declarations**

In `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`, find the ref declarations near `submitError` at line 266. Add after `const submitError = ref('')`:

```typescript
const copiedMarkdown = ref(false)
const copiedSample = ref<string | null>(null)
```

- [ ] **Step 2: Verify typecheck passes for ProblemDetail.vue**

Run: `npx vue-tsc --noEmit 2>&1 | grep -E "copiedMarkdown|copiedSample"`

Expected: No errors mentioning `copiedMarkdown` or `copiedSample`.

- [ ] **Step 3: Fix `nowTs` frozen computed — make it reactive**

In `src/contentScripts/views/ContestDetail/ContestDetail.vue`, replace lines 213–235:

**Before** (lines 213–235):
```typescript
const nowTs = computed(() => Math.floor(Date.now() / 1000))
const isOngoing = computed(() => {
  const s = c.value?.startTime || 0; const e = c.value?.endTime || 0
  return nowTs.value >= s && nowTs.value < e
})
const isEnded = computed(() => {
  const e = c.value?.endTime || 0
  return e > 0 && nowTs.value >= e
})
const isUpcoming = computed(() => {
  const s = c.value?.startTime || 0
  return s > 0 && nowTs.value < s
})
const statusLabel = computed(() => {
  if (isOngoing.value) return '进行中'
  if (isEnded.value) return '已结束'
  return '即将开始'
})
const statusColor = computed(() => {
  if (isOngoing.value) return '#52c41a'
  if (isEnded.value) return '#ff4d4f'
  return '#1890ff'
})
```

**After:**
```typescript
const nowTs = ref(Math.floor(Date.now() / 1000))
const nowTimer = setInterval(() => { nowTs.value = Math.floor(Date.now() / 1000) }, 1000)
onUnmounted(() => clearInterval(nowTimer))

const contestStatus = computed(() => {
  const now = nowTs.value
  const s = c.value?.startTime || 0
  const e = c.value?.endTime || 0
  const phase = now < s ? 'upcoming' : now < e ? 'ongoing' : 'ended'
  return {
    upcoming: s > 0 && phase === 'upcoming',
    ongoing: phase === 'ongoing',
    ended: e > 0 && phase === 'ended',
    label: phase === 'ongoing' ? '进行中' : phase === 'ended' ? '已结束' : '即将开始',
    color: phase === 'ongoing' ? '#52c41a' : phase === 'ended' ? '#ff4d4f' : '#1890ff',
  }
})
```

**Update all template references** — replace:
- `isOngoing` → `contestStatus.ongoing`
- `isEnded` → `contestStatus.ended`
- `isUpcoming` → `contestStatus.upcoming`
- `statusLabel` → `contestStatus.label`
- `statusColor` → `contestStatus.color`

**Update `countdown()`** — replace `const now = Math.floor(Date.now() / 1000)` with `const now = nowTs.value` at line 251.

- [ ] **Step 4: Fix falsy-zero in score mapping**

In `src/contentScripts/views/ContestDetail/ContestDetail.vue`, line 79. Replace:
```typescript
score: p.score || p.problem?.score || 100,
```
With:
```typescript
score: p.score ?? p.problem?.score ?? 100,
```

- [ ] **Step 5: Fix falsy-zero in submitted/accepted/difficulty**

In `src/contentScripts/views/ContestDetail/ContestDetail.vue`, lines 80–82. Replace:
```typescript
difficulty: p.problem?.difficulty || p.difficulty,
submitted: p.submitted || p.problem?.submitted || p.submittedCount || false,
accepted: p.accepted || p.problem?.accepted || p.acceptedCount || false,
```
With:
```typescript
difficulty: p.problem?.difficulty ?? p.difficulty,
submitted: p.submitted ?? p.problem?.submitted ?? p.submittedCount ?? 0,
accepted: p.accepted ?? p.problem?.accepted ?? p.acceptedCount ?? 0,
```

In the template line 354, replace:
```html
<div v-if="p.accepted" style="font-size:.8em;color:var(--bew-text-3)">通过 {{ p.accepted }} / 提交 {{ p.submitted }}</div>
```
With:
```html
<div v-if="p.submitted != null && p.submitted >= 0" style="font-size:.8em;color:var(--bew-text-3)">通过 {{ p.accepted }} / 提交 {{ p.submitted }}</div>
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/contentScripts/views/ProblemDetail/ProblemDetail.vue src/contentScripts/views/ContestDetail/ContestDetail.vue
git commit -m "fix: restore copiedMarkdown/copiedSample refs, fix nowTs frozen computed, fix falsy-zero bugs

- Restore copiedMarkdown and copiedSample ref declarations accidentally deleted during rewrite
- Replace nowTs computed (zero reactive deps) with ref + setInterval for live countdown
- Consolidate 6 status computeds into single contestStatus computed
- Replace || with ?? for score/submitted/accepted to handle valid zero values
- Fix template v-if to check submitted >= 0 instead of truthy accepted"
```

---

### Task 2: Fix Broken Self-Test and Ranking API (Findings #5, #6)

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`
- Modify: `src/background/messageListeners/api/ranking.ts`

- [ ] **Step 1: Fix self-test — remove unreachable AC comparison**

In `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`, lines 219–231. Replace:
```typescript
    if (json.rid) {
      testActualOutput.value = `RID: ${json.rid} — 提交成功，查看评测结果`
      testVerdict.value = '提交成功'
    } else {
      testActualOutput.value = json.data || json.errorMessage || '未知错误'
      testVerdict.value = '提交失败'
    }
    // Compare with expected if both exist
    if (testExpectedOutput.value && testActualOutput.value) {
      const exp = testExpectedOutput.value.trim()
      const act = testActualOutput.value.trim()
      if (exp === act) testVerdict.value = 'AC'
      else if (testVerdict.value === '提交成功') testVerdict.value = '已提交'
    }
```
With:
```typescript
    if (json.rid) {
      testActualOutput.value = `RID: ${json.rid} — 提交成功，查看评测结果`
      testVerdict.value = '提交成功'
    } else {
      testActualOutput.value = json.data || json.errorMessage || '未知错误'
      testVerdict.value = '提交失败'
    }
```

- [ ] **Step 2: Fix RANKING.getUserRank — HTML page, not JSON**

In `src/background/messageListeners/api/ranking.ts`, replace:
```typescript
'RANKING.getUserRank': {
  url: 'https://www.luogu.com.cn/user/<%= uid %>',
  _fetch: { method: 'GET' },
  afterHandle: AHS.J_D,
},
```
With:
```typescript
'RANKING.getUserRank': async (message: any) => {
  try {
    const uid = message.uid
    if (!uid) return { error: 'Missing uid' }
    const res = await fetch(`https://www.luogu.com.cn/user/${uid}`)
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const html = await res.text()
    const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (match?.[1]) return JSON.parse(match[1])
    return { error: 'No data' }
  } catch (e: any) { return { error: e.message } }
},
```

- [ ] **Step 3: Remove unused AHS import from ranking.ts**

Delete line 1 of `src/background/messageListeners/api/ranking.ts`:
```typescript
import { AHS } from '../../utils'
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/contentScripts/views/ProblemDetail/ProblemDetail.vue src/background/messageListeners/api/ranking.ts
git commit -m "fix: remove unreachable self-test AC logic, fix RANKING.getUserRank HTML/JSON mismatch

- Self-test submits to judge which returns RID, not program output; remove
  dead comparison that could never reach AC verdict
- RANKING.getUserRank was calling .json() on HTML page response; convert to
  direct fetch + lentille-context extraction matching other API patterns
- Remove unused AHS import from ranking.ts"
```

---

### Task 3: Fix Broken Punch Card, IDE Lang Selector, Double Description (Findings #7, #8, #9)

**Files:**
- Modify: `src/contentScripts/index.ts`
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`

- [ ] **Step 1: Move punch card polling BEFORE `document.body.innerHTML = ''`**

In `src/contentScripts/index.ts`, inside `onDOMLoaded()`, move the punch card extraction block (the `for (let i = 0; i < 20; i++)` loop with `document.querySelector('.lg-punch')`) to run AFTER the user info fetch (line 240 `} catch {}`) and BEFORE line 248 (`document.body.innerHTML = ''`).

The punch card polling block to move:
```typescript
    for (let i = 0; i < 20; i++) {
      try {
        const punchEl = document.querySelector('.lg-punch')
        if (punchEl && punchEl.innerHTML.includes('运势')) {
          ;(window as any).__guly_punch = { done: true, html: punchEl.innerHTML }
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 100))
    }
```

This block should be placed after the user info fetch (`} catch {}` after `userIdCookie = String(user.uid)`) and before the top bar preservation block (`originalTopBar = document.querySelector...`).

Delete the original punch card polling block that currently runs after `document.body.innerHTML = ''`.

- [ ] **Step 2: Fix IDE split-view language selector**

In `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`, line 672. Replace:
```html
<select v-model="selectedLang.id" @change="onLangChange(selectedLang)" style="padding:2px 4px;...">
```
With:
```html
<select :value="selectedLang.id" @change="(e: Event) => { const lang = LUOGU_LANGUAGES.find(l => l.id === Number((e.target as HTMLSelectElement).value)); if (lang) onLangChange(lang) }" style="padding:2px 4px;...">
```

This matches the correct lookup pattern used at lines 810–813 in the non-IDE submit tab.

- [ ] **Step 3: Fix double description in split view**

In `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`, line 634. Replace:
```html
<div v-if="problem.background" mb-4 class="markdown-body" v-html="renderedDescription.split(problem.description)[0]" />
<div v-html="renderedDescription" mb-4 />
```
With:
```html
<div v-html="renderedDescription" mb-4 />
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/contentScripts/index.ts src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git commit -m "fix: move punch card before body clear, fix IDE lang selector, fix double description

- Punch card polling was running after body.innerHTML='' which cleared the
  element; move extraction before the clear so it can find .lg-punch
- IDE split-view lang selector was mutating C++14 object in-place via
  v-model; switch to :value + @change with LUOGU_LANGUAGES lookup
- Remove broken .split(problem.description) approach for background
  isolation; renderedDescription already includes background + description
  in correct order"
```

---

### Task 4: Fix Robustness Issues (Findings #10, #11, #12)

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`
- Modify: `src/background/messageListeners/api/blog.ts`
- Modify: `src/background/messageListeners/api/ranking.ts`
- Modify: `src/contentScripts/views/ContestDetail/ContestDetail.vue`

- [ ] **Step 1: Add resize listener cleanup on unmount**

In `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`, after line 185, add:

```typescript
let cleanupResize: (() => void) | null = null
```

Update `startResize()` to store cleanup and add `onUnmounted` guard:

```typescript
function startResize(e: MouseEvent) {
  isDragging.value = true
  const container = (e.target as HTMLElement).parentElement!
  const startPct = splitRatio.value
  const startX = e.clientX
  const totalW = container.offsetWidth
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    splitRatio.value = Math.max(25, Math.min(65, startPct + (dx / totalW) * 100))
  }
  const onUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    cleanupResize = null
  }
  cleanupResize = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
```

And ensure the existing `onUnmounted` (line 480 from the original code — check exact location) includes:
```typescript
onUnmounted(() => {
  if (loadingTimer) clearTimeout(loadingTimer)
  cleanupResize?.()
})
```

- [ ] **Step 2: Fix lentille-context regex in blog.ts**

In `src/background/messageListeners/api/blog.ts`, line 11. Replace:
```typescript
const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
```
With:
```typescript
const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
```

- [ ] **Step 3: Fix lentille-context regex in ranking.ts (RANKING.getList)**

In `src/background/messageListeners/api/ranking.ts`, the `RANKING.getList` function (line 12). Replace:
```typescript
const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
```
With:
```typescript
const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
```

- [ ] **Step 4: Replace silent `catch {}` in ContestDetail**

In `src/contentScripts/views/ContestDetail/ContestDetail.vue`:

Line 157 (`loadProblem`): Replace `} catch {}` with `} catch { statementLoading.value = false }`

Line 205 (`fetchScoreboard`): Replace `} catch {}` with `} catch { scoreboard.value = [] }`

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/contentScripts/views/ProblemDetail/ProblemDetail.vue src/background/messageListeners/api/blog.ts src/background/messageListeners/api/ranking.ts src/contentScripts/views/ContestDetail/ContestDetail.vue
git commit -m "fix: add resize cleanup on unmount, fix lentille-context regex, replace silent catch

- Store resize cleanup callback and call on unmount to prevent stale
  mousemove/mouseup listeners after mid-drag navigation
- Add [^>]* to blog.ts and ranking.ts lentille-context regex for forward
  compatibility matching ContestDetail/Team pattern
- Replace bare catch {} in loadProblem/fetchScoreboard with proper state
  cleanup on error"
```

---

### Task 5: Fix Minor Issues and Dead Code (Findings #13, #14, #15)

**Files:**
- Modify: `src/contentScripts/views/ContestDetail/ContestDetail.vue`
- Modify: `src/contentScripts/index.ts`
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`
- Modify: `src/components/TopBar/TopBar.vue`

- [ ] **Step 1: Cache countdown() call in template**

In `src/contentScripts/views/ContestDetail/ContestDetail.vue`, template line 296. Replace:
```html
<span v-if="countdown()" text="xs" fw-bold px-3 py-1 rounded-full style="background:var(--bew-error-color-20);color:var(--bew-error-color)">{{ countdown() }}</span>
```
With:
```html
<template v-if="countdown()"><span text="xs" fw-bold px-3 py-1 rounded-full style="background:var(--bew-error-color-20);color:var(--bew-error-color)">{{ countdown() }}</span></template>
```

- [ ] **Step 2: Populate user color in __guly_user and TopBar**

In `src/contentScripts/index.ts`, line 259. Replace:
```typescript
;(window as any).__guly_user = {
  uid: userIdCookie,
  name: userName,
  csrfToken,
}
```
With:
```typescript
;(window as any).__guly_user = {
  uid: userIdCookie,
  name: userName,
  csrfToken,
  color: '',
}
```

In `src/components/TopBar/TopBar.vue`, line 71. Update the fallback fetch assignment to include color:
```typescript
;(window as any).__guly_user = { uid: String(user.uid), name: user.name || '', color: user.color || '', csrfToken: '' }
```

- [ ] **Step 3: Remove dead code**

**a) `TopBar.vue:191`** — Delete:
```typescript
const tags = path.filter(n => n instanceof HTMLElement).map(n => (n as HTMLElement).tagName)
```

**b) `ProblemDetail.vue:161–163`** — Delete:
```typescript
function toggleIDE() {
  ideMode.value = !ideMode.value
}
```

**c) `ProblemDetail.vue:313`** — Replace `getDefaultCode(28)` no-op with actual assignment:
```typescript
if (!codeContent.value) codeContent.value = getDefaultCode(28)
```

**d) `ProblemDetail.vue:268`** — Delete `const submitted = ref(false)` and delete line 381 `submitted.value = true`

**e) `TopBar.vue:3`** — Replace:
```typescript
import type { Ref, UnwrapNestedRefs } from 'vue'
```
With:
```typescript
import type { Ref } from 'vue'
```

**f) `ContestDetail.vue:121–139`** — Delete the entire orphaned `handleUnregister()` function body.

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/contentScripts/views/ContestDetail/ContestDetail.vue src/contentScripts/index.ts src/contentScripts/views/ProblemDetail/ProblemDetail.vue src/components/TopBar/TopBar.vue
git commit -m "fix: cache countdown template call, populate user color, remove dead code

- Wrap countdown() call in template v-if for clarity
- Add color field to __guly_user and extract from API fallback for colored user names
- Replace no-op getDefaultCode(28) with actual codeContent assignment
- Remove dead code: tags variable, toggleIDE, submitted ref, UnwrapNestedRefs import, orphaned handleUnregister"
```

---

## Verification Checklist

- [ ] `npm run build` — production build succeeds
- [ ] `npm run typecheck` — no TypeScript errors
- [ ] `npm run lint` — no ESLint errors
- [ ] Open contest page: status badge updates, countdown ticks
- [ ] Open problem page: copy buttons work, highlight.js provides feedback
- [ ] Open problem in IDE mode: language switch preserves canO2/aceMode
- [ ] Open team page: sub-page navigation works
