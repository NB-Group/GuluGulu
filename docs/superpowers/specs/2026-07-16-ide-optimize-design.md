# IDE 页面优化设计 — CodeMirror 6

- **日期**: 2026-07-16
- **状态**: 已通过设计评审，待写实现计划
- **范围**: `ProblemDetail.vue` 的 IDE（分屏右栏）代码编辑器

## 目标

把现有自制编辑器（`<textarea>` 透明文字 + hljs `<pre>` 高亮叠加层）替换为 CodeMirror 6，一次性获得用户要求的四项编辑能力，并改善大代码输入性能。

**必备能力**（用户确认）：
1. Tab 缩进 / Shift+Tab 反缩进（含多行选中一起缩进）
2. 行号
3. 括号 / 引号自动补全 + 配对高亮
4. 查找替换（Ctrl+F / Ctrl+H）

## 方案选择

选 **CodeMirror 6**，放弃「增强自制 textarea」。理由：第 4 项（查找替换）在原生 textarea 上做不彻底（选中范围管理 + overlay 高亮，脆弱）；CM6 四项全部原生，且增量解析替代「每次按键全量 hljs 重算」，顺带修性能。Monaco 太重（~5MB）、不适合 MV3 + Shadow DOM，不考虑。

## 架构

为避免 `ProblemDetail.vue`（现 1324 行）继续膨胀，把 CodeMirror 相关逻辑抽成独立 composable：

- **新增** `src/composables/useCodeMirror.ts`（~120 行）：挂载、双向绑定、语言/主题重配、生命周期。
- **改** `ProblemDetail.vue`：删除 `highlightedCode`（computed）、`syncScroll`、`highlightPre` ref 以及模板里的 `<pre>+<textarea>`；替换为 `<div ref="cmHost">` + 调用 composable。toolbar（语言选择 / O2 / 自测开关 / 提交）、自测面板、提交逻辑、分屏结构与拖拽**保持不变**。

`useCodeMirror` 接口（拟）：
```ts
useCodeMirror({
  host: Ref<HTMLElement | undefined>,   // cmHost 模板 ref
  value: Ref<string>,                    // 与 codeContent 双向
  lang: Ref<string>,                     // selectedLang.aceMode
  dark: Ref<boolean>,                    // useDark()
  onReady?: () => void,
}): { requestMeasure(): void }
```

## 数据流 / 绑定

- **挂载**：用 `watch(host, el => { if (el) createEditor(el); else destroyEditor() })`，**不能**用 `onMounted`——host 在 `v-if="isSplitView"` 内，从非分屏视图点进 IDE 时 host 才出现，此时 ProblemDetail 的 `onMounted` 已触发完。`watch(host)` 保证 host 出现即 `new EditorView({ parent: el })`、消失即 `editor.destroy()`。
- **双向 value**：
  - CM `ViewUpdate`（`docChanged`）→ 写回 `value.value`（提交、自测读它）。
  - `watch(value)`：外部写入（载入 `lastCode`、切语言 `getDefaultCode` 重置）→ `view.dispatch({ changes: { from: 0, to, insert } })`。
  - 用 `if (view.state.doc.toString() !== value.value)` 防回环。
- **语言**：`watch(lang)` → `langCompartment.reconfigure(LANG_EXT[aceMode]())`。用 `Compartment` 重配，不重建编辑器。
- **主题**：`watch(dark)` → `themeCompartment.reconfigure(dark ? darkTheme : lightTheme)`。主题基于 `--bew-*` CSS 变量 + CM 默认语法高亮（`syntaxHighlighting(defaultHighlightStyle)`）。
- **分屏拖拽**：`startResize` 拖动结束 → `requestMeasure()`（CM6 亦自带 ResizeObserver，此为保险）。

## 语言映射

`LUOGU_LANGUAGES[i].aceMode` → CodeMirror 语言扩展：

| aceMode | CM 扩展 |
|---------|---------|
| `c_cpp` | `@codemirror/lang-cpp` 的 `cpp()`（C/C++ 通用）|
| `python` | `@codemirror/lang-python` 的 `python()` |
| `java` | `@codemirror/lang-java` 的 `java()` |
| `javascript` | `@codemirror/lang-javascript` 的 `javascript()` |
| `pascal` | `@codemirror/legacy-modes` 的 `StreamLanguage.define(pascal)` |
| `plain_text` | 无语言扩展（纯文本）|

替换现有 `hljsMap`（仅 CM 内部用，hljs 仍保留给题面 markdown）。

## 依赖（package.json 新增）

- `codemirror`（核心元包：view/state/commands/language/search/autocomplete）
- `@codemirror/lang-cpp`、`@codemirror/lang-python`、`@codemirror/lang-java`、`@codemirror/lang-javascript`
- `@codemirror/legacy-modes`（pascal）

预估 content script bundle 增量 gzip ~80–120KB。

## 四项能力 → CM 扩展

1. Tab 缩进：`keymap.of([indentWithTab, ...defaultKeymap])` + `EditorState.tabSize.of(4)` + `indentUnit.of('    ')`
2. 行号：`lineNumbers()`
3. 括号配对：`bracketMatching()` + `closeBrackets()`
4. 查找替换：`search({ top: true })` + `keymap.of([...searchKeymap])`（Ctrl+F/Ctrl+H/Ctrl+G）

## 风险与处理

| 风险 | 处理 |
|------|------|
| bundle 体积上涨 | 只引需要的语言包；build 后记录 size 增量 |
| Shadow DOM 挂载 | CM6 操作传入节点，可挂 shadow root；实现时验证 |
| MV3 CSP | CM6 无 eval/内联脚本；`scripts/ascii.ts` 仍转义非 ASCII |
| 生命周期（v-if 挂卸） | composable `watch(host)`：host 出现则建、消失则 `destroy()` |
| 主题跟随深色 | `useDark()` 响应式 + `Compartment` 即时换肤 |

## 验收标准

- [ ] 输入代码有语法高亮；Tab 缩进 / Shift+Tab 反缩进（含多行选中）
- [ ] 行号显示且与内容滚动同步
- [ ] 输 `(` 自动补 `)`；光标在括号上高亮另一半
- [ ] Ctrl+F 查找、Ctrl+H 替换可用
- [ ] 切深色模式编辑器即时换肤，不重建
- [ ] 载入有 `lastCode` 的题目显示存档代码
- [ ] 切换语言重置为对应默认代码
- [ ] 提交、自测读取代码正常
- [ ] 拖动分屏分隔条后编辑器重排
- [ ] `npm run typecheck` 净增 0 错误（基准 57）
- [ ] `npm run build` 绿；记录 bundle size 变化

## 不在本期范围

自动补全（snippet/语言关键字）、代码折叠、多光标、多文件标签、vim/sublime 键位。CM6 上线后可低成本增量加入。
