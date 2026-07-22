# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

> Package manager is **pnpm** (`packageManager: pnpm@9.5.0` in `package.json`). `npm` will fail — use `pnpm`. If `pnpm` itself is broken (corepack version mismatch), the underlying tools run fine straight from `node_modules/.bin/` — e.g. `node_modules/.bin/vite build --config vite.config.content.ts`, `node_modules/.bin/esno scripts/ascii.ts`, `node_modules/.bin/vue-tsc --noEmit`.
>
> **Manual build chain needs `NODE_ENV=production`.** `pnpm build` sets it via `cross-env`; when running the steps yourself via `node_modules/.bin/`, you MUST prefix each with `NODE_ENV=production`. `scripts/prepare.ts` checks `isDev = process.env.NODE_ENV !== 'production'` and enters `chokidar.watch` (never exits) in dev mode — without it the chain hangs forever at `build:prepare`. Full manual build: `NODE_ENV=production node_modules/.bin/rimraf --glob extension 'extension.*' && NODE_ENV=production node_modules/.bin/vite build && NODE_ENV=production node_modules/.bin/esno scripts/prepare.ts && NODE_ENV=production node_modules/.bin/vite build --config vite.config.content.ts && NODE_ENV=production node_modules/.bin/tsup && NODE_ENV=production node_modules/.bin/esno scripts/ascii.ts`.
>
> **vitest**: `node_modules/.bin/vitest run <path>`(单进程跑;长任务给 `timeout`)。`vite.config.ts` 的 `test:{globals:true,environment:'jsdom'}` + AutoImport → 测试里 `ref/computed` 自动导入、`document/window` 可用。⚠️ vitest **root=src**(sharedConfig),测试文件**必须在 src 下**才被 `**/*.{test,spec}.*` include 命中(放项目根 `test/` 会 "No test files found")。用显式 `import { describe, it, expect } from 'vitest'`(globals 类型未进 tsconfig `types`),否则 vue-tsc 报错。测试文件不被生产 entry 引用 → 不进 content IIFE,typecheck 计数不变。

```bash
pnpm install         # install dependencies
pnpm build           # production build → extension/ (Chrome)
pnpm build-firefox   # production build → extension-firefox/
pnpm dev             # dev mode with HMR (Chrome)
pnpm dev-firefox     # dev mode (Firefox)
pnpm typecheck       # vue-tsc (no --noEmit flag; ~58 pre-existing errors, watch the delta)
pnpm lint            # eslint
pnpm lint:fix        # eslint --fix
pnpm test            # vitest test
pnpm knip            # find unused exports / dependencies
pnpm pack            # package extension.zip + extension.crx
```

Load unpacked: Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.

## Architecture

GuluGulu is a **browser extension (Manifest V3)** that replaces Luogu (洛谷) pages with a Vue 3 SPA inside a **Shadow DOM**.

### Entry Points

| File | Role |
|------|------|
| `src/contentScripts/index.ts` | Injected at `document_start`. Clears body, creates Shadow DOM, mounts Vue app. Handles URL routing, CSRF extraction, auth. **bfcache**: this script does NOT re-run on browser back/forward — a `pageshow(persisted)` handler re-injects when `#guly` is absent and the URL is supported (`currentUrl` is `let`, refreshed in that handler since it's stale post-restore). |
| `src/background/index.ts` | Background service worker. Proxies API calls via `apiListenerFactory`. |
| `src/inject/index.js` | Injected into page context. Monkey-patches `history.pushState/replaceState` to dispatch `historyChange` events. |
| `src/options/`, `src/popup/` | Extension options page and toolbar popup. |

### Build Pipeline

```
npm run build:
  1. vite build             → options + popup HTML
  2. scripts/prepare.ts     → generates manifest.json
  3. vite build --config vite.config.content.ts  → content script (index.global.js)
  4. tsup                   → background worker
  5. scripts/ascii.ts       → escapes non-ASCII for Chrome CSP

`scripts/prepare.ts` also copies `katex/dist/katex.mjs` + its woff2 fonts into `extension/assets/`. katex is **externalized** — loaded at runtime from this web-accessible resource (not bundled in the content IIFE), saving ~270KB. See `ensureKatex()` in `src/utils/markdown.ts`. (Externalizing CodeMirror the same way was measured-and-rejected — the re-export bundle loses tree-shaking.)
```

### Data Flow

Luogu pages embed server data in `<script id="lentille-context" type="application/json">`. This contains `data.problem`, `data.contest`, `data.team`, etc. plus `data.lastCode`/`data.lastLanguage` (saved user code) and `user.*` (login info).

- **Content script** fetches from Luogu pages (`credentials:'same-origin'` → sends cookies), parses HTML for `lentille-context` JSON.
- **Background** service worker proxies list endpoints (`PROBLEM.getList` / `RANKING.getList` / `CONTEST.getList` / `HOME.logout` ...) via `apiListenerFactory` in `background/utils.ts` (the old `doRequest()` + EJS template infra was removed). The SW origin is `chrome-extension://<id>`, so `fetch` is cross-origin → handlers MUST use `credentials: 'include'` to send the `C3VK` WAF cookie (manifest declares `cookies` + luogu host perms); without it Luogu returns 302 and no `lentille-context`.

### Key Patterns

- **Colors** — All use `var(--bew-*)` which auto-switch with `.dark`: `--bew-content` (card bg), `--bew-fill-1` (input bg), `--bew-text-1/2/3` (text), `--bew-border-color`, `--bew-theme-color`.
- **Code block palette** — `--code-*` vars (`src/styles/variables.scss`) are theme-aware: light = GitHub light (`--code-keyword #d73a49` …), dark = One Dark (`#c678dd` …), matching the CodeMirror IDE (`useCodeMirror.ts`: `isDark ? oneDarkHighlightStyle : defaultHighlightStyle`). Code blocks use a **solid** `var(--code-bg)` (`#f6f8fa` / `#282c34`), not the translucent `--bew-fill-1`. Note: `problemContent.scss` is `@import`ed into ProblemDetail's scoped `<style>`, so its `.hljs-*` rules do **not** pierce `v-html` spans — `Solution.vue` uses `:deep()` instead, which does.
- **UnoCSS attributify** — `bg="$bew-content"`, `rounded="$bew-radius"`, `flex="~ items-center gap-2"`, `border="1 $bew-border-color"`. ⚠️ attributify **不认裸 `var()`**:`bg="var(--bew-error-color)"` 不生成规则 → 背景缺失(白字透明)。用别名 `bg="$bew-error-color"` 或 inline `style="background:var(--bew-error-color)"`。
- **CSRF** — Token from `<meta name="csrf-token">`, stored in `window.__guly_user.csrfToken`, used in `X-CSRF-TOKEN` header for POST/DELETE.

### Theme Switching

`useDark.ts` 用 **View Transition API** 做扩散切换:`document.startViewTransition(() => { flipTheme(); setAppAppearance() })`,对 `::view-transition-new(root)` 做 clip-path 圆扩散(圆内=新主题、圆外=旧主题快照,两侧都是原生渲染内容)。**关键**:VT 回调内必须**同步**改 DOM(直接调 `setAppAppearance()`,不能只改 reactive setting 等 watch 异步施加),否则 VT 捕获的新旧一致 → 无过渡。⚠️ 曾试过 `captureVisibleTab` 截旧画面做覆盖层,但 MV3 它要求 `activeTab`/`<all_urls>`,而**内容脚本里的按钮点击不授予 activeTab**(只认扩展图标/快捷键/右键菜单手势)→ 权限被否决,已弃用。`ThemeReveal.vue` 现仅作无 VT 浏览器的回退(VT 可用时 watch 早返回)。⚠️ **分数缩放偏移(待精确补偿)**:VT 在分数 `devicePixelRatio`(110/125/150/166% 等)下,设备像素↔CSS px 重投影把快照整体偏移 → clip-path 圆心比点击点高/偏(commit `85d22f2` 当年为此弃 VT,后为"圆内外真实内容"又换回 `b5be430`)。曾试 `78b939d` 在分数 dpr 退化成交叉淡入躲偏移,但用户要"扩散收回"→ `d801f32` 撤销、圆扩散全开。现 `toggleDark` 的 `t.ready` 在分数 dpr 下 `console.debug('[guly-vt-offset]', …)` 记录 `::view-transition-group/new(root)` 几何 + 点击坐标,**据此精确补偿圆心**(临时日志,补偿落地后删)。clip 的 `animation:none` CSS 只在 `html.guly-vt-clip` 类下生效(单一 style 元素)。

### URL → Page Routing

`getActivatedPage()` in `contentScripts/index.ts` maps URL regex to `AppPage` enum. Key patterns: `/problem/P1001` → ProblemDetail, `/contest/337891` → ContestDetail, `/team/*` → Team, `/discuss/*` → Blog.

### ProblemDetail & IDE Mode

The largest view (~960 lines, decomposed into 7 composables under `composables/` — `useProblemData`, `useProblemSubmit`, `useSelfTest`, `useCodePersistence`, `useContestMode`, `useSolutions`, `useSplitView` — plus `components/SolutionsTab.vue` & `DiscussionsTab.vue`). Key features:
- Problem statement with markdown (`marked` + `highlight.js` + externalized `katex`)
- Code submission via `POST /fe/api/problem/submit/{pid}` with CSRF
- **IDE split-view**: toggled by `ideMode` ref. **Manual only** (`ideMode = ref(false)`): 进 IDE 只靠顶栏 IDE 按钮或 URL `#ide` hash 手动触发;曾因 `?contestId=`/`#ide` 自动进,已按需求(所有题目默认普通页)移除。Left panel = problem statement, right panel = code editor with lang selector, self-test input/output/expected panels, submit button. Toggle via `showTestPanel` ref.
- **Saved code**: reads `data.lastCode` / `data.lastLanguage` from lentille-context on mount
- **Contest mode**: detects `?contestId=` in URL, hides solutions/discussions tabs, shows problem switcher (A/B/C/D/E)
- **Solutions tab**: lazy-loaded by `useSolutions` — fetches `/problem/solution/{pid}` **HTML** (solutions live in the lentille-context, NOT in the `?_contentOnly=1` JSON); a 401 → "需要登录". A standalone full-page `Solution.vue` (`AppPage.Solution`, route `/problem/solution/*`) renders the same content with `.markdown-body` code blocks.

### Luogu API Notes (as of 2026-07)

- **Register**: `POST /fe/api/contest/join/{id}` + body `{}` + `Content-Type: application/json` + `X-CSRF-TOKEN` + `X-Requested-With`. Returns `{id: N}` on success.
- **Cancel**: `DELETE /fe/api/contest/join/{id}` — may not be supported by Luogu.
- **Problem samples**: Raw `[[input, output], ...]` tuples, parsed to `{input, output, explanation}` objects.
- **Contest problems**: `contestProblems` array in lentille-context: `{score, problem: {pid, name, difficulty}, no: "A"}`.
- **Team homework**: Stored under `data.trainings` key. Items: `{id, name, type, deadline, problemCount, markCount}`.
- **Record detail** (2026-07-22 实测): `/record/{rid}` 的 lentille `data.record` 含 `detail.{compileResult,judgeResult}`(`judgeResult.subtasks[].testCases[].status` 用与 record 级相同的 0-14 枚举:12=AC/7=TLE/8=MLE/9=RE/5,6,14=WA/10=CE);`pollRecordVerdict` 同源已验证。⚠️ **`/record/{rid}` 的 HTML 不含 lentille**(2026-07-22 实测 `hasLentille=false`,5855B SPA 壳),详情数据在 `?_contentOnly=1` 的 JSON(`data.record`,含 `detail.{compileResult,judgeResult,version}`);`Record.vue` 的 `fetchDetail` 与列表的 `resolvePendingStatuses` 都走 `_contentOnly=1`(别用 `fetchLentilleContext` 读 record 详情,必拿空)。洛谷 CE 时 `record.status` 常卡 Compiling(2) 不翻 → 用 `derivedRecordStatus(record)`(luogu-api.ts,已导出)从 `detail` 推导真实终态;`effectiveStatus` 与轮询条件都改用它。verdict 逻辑有单元测试 `src/utils/luogu-api.verdict.test.ts`。
- **记录列表 status 对 CE 不可靠(2026-07-22 实测)**:`/record/list?_contentOnly=1` 的 `data.records.result[]` item 字段仅 `{time,memory,problem,contest,sourceCodeLength,submitTime,language,user,id,status,enableO2,score}`,**无 `detail`**(`firstHasDetail=false`),且 CE 记录的 `status` **永久卡 Compiling(2)** 不翻(连旧记录也是 2,AC 才是 12)。列表 item 推不出 CE → `Record.vue` 的 `resolvePendingStatuses` 在 `fetchRecords` 后对 pending(0-3)记录**后台拉 `/record/{rid}` 详情**,用 `derivedRecordStatus` 推真实终态(CE→10 等)回填 `status/score/time/memory`(有界并发 4,出错跳过,不阻塞首屏)。`records` 是 `shallowRef`,回填须整体重赋数组才触发渲染。
- **Team usages**: `usages.training` covers both training + homework; no separate `usages.homework`.
- **C3VK WAF (2026-07)**: list pages (`/problem/list`, `/ranking`, `/contest/list`) are gated by an nginx WAF — no `C3VK` cookie ⇒ HTTP 302, no `lentille-context`. Background SW fetch needs `credentials:'include'`; content-script fetch is same-origin so `credentials:'same-origin'` is enough. `home.ts` already preserves `C3VK`.
- **Submit endpoints (2026-07)**: both problem and contest submit use `POST /fe/api/problem/submit/{pid}`; a contest submit appends `?contestId={id}` as a query param (the old `POST /fe/api/contest/submit/{cid}/{pid}` route 404s). `submitCode()` in `src/utils/luogu-api.ts` routes via an optional `contestId` arg, lazily refreshes CSRF (`refreshCsrf()`) on 403 / 会话超时, and shares captcha / Cloudflare(503) / auth(403) / network(0) handling.
- **lentille-context paths (new format `{instance,template,data,user,time}`)**: problem list → `data.problems.result[]`, count → `data.problems.count`; problem detail → `data.problem`; `fetchLentilleContext()` returns the raw ctx, so front-end reads `ctx.data.*`.
- **`src/utils/luogu-api.ts` is content-script only**: it has module-level Vue refs and `document`/`window` references, so it CANNOT be imported in the background SW — keep hand-written `fetch` in background handlers.
