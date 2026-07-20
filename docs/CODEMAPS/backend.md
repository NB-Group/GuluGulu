<!-- Generated: 2026-07-18 | Token estimate: ~750 -->

# Background SW + Luogu API

## SW 消息分发

`background/index.ts` → `apiListenerFactory(FullAPI)` (`background/utils.ts`)：按 `message.contentScriptQuery` 路由到 handler。

| handler 文件 | 查询 | 说明 |
|---|---|---|
| `api/problem.ts` | `PROBLEM.getList` | `/problem/list`（需 C3VK） |
| `api/ranking.ts` | `RANKING.getList` | `/ranking`（需 C3VK） |
| `api/contest.ts` | `CONTEST.getList` | `/contest/list`（需 C3VK） |
| `api/home.ts` | `HOME.logout` 等 | 首页相关，保留 C3VK |
| `tabs.ts` | `openOptionsPage` | 打开设置页 |

受限页 handler 返回 `{__needLogin:true}`（前端 Ranking/ContestList/ProblemList/Search 已消费）。

## Luogu API 端点（内容脚本侧 `utils/luogu-api.ts`）

```
GET  /problem/:pid?_contentOnly=1            题目（lentille）
GET  /problem/list                            题单(SW, C3VK)
GET  /problem/solution/:pid                   题解列表
POST /fe/api/problem/submit/:pid?contestId=   提交（竞赛用 query 参；/fe/api/contest/submit/:cid/:pid 已 404）
GET  /fe/api/contest/scoreboard/:id?page=     记分板（每题分在 row.details[pid].score）
POST /fe/api/contest/join/:id                 报名（{}, +CSRF+X-Requested-With）
GET  /contest/:id  /contest/list              比赛（SW list 需 C3VK）
POST /api/ide_submit + wss://ws.luogu.com.cn/ws   IDE 自测（运行+WS 评测回传）
GET  /_lfe/tags                               标签字典 id→算法名（未 WAF）
POST /index/ajax_punch                        打卡（{code,message}；运势仅首页 HTML 解析）
```

## CSRF

`getCsrfToken()` 取 `<meta csrf-token>`（启动时重注入）→ 回退 `__guly_user.csrfToken`。`refreshCsrf()`：fetch `/` 重解析 meta；`submitCode` 遇 403(非验证码)/会话超时刷新重试一次。
