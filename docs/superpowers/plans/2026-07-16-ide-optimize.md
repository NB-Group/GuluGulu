# IDE 页面优化(CodeMirror 6)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 用 CodeMirror 6 替换 ProblemDetail.vue 的自制 textarea+hljs 编辑器,获得 Tab 缩进、行号、括号配对、查找替换四项能力并改善大代码性能。

**Architecture:** 新增 `src/composables/useCodeMirror.ts` 封装 CM6 挂载/双向绑定/语言/主题/生命周期;ProblemDetail.vue 仅调用该 composable 并把 `<pre>+<textarea>` 换成挂载 div。题面、toolbar、自测、提交、分屏拖拽不变。

**Tech Stack:** Vue 3 Composition API、TypeScript、CodeMirror 6(`@codemirror/*`)、Manifest V3 content script(Shadow DOM)。

## Global Constraints

- **MV3 CSP**:禁止 eval/内联脚本;`scripts/ascii.ts` 构建时转义非 ASCII,保持生效。
- **样式**:一律用 `var(--bew-*)` CSS 变量(随 `.dark` 自动切深浅)。
- **类型**:`npm run typecheck` 基准 57 个既有错误,**净增 0**。
- **构建**:`npm run build` 必须绿(EXIT 0)。
- **提交**:项目约定"仅在用户要求时提交";每个 Task 末尾的 commit 步骤在执行时由用户确认。

**Spec**: `docs/superpowers/specs/2026-07-16-ide-optimize-design.md`

## 文件结构

| 文件 | 责任 | 动作 |
|------|------|------|
| `package.json` | 依赖声明 | 新增 CM6 依赖 |
| `src/composables/useCodeMirror.ts` | CM6 编辑器封装(挂载/绑定/语言/主题/lifecycle) | 新建 |
| `src/contentScripts/views/ProblemDetail/ProblemDetail.vue` | 题目页 + IDE | 改:接 composable,移除旧编辑器 |

---

## Task 1: 添加 CodeMirror 6 依赖

**Files:**
- Modify: `package.json`(`dependencies`)

**Interfaces:** 无(仅装包)

- [ ] **Step 1: 在 `dependencies` 加入以下条目**(版本用 ^6 最新):

```json
"codemirror": "^6.0.0",
"@codemirror/lang-cpp": "^6.0.0",
"@codemirror/lang-python": "^6.0.0",
"@codemirror/lang-java": "^6.0.0",
"@codemirror/lang-javascript": "^6.0.0",
"@codemirror/legacy-modes": "^6.0.0",
"@codemirror/theme-one-dark": "^6.0.0"
```

- [ ] **Step 2: 安装**

Run: `npm install`
Expected: 安装成功,无 peer dep 冲突。

- [ ] **Step 3: 验证可导入**

Run: `node -e "require('@codemirror/lang-cpp'); require('@codemirror/theme-one-dark'); console.log('ok')"`
Expected: 打印 `ok`。

- [ ] **Step 4: 构建仍绿**

Run: `npm run build 2>&1 | tail -3`
Expected: EXIT 0(尚未引用,无影响)。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add CodeMirror 6 deps for IDE editor"
```

---

## Task 2: 新建 `useCodeMirror` composable

**Files:**
- Create: `src/composables/useCodeMirror.ts`

**Interfaces:**
- Produces: `useCodeMirror(opts): { requestMeasure(): void }`,其中 `opts = { host: Ref<HTMLElement|undefined>, value: Ref<string>, lang: Ref<string> }`。`lang` 传 `aceMode`(`c_cpp`/`python`/`java`/`javascript`/`pascal`/`plain_text`)。

- [ ] **Step 1: 写入完整实现**

```ts
// src/composables/useCodeMirror.ts
import { ref, watch, onUnmounted, type Ref } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, closeBrackets, closeBracketsKeymap, defaultHighlightStyle, syntaxHighlighting, indentUnit, StreamLanguage } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { pascal } from '@codemirror/legacy-modes/mode/pascal'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

// aceMode -> CM 语言扩展
const LANG_EXT: Record<string, () => unknown> = {
  c_cpp: () => cpp(),
  python: () => python(),
  java: () => java(),
  javascript: () => javascript(),
  pascal: () => StreamLanguage.define(pascal),
  plain_text: () => [],
}

// 编辑器外观基于 --bew-* 变量(随 .dark 自动切换 bg/fg/gutter)
const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bew-fill-1)', color: 'var(--bew-text-1)', height: '100%', fontSize: '14px' },
  '.cm-scroller': { fontFamily: 'Cascadia Code,Fira Code,JetBrains Mono,Consolas,monospace', lineHeight: '1.65' },
  '.cm-content': { padding: '14px 18px' },
  '.cm-gutters': { backgroundColor: 'var(--bew-fill-1)', color: 'var(--bew-text-4)', border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, ::selection': { background: 'var(--bew-theme-color-30)' },
})

export function useCodeMirror(opts: {
  host: Ref<HTMLElement | undefined>
  value: Ref<string>
  lang: Ref<string>
}) {
  let view: EditorView | null = null
  const langComp = new Compartment()
  const themeComp = new Compartment()
  const isDark = ref(document.documentElement.classList.contains('dark'))
  let darkObs: MutationObserver | null = null

  const langExtension = () => (LANG_EXT[opts.lang.value] || LANG_EXT.plain_text)()
  const themeExtension = () => syntaxHighlighting(isDark.value ? oneDarkHighlightStyle : defaultHighlightStyle)

  function create(el: HTMLElement) {
    view = new EditorView({
      state: EditorState.create({
        doc: opts.value.value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          closeBrackets(),
          bracketMatching(),
          search({ top: true }),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          langComp.of(langExtension()),
          themeComp.of(themeExtension()),
          baseTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && view && view.state.doc.toString() !== opts.value.value)
              opts.value.value = view.state.doc.toString()
          }),
        ],
      }),
      parent: el,
    })
    darkObs = new MutationObserver(() => {
      const d = document.documentElement.classList.contains('dark')
      if (d !== isDark.value) {
        isDark.value = d
        view?.dispatch({ effects: themeComp.reconfigure(themeExtension()) })
      }
    })
    darkObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  function destroy() {
    if (view) { view.destroy(); view = null }
    if (darkObs) { darkObs.disconnect(); darkObs = null }
  }

  // host 在 v-if="isSplitView" 内,出现/消失时创建/销毁编辑器(flush:post 等 DOM)
  const stopHost = watch(opts.host, (el) => { el ? create(el) : destroy() }, { flush: 'post' })
  // 外部写入 value(lastCode 载入、切语言重置)→ 替换文档
  const stopValue = watch(opts.value, (v) => {
    if (view && view.state.doc.toString() !== v)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
  })
  // 切语言 → 重配语言扩展
  const stopLang = watch(opts.lang, () => view?.dispatch({ effects: langComp.reconfigure(langExtension()) }))

  onUnmounted(() => { destroy(); stopHost(); stopValue(); stopLang() })

  return { requestMeasure: () => view?.requestMeasure() }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck 2>&1 | grep -E "useCodeMirror|error TS" | tail`
Expected: 无 `useCodeMirror.ts` 报错;总数仍 57(净增 0)。

- [ ] **Step 3: Commit**

```bash
git add src/composables/useCodeMirror.ts
git commit -m "feat: add useCodeMirror composable (CodeMirror 6 wrapper)"
```

---

## Task 3: ProblemDetail 接入 CodeMirror

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`

**Interfaces:**
- Consumes: `useCodeMirror` from Task 2.

- [ ] **Step 1: 脚本——移除旧编辑器代码**

删除以下符号(按名查找整块删除):
- `const hljsMap: Record<string, string> = { c_cpp: 'cpp', ... }`(约 378 行)
- `const highlightedCode = computed(() => { ... })`(约 379–386 行,整块)
- `function syncScroll(e: Event) { ... }`(约 388 行起,整块)
- `const highlightPre = ref(...)`(模板里 `ref="highlightPre"` 对应的 ref 声明)

保留:`highlightCode(code, lang)` 函数(约 21 行,用于只读源码展示,与编辑器无关)和 `hljs` 导入。

- [ ] **Step 2: 脚本——接入 composable**

在 `<script setup>` 顶部 import 区加:
```ts
import { useCodeMirror } from '~/composables/useCodeMirror'
```
在编辑器相关 ref 声明处(已有 `const codeContent = ref('')`、`const selectedLang = ref(...)` 附近)加:
```ts
const cmHost = ref<HTMLElement>()
useCodeMirror({
  host: cmHost,
  value: codeContent,
  lang: computed(() => selectedLang.value.aceMode),
})
```

- [ ] **Step 3: 模板——替换编辑器 DOM**

把(约 890–891 行)这两行:
```html
                <pre ref="highlightPre" style="position:absolute;inset:0;margin:0;padding:14px 18px;font-family:Cascadia Code,Fira Code,JetBrains Mono,Consolas,monospace;font-size:14px;line-height:1.65;tab-size:4;white-space:pre-wrap;word-wrap:break-word;overflow:auto;pointer-events:none;color:var(--bew-text-1);background:var(--bew-fill-1)"><code v-html="highlightedCode" /></pre>
                <textarea v-model="codeContent" style="position:relative;width:100%;height:100%;background:transparent;color:transparent;caret-color:var(--bew-text-1);border:none;padding:14px 18px;font-family:Cascadia Code,Fira Code,JetBrains Mono,Consolas,monospace;font-size:14px;line-height:1.65;resize:none;tab-size:4;outline:none;z-index:1" placeholder="在此输入代码…" spellcheck="false" @scroll="syncScroll" />
```
替换为:
```html
                <div ref="cmHost" style="position:absolute;inset:0;overflow:hidden" />
```
(父容器已是定位元素,旧 `<pre>` 用 `position:absolute;inset:0`,沿用相同定位让 CM 填满。)

- [ ] **Step 4: typecheck**

Run: `npm run typecheck 2>&1 | grep -E "ProblemDetail|error TS" | tail`
Expected: ProblemDetail.vue 不因本次改动新增错误(它既有 ~6 个错误可保留);总数不增。

- [ ] **Step 5: build**

Run: `npm run build 2>&1 | tail -3`
Expected: EXIT 0。记录 content script 产物大小(为 Task 4 比对)。

- [ ] **Step 6: Commit**

```bash
git add src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git commit -m "feat: replace IDE textarea editor with CodeMirror 6"
```

---

## Task 4: 行为与体积验证

**Files:** 无改动(验证)

- [ ] **Step 1: 加载扩展手动验证清单**(在洛谷题目页进入 IDE)

逐项确认:
- [ ] 输入代码有语法高亮(C/C++ 等语言色)
- [ ] Tab 缩进;选中多行 Tab 一起缩进、Shift+Tab 反缩进;Tab 不再跳出编辑器
- [ ] 左侧行号,滚动时与内容同步
- [ ] 输 `(` 自动补 `)`、输 `"` 自动补 `"`;光标停在括号上高亮另一半
- [ ] Ctrl+F 查找、Ctrl+H 替换、Ctrl+G 下一个
- [ ] 切深色模式,编辑器语法色即时换肤(不重建、不丢内容)
- [ ] 打开有 `lastCode` 存档的题,编辑器显示存档代码
- [ ] 切语言,代码重置为对应默认模板
- [ ] 点提交,正常提交(读 `codeContent`);自测面板正常
- [ ] 拖动分屏分隔条,编辑器宽度跟随重排(CM6 自带 ResizeObserver)

- [ ] **Step 2: bundle 体积比对**

对比 Task 3 Step 5 记录的 content script 产物大小;确认 gzip 增量在可接受范围(预估 80–120KB)。若超出明显,检查是否误引整包。

- [ ] **Step 3: 最终 typecheck + build**

Run: `npm run typecheck 2>&1 | grep -c "error TS"` → 期望 57(净增 0)。
Run: `npm run build 2>&1 | tail -1` → 期望 EXIT 0。

- [ ] **Step 4: Commit(若有体积/微调)**

```bash
git add -A
git commit -m "chore: verify CodeMirror IDE integration"
```

---

## Self-Review(已自查)

- **Spec 覆盖**:四项能力→Task 2 的 `indentWithTab`/`lineNumbers`/`bracketMatching+closeBrackets`/`search`;双向绑定、语言/主题 Compartment、`watch(host)` 生命周期、Shadow DOM/CSP 风险——均有任务覆盖。
- **占位符**:无 TBD;所有代码块完整;删除步骤按具名符号定位。
- **类型一致**:`useCodeMirror` 签名在 Task 2 定义、Task 3 消费一致(`host`/`value`/`lang`)。
