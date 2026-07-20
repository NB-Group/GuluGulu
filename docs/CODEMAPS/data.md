<!-- Generated: 2026-07-18 | Token estimate: ~600 -->

# Data Shapes

## lentille-context（洛谷页面内嵌 JSON）

```
{ instance, template, status, locale, data, user, time }
```
- `data.problem`（详情）、`data.problems.{result[],count}`（列表）
- `data.contest` / `contestProblems[{score,problem:{pid,name,difficulty},no}]`
- `data.scoreboard`（API `/fe/api/contest/scoreboard`）：`result[].{details:{pid:{score,runningTime}}, user, score}` — 每题分在 `details[pid].score`
- `data.team` / `data.trainings.{result,count}`（题单列表）/ `usages.training=[used,limit]`
- `data.lastCode` / `lastLanguage` / `lastCodeAt`（= 上次**提交**的代码，洛谷无草稿端点）
- `user.{uid,...}` 登录态

新格式 `{instance,template,data,user,time}`；旧 `currentData` 仍兼容。

## 扩展本地存储

- `localStorage["guly:code:{pid}"] = {code,lang,ts}` — IDE 代码草稿（按 pid，洛谷草稿载入优先）
- `localStorage["gulugulu-dark"]` — 深浅色
- 持久化设置：`useStorageLocal`（`logic/storage.ts` Settings，含 `dockCollapsed`/`dockPosition`/`pageMaxWidth`/`themeColor`/`dockItemsConfig[]` 等）

## 类型

`luogu-api.d.ts`（社区 0f-0b/luogu-api-docs）有完整类型；本仓按需内联。
