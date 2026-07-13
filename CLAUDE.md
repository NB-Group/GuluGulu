# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install          # install dependencies
npm run build        # production build → extension/
npm run dev          # dev mode with HMR (Chrome)
npm run dev-firefox  # dev mode (Firefox)
npm run typecheck    # vue-tsc --noEmit
npm run lint         # eslint
npm run pack         # package extension.zip + extension.crx
```

Load unpacked: Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.

## Architecture

GuluGulu is a **browser extension (Manifest V3)** that replaces Luogu (洛谷) pages with a Vue 3 SPA inside a **Shadow DOM**.

### Entry Points

| File | Role |
|------|------|
| `src/contentScripts/index.ts` | Injected at `document_start`. Clears body, creates Shadow DOM, mounts Vue app. Handles URL routing, CSRF extraction, auth. |
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
```

### Data Flow

Luogu pages embed server data in `<script id="lentille-context" type="application/json">`. This contains `data.problem`, `data.contest`, `data.team`, etc. plus `data.lastCode`/`data.lastLanguage` (saved user code) and `user.*` (login info).

- **Content script** fetches from Luogu pages (`credentials:'same-origin'` → sends cookies), parses HTML for `lentille-context` JSON.
- **Background** fetches public endpoints (`credentials:'omit'`) via `doRequest()` in `background/utils.ts` with EJS-style `<%= key %>` template substitution.

### Key Patterns

- **Colors** — All use `var(--bew-*)` which auto-switch with `.dark`: `--bew-content` (card bg), `--bew-fill-1` (input bg), `--bew-text-1/2/3` (text), `--bew-border-color`, `--bew-theme-color`.
- **UnoCSS attributify** — `bg="$bew-content"`, `rounded="$bew-radius"`, `flex="~ items-center gap-2"`, `border="1 $bew-border-color"`.
- **CSRF** — Token from `<meta name="csrf-token">`, stored in `window.__guly_user.csrfToken`, used in `X-CSRF-TOKEN` header for POST/DELETE.

### URL → Page Routing

`getActivatedPage()` in `contentScripts/index.ts` maps URL regex to `AppPage` enum. Key patterns: `/problem/P1001` → ProblemDetail, `/contest/337891` → ContestDetail, `/team/*` → Team, `/discuss/*` → Blog.

### ProblemDetail & IDE Mode

The largest component (~900 lines). Key features:
- Problem statement with markdown (`marked` + `highlight.js` + `katex`)
- Code submission via `POST /fe/api/problem/submit/{pid}` with CSRF
- **IDE split-view**: toggled by `ideMode` ref (or auto for `?contestId=`). Left panel = problem statement, right panel = code editor with lang selector, self-test input/output/expected panels, submit button. Toggle via `showTestPanel` ref.
- **Saved code**: reads `data.lastCode` / `data.lastLanguage` from lentille-context on mount
- **Contest mode**: detects `?contestId=` in URL, hides solutions/discussions tabs, shows problem switcher (A/B/C/D/E)

### Luogu API Notes (as of 2026-07)

- **Register**: `POST /fe/api/contest/join/{id}` + body `{}` + `Content-Type: application/json` + `X-CSRF-TOKEN` + `X-Requested-With`. Returns `{id: N}` on success.
- **Cancel**: `DELETE /fe/api/contest/join/{id}` — may not be supported by Luogu.
- **Problem samples**: Raw `[[input, output], ...]` tuples, parsed to `{input, output, explanation}` objects.
- **Contest problems**: `contestProblems` array in lentille-context: `{score, problem: {pid, name, difficulty}, no: "A"}`.
- **Team homework**: Stored under `data.trainings` key. Items: `{id, name, type, deadline, problemCount, markCount}`.
- **Team usages**: `usages.training` covers both training + homework; no separate `usages.homework`.
