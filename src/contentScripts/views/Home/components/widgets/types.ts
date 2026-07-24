import type { Component } from 'vue'

/** 网格单元尺寸(列×行,grid-layout-plus 的 w/h) */
export interface WidgetSize {
  w: number
  h: number
}

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
  /** 默认网格尺寸(列×行) */
  defaultLayout: WidgetSize
  /** 允许的缩放档(用户在编辑模式可循环切换) */
  sizes: WidgetSize[]
  /** 异步组件加载器(defineAsyncComponent 用) */
  component: () => Promise<{ default: Component }>
}

/** startLayout 里的单项 */
export interface WidgetLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}
