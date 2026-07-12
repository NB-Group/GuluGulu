# 洛谷 API 逆向参考

> GuluGulu 用到的所有洛谷接口，按功能域分组。
> 更新日期: 2026-07-10

---

## 通用机制

### 数据提取方式

| 方式 | 说明 |
|------|------|
| `lentille-context` | 页面 HTML 中 `<script id="lentille-context" type="application/json">` 内的 JSON |
| `_contentOnly=1` | URL 参数，返回纯 JSON 而非 HTML |
| `fe/api/` | RESTful API 前缀，返回 JSON |
| `ajax_punch` | 老的 AJAX 接口 |

### 认证

| 方式 | 说明 |
|------|------|
| Cookie | 浏览器自动携带 (`credentials: 'same-origin'`)，content script 可用 |
| CSRF Token | 从 `<meta name="csrf-token">` 读取，写作 `X-CSRF-TOKEN` header |
| `X-Requested-With: XMLHttpRequest` | 部分 POST 接口需要，洛谷用此区分 AJAX/页面请求 |
| `__guly_user` | GuluGulu 注入的全局对象，存储 uid/name/csrfToken |

### 用户头像 CDN

```
https://cdn.luogu.com.cn/upload/usericon/{uid}.png
```

---

## 首页

### `GET /` — 首页
**来源**: `Home.vue`, `CheckInCalendar.vue`
**认证**: 可选
**响应**: lentille-context → `ctx.currentData`

```json
{
  "currentData": {
    "bulletin": { "html": "..." },
    "punch": { "enabled": true, "history": [{"finished": true, "time": 1751443200}, ...] },
    "rankingList": {  "result": [{"user": {...}, "ranking": 1}] },
    "recommendedContests": { "featured": [...] },
    "loginState": { "user": {"uid": 123, "name": "...", "avatar": "..."} },
    "recentContests": { "result": [{"id": 123, "name": "...", "startTime": ..., "endTime": ..., "rated": 1, "ruleType": 1}] },
    "hotProblems": { "result": [{"pid": "P1001", "title": "...", "difficulty": 1, "totalSubmit": 100, "totalAccepted": 50}] },
    "recentDiscussions": { "result": [{"id": 123, "title": "...", "Forum": {...}, "author": {...}, "time": ..., "replyCount": 5}] }
  }
}
```

### `POST /index/ajax_punch` — 签到
**来源**: `CheckInCalendar.vue`, `home.ts (background)`
**认证**: 需要 CSRF
**Headers**: `X-CSRF-TOKEN`, `X-Requested-With: XMLHttpRequest`, `Referer: https://www.luogu.com.cn/`
**响应**: `{ "code": 200, "msg": "..." }`

---

## 题目

### `GET /problem/list` — 题目列表
**来源**: `ProblemList.vue`, `HotProblems.vue`
**认证**: 不需要
**查询参数**: `page`, `difficulty`, `keyword`, `tag`, `type`, `order` (e.g. `order=hot`)
**响应**: lentille-context → `ctx.currentData.problems`

```json
{
  "currentData": {
    "problems": {
      "count": 10000,
      "result": [
        {
          "pid": "P1001", "title": "A+B Problem",
          "difficulty": 1, "totalSubmit": 5000, "totalAccepted": 3000,
          "tags": [1, 2], "type": "P"
        }
      ]
    }
  }
}
```

### `GET /problem/P{pid}` — 题目详情
**来源**: `ProblemDetail.vue` (via `lentille-context`)
**认证**: 不需要（查看题目），需要（提交）
**响应**: lentille-context → `ctx.currentData.problem`

```json
{
  "currentData": {
    "problem": {
      "pid": "P1001", "title": "A+B Problem", "difficulty": 1,
      "background": "## 题目背景", "description": "## 题目描述",
      "inputFormat": "## 输入格式", "outputFormat": "## 输出格式",
      "hint": "## 提示", "totalSubmit": 5000, "totalAccepted": 3000,
      "tags": [1, 2], "limits": { "time": [1000], "memory": [128] },
      "samples": [["1 2", "3"]], "languages": [3, 7, 28],
      "flag": 0, "fullScore": 100
    },
    "lastLanguage": 28,
    "lastCode": "#include <iostream>..."
  }
}
```

### `GET /problem/P{pid}?_contentOnly=1` — 题目纯数据
**来源**: `luogu-api.ts (extractProblemData)`
**响应**: JSON，结构与上面相同但仅含 data

### `POST /fe/api/problem/submit/{pid}` — 提交代码
**来源**: `luogu-api.ts (submitCode)`, `problem.ts (background)`
**认证**: CSRF + Cookie
**Headers**: `Content-Type: application/json`, `X-CSRF-TOKEN`, `X-Requested-With: XMLHttpRequest`
**Body**:
```json
{ "code": "#include...", "lang": 28, "enableO2": 0 }
```
**响应**:
```json
{ "rid": 12345678, "status": 200 }
```
错误时: `{ "errorMessage": "..." }` 或 HTTP 403（需验证码）或 `{ "data": "题目不存在" }`

### `GET /problem/solution/P{pid}` — 题解列表
**来源**: `problem.ts (background - PROBLEM.getSolution)`, `ProblemDetail.vue → navigateTo Solution`
**查询参数**: `page`
**响应**: lentille-context → `ctx.currentData.solutions`

### `GET /_lfe/tags` — 标签列表
**来源**: `problem.ts (background - PROBLEM.getTags)`
**查询参数**: `type=problem`
**响应**: JSON

---

## 比赛

### `GET /contest/list` — 比赛列表
**来源**: `ContestList.vue`, `contest.ts (background)`
**认证**: 不需要
**查询参数**: `page`
**响应**: lentille-context → `ctx.currentData.contests`

```json
{
  "currentData": {
    "contests": {
      "count": 100,
      "result": [
        { "id": 123, "name": "...", "startTime": 1750000000, "endTime": 1750086400,
          "rated": 1, "ruleType": 1, "host": {"uid": ..., "name": "..."} }
      ]
    }
  }
}
```

### `GET /contest/{id}` — 比赛详情
**来源**: `ContestDetail.vue`
**认证**: 需要（查看题目/提交）
**响应**: lentille-context

```json
{
  "currentData": {
    "contest": {
      "id": 123, "name": "...", "description": "...",
      "startTime": ..., "endTime": ..., "ruleType": 1,
      "host": {"uid": ..., "name": "..."},
      "problemCount": 4, "problems": [{"pid": "P1001", "title": "...", "score": 100}]
    },
    "contestProblems": [{"pid": "P1001", "title": "...", "score": 100}]
  }
}
```

### `GET /problem/{pid}?contestId={cid}` — 比赛中的题目详情
**来源**: `ContestDetail.vue (loadProblem)`
**需要**: `contestId` 参数
**响应**: lentille-context，结构与普通题目详情相同

### `POST /fe/api/contest/submit/{cid}/{pid}` — 比赛中提交
**来源**: `ContestDetail.vue (submitCode)`
**认证**: CSRF
**Headers**: `Content-Type: application/json`, `X-CSRF-TOKEN`
**Body**: `{ "code": "...", "lang": 28 }`
**响应**: `{ "rid": 123, "status": 200 }` 或 `{ "errorMessage": "..." }`

### `GET /fe/api/contest/scoreboard/{cid}?page={n}` — 比赛排名
**来源**: `ContestDetail.vue (fetchScoreboard)`, `contest.ts (background)`
**响应**:
```json
{
  "scoreboard": {
    "count": 100,
    "result": [
      { "user": {"uid": ..., "name": "...", "avatar": "..."},
        "score": 300, "scores": [{"score": 100, "time": 3600}, ...],
        "rank": 1 }
    ]
  }
}
```

### `POST /fe/api/contest/registration/{cid}` — 报名比赛
**来源**: `ContestDetail.vue (register)`
**Headers**: `Content-Type: application/json`, `X-CSRF-TOKEN`, `X-Requested-With`
**Body**: `{}`
**响应**: `{ "code": 200 }` 或 `{ "code": ..., "data": "..." }`

### `DELETE /fe/api/contest/registration/{cid}` — 取消报名
**来源**: `ContestDetail.vue (unregister)`
**Method**: DELETE
**响应**: `{ "code": 200 }`

---

## 排名

### `GET /ranking` — 排名列表
**来源**: `Ranking.vue`, `ranking.ts (background)`
**查询参数**: `page`
**响应**: lentille-context → `ctx.currentData.ranking`

---

## 讨论/Blog

### `GET /discuss` — 讨论列表
**来源**: `Blog.vue`, `RecentDiscussions.vue`, `Trending.vue`
**查询参数**: `page`, `forum` (slug)
**响应**: lentille-context → `ctx.currentData.posts`

```json
{
  "currentData": {
    "posts": {
      "count": 1000,
      "result": [
        { "id": 123, "title": "...", "time": ..., "topped": false, "locked": false,
          "replyCount": 5, "forum": {"name": "...", "color": "...", "slug": "..."},
          "author": {"uid": ..., "avatar": "...", "name": "...", "color": "..."} }
      ]
    },
    "publicForums": [{"name": "...", "slug": "...", "color": "..."}]
  }
}
```

### `GET /discuss/{id}` — 讨论帖子详情
**来源**: `Blog.vue (fetchDetail)`
**响应**: lentille-context → `ctx.currentData.post` + `currentData.replies`

```json
{
  "currentData": {
    "post": { "id": 123, "title": "...", "content": "# markdown...", "time": ..., "author": {...} },
    "replies": {
      "result": [
        { "id": 456, "content": "...", "time": ..., "author": {...} }
      ]
    }
  }
}
```

### `GET /discuss/{id}?_contentOnly=1` — 讨论纯数据
**来源**: `blog.ts (background - BLOG.getDetail)`
**响应**: JSON（结构与上面相同）

### `POST /discuss/{id}/reply` — 回复讨论
**来源**: `Blog.vue (postReply)`
**认证**: CSRF
**Headers**: `Content-Type: application/json`, `X-CSRF-TOKEN`, `X-Requested-With`
**Body**: `{ "content": "回复内容..." }`
**响应**: `{ "code": 200, "rid": 789 }` 或 `{ "rid": 789 }` 或 `{ "data": "错误信息" }`

---

## 私信

### `GET /chat?_contentOnly=1` — 会话列表
**来源**: `Messages.vue (fetchChatList)`, `useMessagePolling.ts`
**响应**:
```json
{
  "currentData": {
    "latestMessages": {
      "result": [
        { "id": 123, "from": {"uid": 1, "name": "...", "avatar": "..."},
          "content": "...", "time": ..., "unread": true }
      ]
    }
  }
}
```

### `GET /api/chat/record?user={uid}` — 聊天记录
**来源**: `Messages.vue (openChat, loadMore, preload)`
**认证**: 需要
**查询参数**: `user={uid}`, `page={n}`
**Headers**: `X-Requested-With: XMLHttpRequest`
**响应**:
```json
{
  "messages": [
    { "id": 1, "sender": {"uid": 1, "name": "...", "avatar": "..."},
      "content": "...", "time": 1750000000 }
  ],
  "unreadCount": 0
}
```

### `POST /api/chat/new` — 发送消息
**来源**: `Messages.vue (sendMessage)`
**Headers**: `Content-Type: application/json`, `X-CSRF-TOKEN`, `X-Requested-With`
**Body**: `{ "user": 123, "content": "..." }`
**响应**: `{ "_empty": true }` 或 `{ "id": ..., "time": ... }`

### `POST /api/chat/clearUnread` — 清除未读
**来源**: `Messages.vue (openChat)`
**Headers**: `Content-Type: application/json`, `X-Requested-With`
**Body**: `"uid"` (raw number, not JSON)

---

## 评测记录

### `GET /record/list?_contentOnly=1` — 记录列表
**来源**: `Record.vue`, `contentScripts/index.ts`
**查询参数**: `_contentOnly=1`, `page`
**响应**: lentille-context → `ctx.currentData.records`

```json
{
  "currentData": {
    "records": {
      "count": 1000,
      "result": [
        { "id": 12345678, "problem": {"pid": "P1001", "title": "A+B"},
          "contest": null, "sourceCodeLength": 200,
          "submitTime": 1750000000, "status": 12, "score": 100,
          "time": 15, "memory": 1024, "language": 28, "enableO2": false }
      ]
    }
  }
}
```

### `GET /record/{id}?_contentOnly=1` — 记录详情
**来源**: `Record.vue (fetchRecordDetail)`
**响应**: JSON（含代码、编译信息、子任务、测试点）

```json
{
  "currentData": {
    "record": {
      "id": 12345678, "problem": {"pid": "P1001", "title": "A+B"},
      "sourceCode": "#include...", "compileResult": {"success": true, "message": ""},
      "detail": {
        "judgeResult": {
          "subtasks": [
            { "id": 0, "score": 100, "status": 12,
              "testCases": [
                { "id": 0, "time": 15, "memory": 1024, "score": 10, "status": 12, "description": "AC" }
              ]
            }
          ],
          "compileResult": {"success": true}
        }
      },
      "status": 12, "score": 100, "time": 15, "memory": 1024,
      "language": 28, "submitTime": 1750000000
    }
  }
}
```

---

## 用户

### `GET /user/{uid}` — 用户主页
**来源**: `UserProfile.vue`, `user.ts (background)`
**响应**: lentille-context → `ctx.currentData`

```json
{
  "currentData": {
    "user": {
      "uid": 1, "name": "...", "color": "Red", "badge": "...",
      "avatar": "https://cdn.luogu.com.cn/upload/usericon/1.png",
      "slogan": "...", "followingCount": 10, "followerCount": 100,
      "ccfLevel": 7, "rating": 2000, "passedProblemCount": 500
    },
    "passedProblems": { "count": 500, "result": [...] },
    "following": { "count": 10, "result": [...] },
    "followers": { "count": 100, "result": [...] }
  }
}
```

### `GET /user/{uid}?_contentOnly=1` — 用户纯数据
**来源**: `home.ts (background)`
**响应**: JSON（只含基本用户信息）

### `GET /user/mine/team` — 我的团队
**来源**: `Team.vue (fetchTeamList)`
**响应**: lentille-context → `ctx.data.teams`

### `GET /user/mine/problem` — 我创建的题目
**来源**: `MyProblems.vue`
**响应**: lentille-context

### `GET /user/mine/contestJoined` — 我报名的比赛
**来源**: `MyContests.vue`
**响应**: lentille-context

### `GET /user/{uid}/practice` — 做题记录
**来源**: `Practice.vue`
**响应**: lentille-context

### `GET /user/notification` — 通知列表
**来源**: `Notification.vue`
**响应**: lentille-context

### `GET /blog/{uid}` — 用户博客
**来源**: `user.ts (background - USER.getBlogs)`
**响应**: lentille-context

### `GET /user/{uid}/following` / `/followers` — 关注/粉丝
**来源**: `user.ts (background)`
**响应**: lentille-context

### `GET /user/{uid}/practice` — 用户刷题记录
**来源**: `Practice.vue`
**认证**: 需要

---

## 团队

### `GET /team/{id}` — 团队主页
**来源**: `Team.vue (fetchTeamDetail)`
**响应**: lentille-context → `ctx.data.team`

```json
{
  "data": {
    "team": { "id": 131554, "name": "...", "type": 1, "isPremium": false,
      "memberCount": 10, "createTime": 1700000000,
      "master": {"uid": ..., "name": "...", "avatar": "...", "color": "..."} },
    "currentMember": { "type": 1 },
    "groups": [{"id": 1, "name": "..."}],
    "latestDiscussions": [...],
    "notice": "...",
    "usages": {
      "problem": [50], "training": [10], "contest": [5],
      "homework": [3], "file": [1048576]
    }
  }
}
```

### `GET /team/{id}/contest` — 团队比赛列表
**来源**: `Team.vue (fetchTeamSubPage)`
**响应**: lentille-context → `ctx.data.contests.result`

### `GET /team/{id}/problem` — 团队题目列表
**来源**: `Team.vue (fetchTeamSubPage)`
**响应**: lentille-context → `ctx.data.problems.result`

### `GET /team/{id}/training` — 团队题单列表
**来源**: `Team.vue (fetchTeamSubPage)`
**响应**: lentille-context → `ctx.data.trainings.result`

### `GET /team/{id}/homework` — 团队作业列表
**来源**: `Team.vue (fetchTeamSubPage)`
**响应**: lentille-context → `ctx.data.homeworks.result`

### `GET /team/{id}/file` — 团队文件列表
**来源**: `Team.vue (fetchTeamSubPage)`
**响应**: lentille-context → `ctx.data.files.result`

```json
{
  "data": {
    "contests": { "result": [
      { "id": 123, "name": "..." }
    ]}
  }
}
```

---

## 题单

### `GET /training/list` — 题单列表
**来源**: `Training.vue`, `training.ts (background)`
**响应**: lentille-context → `ctx.currentData.trainings`

### `GET /training/{id}` — 题单详情
**来源**: `Training.vue`, `training.ts (background)`
**响应**: lentille-context → `ctx.currentData.training`

```json
{
  "currentData": {
    "training": {
      "id": 123, "title": "...", "description": "...",
      "author": {...}, "problems": [{"pid": "P1001", "title": "...", "difficulty": 1}]
    }
  }
}
```

---

## 搜索

### `GET /search` — 全站搜索
**来源**: `Search.vue`
**查询参数**: `keyword`
**响应**: 解析 HTML → 提取各分区结果

---

## 文章

### `GET /article` — 文章列表
**来源**: `Article.vue`
**响应**: lentille-context

---

## 题解

### `GET /problem/solution/{pid}` — 题解页
**来源**: `Solution.vue`
**响应**: lentille-context → 获取 `currentData.solutions`

---

## 状态码

### 评测状态

| 代码 | 含义 |
|------|------|
| 0 | Waiting |
| 1 | Judging |
| 2 | Compile Error |
| 3 | Output Limit Exceeded |
| 4 | Memory Limit Exceeded |
| 5 | Time Limit Exceeded |
| 6 | Wrong Answer |
| 7 | Runtime Error |
| 12 | Accepted |
| 14 | Unaccepted |

### 编程语言 ID

| ID | 语言 |
|----|------|
| 3 | C |
| 7 | Python 3 |
| 28 | C++14 (GCC 9) |
| ... | 等等 |

---

## 页面类型枚举 (GuluGulu internal)

```typescript
enum AppPage {
  Home, ProblemList, ProblemDetail, ContestList, ContestDetail,
  Ranking, Blog, UserProfile, Search, Training, Team, Record,
  Login, Messages, Solution, Article, MyProblems, MyContests,
  TrainingFav, Notification, Practice
}
```

### URL 匹配规则

```typescript
// getActivatedPage() in contentScripts/index.ts
/home                → AppPage.Home
/problem/list        → AppPage.ProblemList
/problem/{pid}       → AppPage.ProblemDetail
/contest/list        → AppPage.ContestList
/contest/{id}        → AppPage.ContestDetail
/ranking             → AppPage.Ranking
/blog/* 或 /discuss/* → AppPage.Blog
/user/*              → AppPage.UserProfile
/training/*          → AppPage.Training
/team/*              → AppPage.Team
/record/*            → AppPage.Record
```

### 支持的域名

```
www.luogu.com.cn  (主站)
www.luogu.com     (镜像)
www.luogu.org     (镜像)
class.luogu.com.cn (网课)
space.luogu.com.cn (空间)
```
