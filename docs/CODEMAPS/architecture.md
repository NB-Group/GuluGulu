<!-- Generated: 2026-07-18 | Project: GuluGulu (MV3 洛谷增强扩展) | Token estimate: ~700 -->

# Architecture

洛谷页面替换型扩展：清空 body，在 open Shadow DOM (`#guly`) 内挂 Vue 3 SPA。

## 入口

| 文件 | 角色 |
|------|------|
| `src/contentScripts/index.ts` | `document_start` 注入。清 body、建 Shadow DOM、挂 Vue、URL 路由 (`getActivatedPage`)、提取 CSRF/uid 注入 `window.__guly_user` |
| `src/background/index.ts` | MV3 service worker。`apiListenerFactory` 代理列表端点（跨域→必须 `credentials:'include'` 带 C3VK cookie） |
| `src/inject/index.js` | 页面上下文。hook `history.pushState/replaceState` 派发 `historyChange`（SPA 导航） |
| `src/options/` `src/popup/` | 设置页 / 工具栏弹窗 |

## 构建管线 (`pnpm run build`)

```
vite build (options+popup) → scripts/prepare.ts (manifest) →
vite build --config vite.config.content.ts (index.global.js) →
tsup (background) → scripts/ascii.ts (非 ASCII 转义, Chrome CSP)
```

## 数据流

```
洛谷 HTML ─ <script id="lentille-context" type="application/json"> ─ 内容脚本解析 ─ Vue SPA
                                                          └ data.{problem,contest,team,...} + lastCode + user
```

- 内容脚本与洛谷同源 → `credentials:'same-origin'`
- 背景 SW 跨域 → 必须 `credentials:'include'`（C3VK WAF）
- `luogu-api.ts` 仅内容脚本侧（含模块级 ref + document/window，不可在 SW 用）

## 关键约束

- **C3VK WAF**：列表页 (`/problem/list`、`/ranking`、`/contest/list`) 无 C3VK → 302，无 lentille-context
- **CSRF**：`<meta name="csrf-token">` → `window.__guly_user.csrfToken` → `X-CSRF-TOKEN`；长挂机过期，`refreshCsrf()` 懒刷新重试
- Shadow DOM open：`#guly`.shadowRoot 直接可查
