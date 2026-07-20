# GuluGulu — 开发收尾备忘

> 最近更新：2026-07-18　·　分支 `master`，可靠性三件套 (B1/B2/B3) 已实现待提交，`pnpm build` 绿

## 本轮已修（4 commit）
- `0950ec5` IDE 分屏视图提交反馈可见 + 修 captcha 清除的 `.value` 模板 bug
- `1a29a78` ContestDetail 提交补全 验证码/CF/鉴权 处理（`submitCode` 加可选 `contestId` 路由）
- `924bd12` Search 页 mock 占位 → 真实 `/problem/list?keyword=` 拉取
- `3f6b115` background 列表 handler 加 `credentials:'include'`（绕 C3VK WAF）

验证：`pnpm build` 绿；`pnpm typecheck` 约 58 个**既有**错误，本轮净增 0。

## 待办候选（非阻塞，按建议优先级）
1. ~~**silent `catch {}` 散落多处**~~ — ✅ 已修 (2026-07-18)：36 处空 catch 补 `console.warn('[GuluGulu]', e)`（`useDark`/`useMessagePolling` 故意保留降级/防刷屏，跳过）。
2. ~~**登录态不刷新**~~ — 🟡 部分修：`refreshCsrf()` 在提交遇 403(非验证码)/"会话超时" 时懒刷新 csrf 重试一次（缓解 csrf 过期）；**uid 登录态本身仍仅初始注入**，未做主动刷新，留作后续。
3. ~~**前端消费 `__needLogin`**~~ — ✅ 已修：`Ranking.vue`/`ContestList.vue`/`ProblemList.vue`/`Solution.vue` 均判断 `__needLogin` 显示"需要登录洛谷才能查看"。
4. **Search 扩展** — 仅实现题目搜索；用户/博客/题解搜索未做。

## 关键技术备忘（避免重新踩坑）
- **C3VK WAF**：洛谷列表页（`/problem/list`、`/ranking`、`contest/list`）被 nginx WAF 挡，无 `C3VK` cookie 返回 302。background service worker 跨域，必须 `credentials:'include'`；内容脚本与洛谷同源，`same-origin` 即可。`home.ts` 早已保留 `C3VK`。
- **竞赛提交端点**：旧 `POST /fe/api/contest/submit/{cid}/{pid}` 已 404；实际两者都走 `POST /fe/api/problem/submit/{pid}`，竞赛用 `?contestId=` query 参数。`submitCode()` 用可选 `contestId` 拼 query，共用错误处理；并加 `refreshCsrf()` 在 403/会话超时懒刷新重试一次。
- **lentille-context 数据路径**：新格式 `{instance,template,data,user,time}`；题目列表在 `data.problems.result[]`、count 在 `data.problems.count`。`fetchLentilleContext` 返回原始 ctx，前端取 `ctx.data.xxx`。
- **`luogu-api.ts` 不能在 service worker 用**：含模块级 Vue ref + `document`/`window` 引用，只能内容脚本侧用。
- **验证命令**：`pnpm typecheck`（注意约 58 个既有错误，看净增量）、`pnpm build`、`pnpm knip`。

## 恢复方式
从上面待办挑一项；或在洛谷页面加载扩展实测各流程（验证码、竞赛提交、搜索、列表）。
