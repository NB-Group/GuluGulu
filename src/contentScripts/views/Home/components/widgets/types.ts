import type { Component } from 'vue'

export type WidgetSize = 'sm' | 'md' | 'lg'

/**
 * 「开始」tab 的 widget 注册表项。加新卡片只需:
 *   1. 在 widgets/ 下新建一个 .vue(渲染内容行,自管 loading/数据/空态)
 *   2. 在 index.ts 的 WIDGETS 数组加一条
 */
export interface WidgetDef {
  /** 唯一 id,持久化到 startLayout */
  id: string
  /** 显示名(中文) */
  name: string
  /** mingcute 图标名 */
  icon: string
  /** 默认尺寸档(sm=4列 / md=6列 / lg=12列整行) */
  defaultSize: WidgetSize
  /** 异步组件加载器(defineAsyncComponent 用) */
  component: () => Promise<{ default: Component }>
}

/** startLayout 里的单项:顺序即显示顺序,size 是占位档 */
export interface WidgetLayoutItem {
  i: string
  size: WidgetSize
}
