# 自测 IDE 化 & 题解嵌入 & 代码模板

> 日期: 2026-07-13 | 状态: pending implementation

## 目标

1. 自测模块改用洛谷 IDE API（不创建真实提交记录）
2. 题解 Tab 内嵌题解列表和内容
3. 完善所有语言的默认代码模板

---

## 阶段 1: 自测 IDE 化

### 发现的 API

| 步骤 | 端点 | 方法 |
|------|------|------|
| 提交运行 | `POST /api/ide_submit` | form-urlencoded |
| 接收结果 | `wss://ws.luogu.com.cn/ws` | WebSocket |

**参数**: `code`, `lang`, `input`, `o2`, `csrf-token`
**响应**: `{ status: 200, data: { rid: "1601422xxxxxxxx" } }`

**WebSocket**:
1. 连接 `wss://ws.luogu.com.cn/ws`
2. 发送 `{ type: "join_channel", channel: "ide.track", channel_param: "{rid}" }`
3. 接收结果消息

### 实现

`_runTest()` 重写:
- `fetch` → `/api/ide_submit`（不创建真实评测记录）
- WebSocket 收听结果
- 超时 15s fallback
- 结果对照预期输出

---

## 阶段 2: 题解嵌入

题解 Tab 当前只跳转洛谷 → 改为内嵌:
- 列表从 `/problem/solution/{pid}` 的 lentille-context 读取
- 详情从 `/blog/{solutionId}?_contentOnly=1` 读取

---

## 阶段 3: 代码模板

`getDefaultCode(lang)` 覆盖洛谷所有 31 种语言，模板从 P1001 范例提取。
