# 重构回归冒烟测试设计

> 日期：2026-07-17　·　范围：验证本轮轻量化重构（字体接入 shadow / KaTeX 字体外置 / iconify 子集 / highlight.js 子集）无渲染回归

## 目标
本轮重构以「功能不变」为约束，但改动侵入性强且未能运行时验证。本测试用 Playwright 真实加载扩展，程序化断言四项高风险回归点，确认渲染未坏。属一次性验证脚本，保留作未来回归用。

## 范围（四项风险 → 断言）

| 改动 | 风险 | 断言 |
|---|---|---|
| 字体接入 shadow `:host` | 字体没生效 / 字体栈压坏代码块字体 | `document.fonts.check('16px "ShangguSansSCVF"')` 为 true；CJK 元素计算字体含 `ShangguSansSCVF`；代码块仍为等宽 |
| KaTeX 字体外置（woff2 + url 重写） | 公式坏 / 字体 404 | shadow 内 `.katex` 存在；`document.fonts.check('16px "KaTeX_Main"')` 为 true（字体真加载） |
| iconify 子集（82 图标） | 漏图标 → 空位 | Dock/TopBar 内联图标 SVG 数 > 阈值 |
| highlight.js 子集（20 语言） | 未注册语言丢高亮 | shadow 内 `code.hljs` 存在且含 `.hljs-keyword` 等高亮 span |

## 方案：混合
- **自动化**：单脚本 `scripts/verify-refactor.mjs`，headed 加载 `extension/`，访问目标页，跑上表断言，输出 ✓/✗ 报告 + 失败诊断，退出码反映整体。
- **主观目检（人工，2 分钟）**：字重是否正常、图标有无错位/空位、公式符号是否正确、有无布局抖动。

## 目标页
1. **带公式 + 代码的题目页**（实现时选一个确定含 KaTeX 的 pid）——查 KaTeX + hljs + 挂载。
2. **首页**——查字体加载 + Dock/TopBar 图标。

## Shadow DOM 穿透
`#guly` 为 open shadow，直接 `shadowRoot.querySelector` 即可。

## 登录策略（三级回退）
1. 复用持久 profile（`jobs/.../pw-profile`，cookie 可能过期）
2. 从 Firefox 导入 cookie（`scripts/playwright-helper.js` 同款逻辑）
3. 都不行 → headed 窗口弹出，人工登录一次（持久化后下次免登录）

## 不在范围
性能、新功能、非渲染类 bug（HANDOFF 待办另算）。

## 退出标准
四项断言全绿 + 人工目检无异常 → 重构验证通过；任一失败 → 定位并修复后复跑。
