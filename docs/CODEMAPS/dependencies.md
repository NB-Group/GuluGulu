<!-- Generated: 2026-07-18 | Token estimate: ~550 -->

# Dependencies

## 运行时

- **Vue 3** + **Pinia** + **@vueuse/core**
- ** UnoCSS**（attributify + preset）— `bg="$bew-content"` 风格
- **overlayscrollbars** + overlayscrollbars-vue — 滚动容器
- **CodeMirror 6**（lang-cpp/java/javascript/python + legacy pascal）— IDE 编辑器
- **marked** + marked-highlight + **highlight.js**（`/lib/core` + 20 语言子集）+ **katex**（字体外置 woff2，runtime URL 重写）+ dompurify
- **mitt** 事件总线、**vue-i18n**、**vue-toastification**、**qrcode.vue**、**vuedraggable**
- **webext-bridge** + **webextension-polyfill** — 扩展消息/MV3 API

## 构建/工具

- **Vite** + @vitejs/plugin-vue + unplugin-auto-import
- **tsup**（background SW）、**esno**（脚本）、**terser**
- **@iconify/json** + @iconify/vue — 图标（本仓用 `scripts/extract-icons.mjs` 生成子集 `utils/icon-data.ts`）
- typescript + vue-tsc + eslint(@antfu) + knop

## 外部服务

- **洛谷**：`www.luogu.com.cn`（页面/API）、`ws.luogu.com.cn`（评测 WS）、`cdn.luogu.com.cn`（头像/静态）、C3VK WAF
- 字体：ShangguSansSC（woff2 子集）+ KaTeX woff2（web_accessible_resources）

## 脚本

`scripts/`：`extract-icons.mjs`(图标子集)、`prepare.ts`(manifest)、`ascii.ts`(CSP 转义)、`verify-refactor.mjs`/`verify-columns.mjs`/`verify-ide-persist.mjs`(Playwright 冒烟)。
