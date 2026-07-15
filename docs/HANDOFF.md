# GuluGulu — 开发收尾备忘

> 最近更新：2026-07-15　·　分支 `master`，工作树干净，`npm run build` 绿

## 本轮已修（4 commit）
- `0950ec5` IDE 分屏视图提交反馈可见 + 修 captcha 清除的 `.value` 模板 bug
- `1a29a78` ContestDetail 提交补全 验证码/CF/鉴权 处理（`submitCode` 加可选 `contestId` 路由）
- `924bd12` Search 页 mock 占位 → 真实 `/problem/list?keyword=` 拉取
- `3f6b115` background 列表 handler 加 `credentials:'include'`（绕 C3VK WAF）

验证：`npm run build` 绿；`npm run typecheck` 约 58 个**既有**错误，本轮净增 0。

## 待办候选（非阻塞，按建议优先级）
1. **silent `catch {}` 散落多处** — 多个文件空 catch 吞错误无日志，排障困难。至少补 `console.warn`。
2. **登录态不刷新** — `window.__guly_user` 仅初始注入时取一次，长时间挂机后 uid/csrf 可能过期。
3. **前端消费 `__needLogin`** — background 的 problem/ranking/contest handler 已会返回 `{__needLogin:true}`，但 `Ranking.vue`/`ContestList.vue`/`ProblemList.vue` 未判断，会显示"数据格式不匹配"。主修复（`credentials:'include'`）已让公开页返回真实数据，此项是防御性收尾。
4. **Search 扩展** — 仅实现题目搜索；用户/博客/题解搜索未做。

## 关键技术备忘（避免重新踩坑）
- **C3VK WAF**：洛谷列表页（`/problem/list`、`/ranking`、`contest/list`）被 nginx WAF 挡，无 `C3VK` cookie 返回 302。background service worker 跨域，必须 `credentials:'include'`；内容脚本与洛谷同源，`same-origin` 即可。`home.ts` 早已保留 `C3VK`。
- **竞赛提交端点不同**：`POST /fe/api/contest/submit/{contestId}/{pid}` vs 普通 `/fe/api/problem/submit/{pid}`。`submitCode()` 用可选 `contestId` 参数路由，两者共用错误处理。
- **lentille-context 数据路径**：新格式 `{instance,template,data,user,time}`；题目列表在 `data.problems.result[]`、count 在 `data.problems.count`。`fetchLentilleContext` 返回原始 ctx，前端取 `ctx.data.xxx`。
- **`luogu-api.ts` 不能在 service worker 用**：含模块级 Vue ref + `document`/`window` 引用，只能内容脚本侧用。
- **验证命令**：`npm run typecheck`（注意约 58 个既有错误，看净增量）、`npm run build`。

## 恢复方式
从上面待办挑一项；或在洛谷页面加载扩展实测各流程（验证码、竞赛提交、搜索、列表）。
