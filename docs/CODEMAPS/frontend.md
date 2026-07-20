<!-- Generated: 2026-07-20 | Token estimate: ~850 -->

# Frontend (Vue 3 SPA)

## 路由

`getActivatedPage()` (contentScripts/index.ts) URL 正则 → `AppPage` 枚举；`App.vue` 把 `AppPage` → `defineAsyncComponent`。

```
/problem/P1001        → ProblemDetail
/problem/             → ProblemList (list)
/contest/<id>         → ContestDetail   /contest/list → ContestList
/ranking              → Ranking         /user/<id> → UserProfile
/                     → Home            /discuss/* → Blog
/problem/solution/*   → Solution        /training/* → Training
/team/*               → Team            /record/* → Record
```

全部页：Home, ProblemList/Detail, ContestList/Detail, Ranking, UserProfile, Search, Training, Team, Record, Login, Messages, Solution, Article, MyProblems, MyContests, TrainingFav, Notification, Practice, Blog。

## 组件

- 壳层：`Dock`（可收起 `dockCollapsed`）、`TopBar`、`Settings`、`AppBackground`
- 卡片：`ProblemCard`、`ContestCard`、`SearchBar`
- 基础：`Button/Input/Select/Dialog/Loading/Empty/Tooltip/Slider`
- 滚动：`OverlayScrollbarsComponent`（`.os-viewport` 为竖向滚动容器）

## 大组件分解（ProblemDetail，2026-07-20 R1–R4）

`ProblemDetail.vue` (1515→1010 行) 拆出 5 composable + 2 子组件，父组件保留 IDE 分屏视图状态 / `solutions`·`loadSolutions`(懒加载) / `tabs` / copy 系列 / 模板。

| 模块 | 路径 | 职责 |
|------|------|------|
| `useProblemData` | composables/useProblemData.ts | 拉取/归一化 lentille-context、tagMap、difficultyMap、派生 difficultyColor/passRate/renderedDescription/Hint；草稿写回 codeContent/selectedLang |
| `useProblemSubmit` | composables/useProblemSubmit.ts | 提交态/验证码/submitHistory/myRecords/handleSubmit/resetSubmit |
| `useSelfTest` | composables/useSelfTest.ts | IDE 自测（`/api/ide_submit` + `wss://ws.luogu.com.cn/ws` 评测回传） |
| `useCodePersistence` | composables/useCodePersistence.ts | localStorage `guly:code:{pid}` 草稿存取 + 防抖落盘 |
| `useContestMode` | composables/useContestMode.ts | 竞赛题目列表 + 切换器（`?contestId=`） |
| `SolutionsTab` / `DiscussionsTab` | components/*.vue | 题解 / 讨论标签页子组件（props 接数据，父控 activeTab） |

## 状态

- Pinia：`stores/mainStore.ts`（dockItems/路由 URL 映射）、`stores/settingsStore.ts`
- 设置持久化：`useStorageLocal`（`src/logic/storage.ts` 的 `Settings` 接口 + `originalSettings`）
- 事件总线：`mitt`（`utils/mitt.ts`）

## 约定

- UnoCSS attributify：`bg="$bew-content"`、`flex="~ items-center gap-2"`、响应式 `lg:`(1024)/`md:`(768)
- 颜色 `var(--bew-*)` 随 `.dark` 切换；主题色 `--bew-theme-color` + 自动色阶 `-10..-90`
- 组合式：`useAppProvider`(navigateTo/currentUrl)、`useCodeMirror`、`useDark`、`useMessagePolling`、`useDelayedHover`、`useStorageLocal`(设置持久化)
