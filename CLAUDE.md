# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

> Package manager is **pnpm** (`packageManager: pnpm@9.5.0` in `package.json`). `npm` will fail — use `pnpm`. If `pnpm` itself is broken (corepack version mismatch), the underlying tools run fine straight from `node_modules/.bin/` — e.g. `node_modules/.bin/vite build --config vite.config.content.ts`, `node_modules/.bin/esno scripts/ascii.ts`, `node_modules/.bin/vue-tsc --noEmit`.

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
- **UnoCSS attributify** — `bg="$bew-content"`, `rounded="$bew-radius"`, `flex="~ items-center gap-2"`, `border="1 $bew-border-color"`.
- **CSRF** — Token from `<meta name="csrf-token">`, stored in `window.__guly_user.csrfToken`, used in `X-CSRF-TOKEN` header for POST/DELETE.

### URL → Page Routing

`getActivatedPage()` in `contentScripts/index.ts` maps URL regex to `AppPage` enum. Key patterns: `/problem/P1001` → ProblemDetail, `/contest/337891` → ContestDetail, `/team/*` → Team, `/discuss/*` → Blog.

### ProblemDetail & IDE Mode

The largest view (~960 lines, decomposed into 7 composables under `composables/` — `useProblemData`, `useProblemSubmit`, `useSelfTest`, `useCodePersistence`, `useContestMode`, `useSolutions`, `useSplitView` — plus `components/SolutionsTab.vue` & `DiscussionsTab.vue`). Key features:
- Problem statement with markdown (`marked` + `highlight.js` + externalized `katex`)
- Code submission via `POST /fe/api/problem/submit/{pid}` with CSRF
- **IDE split-view**: toggled by `ideMode` ref (or auto for `?contestId=`). Left panel = problem statement, right panel = code editor with lang selector, self-test input/output/expected panels, submit button. Toggle via `showTestPanel` ref.
- **Saved code**: reads `data.lastCode` / `data.lastLanguage` from lentille-context on mount
- **Contest mode**: detects `?contestId=` in URL, hides solutions/discussions tabs, shows problem switcher (A/B/C/D/E)
- **Solutions tab**: lazy-loaded by `useSolutions` — fetches `/problem/solution/{pid}` **HTML** (solutions live in the lentille-context, NOT in the `?_contentOnly=1` JSON); a 401 → "需要登录". A standalone full-page `Solution.vue` (`AppPage.Solution`, route `/problem/solution/*`) renders the same content with `.markdown-body` code blocks.

### Luogu API Notes (as of 2026-07)

- **Register**: `POST /fe/api/contest/join/{id}` + body `{}` + `Content-Type: application/json` + `X-CSRF-TOKEN` + `X-Requested-With`. Returns `{id: N}` on success.
- **Cancel**: `DELETE /fe/api/contest/join/{id}` — may not be supported by Luogu.
- **Problem samples**: Raw `[[input, output], ...]` tuples, parsed to `{input, output, explanation}` objects.
- **Contest problems**: `contestProblems` array in lentille-context: `{score, problem: {pid, name, difficulty}, no: "A"}`.
- **Team homework**: Stored under `data.trainings` key. Items: `{id, name, type, deadline, problemCount, markCount}`.
- **Team usages**: `usages.training` covers both training + homework; no separate `usages.homework`.
- **C3VK WAF (2026-07)**: list pages (`/problem/list`, `/ranking`, `/contest/list`) are gated by an nginx WAF — no `C3VK` cookie ⇒ HTTP 302, no `lentille-context`. Background SW fetch needs `credentials:'include'`; content-script fetch is same-origin so `credentials:'same-origin'` is enough. `home.ts` already preserves `C3VK`.
- **Submit endpoints (2026-07)**: both problem and contest submit use `POST /fe/api/problem/submit/{pid}`; a contest submit appends `?contestId={id}` as a query param (the old `POST /fe/api/contest/submit/{cid}/{pid}` route 404s). `submitCode()` in `src/utils/luogu-api.ts` routes via an optional `contestId` arg, lazily refreshes CSRF (`refreshCsrf()`) on 403 / 会话超时, and shares captcha / Cloudflare(503) / auth(403) / network(0) handling.
- **lentille-context paths (new format `{instance,template,data,user,time}`)**: problem list → `data.problems.result[]`, count → `data.problems.count`; problem detail → `data.problem`; `fetchLentilleContext()` returns the raw ctx, so front-end reads `ctx.data.*`.
- **`src/utils/luogu-api.ts` is content-script only**: it has module-level Vue refs and `document`/`window` references, so it CANNOT be imported in the background SW — keep hand-written `fetch` in background handlers.
