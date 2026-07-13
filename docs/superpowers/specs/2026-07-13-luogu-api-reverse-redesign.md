# 洛谷 API 逆向 & GuluGulu 修复设计

> 日期: 2026-07-13 | 状态: pending implementation

## 目标

通过 Playwright 系统逆向洛谷 API，深度对比 GuluGulu 现有实现，生成分级差异报告并逐项修复。

## 阶段 1: 深度扫描

### 覆盖范围

| 页面 | URL | AppPage |
|------|-----|---------|
| Home | `/` | Home |
| ProblemList | `/problem/list` | ProblemList |
| ProblemDetail | `/problem/P1001`, `?_contentOnly=1` | ProblemDetail |
| ContestList | `/contest/list` | ContestList |
| ContestDetail | `/contest/{id}` | ContestDetail |
| Ranking | `/ranking` | Ranking |
| Blog/DiscussList | `/discuss` | Blog |
| BlogDetail | `/discuss/{id}`, `?_contentOnly=1` | Blog |
| UserProfile | `/user/{uid}`, `?_contentOnly=1` | UserProfile |
| TrainingList | `/training/list` | Training |
| TrainingDetail | `/training/{id}` | Training |
| RecordList | `/record/list`, `?_contentOnly=1` | Record |
| RecordDetail | `/record/{id}?_contentOnly=1` | Record |
| Solution | `/problem/solution/{pid}` | Solution |
| Article | `/article` | Article |
| Search | `/search?keyword=test` | Search |
| Team | `/team/{id}` | Team |
| Messages | `/chat?_contentOnly=1` | Messages |

### 五个对比维度

1. **TS 类型 vs 真实 JSON shape** — 提取源码 interface/type 定义，和 Playwright 抓取的 lentille-context 真实 JSON 做逐字段 diff：缺失 / 多余 / 类型变化

2. **代码引用追踪** — `grep` 所有 `currentData.xxx` / `data.xxx` 属性访问路径，在真实 JSON 中逐路径验证是否存在，标记 `undefined` 路径；反向标记 JSON 中存在但代码未用的字段

3. **API 全覆盖** — 不仅抓 GET 的 lentille-context，还用 Playwright 模拟 POST/DELETE，记录请求/响应格式，和 `background/*.ts` 中 `doRequest` 模板参数对比

4. **组件级数据依赖** — 每个 Vue 组件 → 标注从哪个 store/API 读什么字段 → Playwright 验证字段可解析性 → 标记 `?.` 可选链密集处

5. **边界 case** — 未登录 vs 已登录；比赛报名前/后；空/单元素/多元素列表一致性

### 产出

`scripts/api-data/diff-report.json`:
```json
{
  "findings": [
    {
      "severity": "CRITICAL|MAJOR|MINOR",
      "dimension": "type-mismatch|missing-field|api-change|component-dependency",
      "sourceFile": "src/stores/problem.ts",
      "codePath": "currentData.problem.samples",
      "actualShape": "array of [input, output] tuples",
      "expectedShape": "array of {input, output} objects",
      "evidence": "captured URL: /problem/P1001",
      "fix": "add tuple-to-object conversion"
    }
  ]
}
```

## 阶段 2: 修复

按严重度排序修复：
- **CRITICAL**: 组件崩溃 / 白屏 / 数据完全不显示
- **MAJOR**: 功能部分缺失 / UI 错位
- **MINOR**: 边缘字段缺失 / 类型警告

每个修复：改代码 → `pnpm build` 验证 → commit

## 阶段 3: 验证

修复完成后重新跑扫描脚本，确认 diff-report 清零（或只剩 MINOR 已知项）。
