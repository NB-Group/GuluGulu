import type { WidgetDef, WidgetLayoutItem } from './types'

/**
 * 「开始」tab 的 widget 注册表 —— 加新卡片只在此追加一条 + 在 widgets/ 建对应 .vue。
 * 网格用 12 列。默认尺寸:w=6(半宽)/12(整宽),h=每行约 ~2 单元。
 */
export const WIDGETS: WidgetDef[] = [
  {
    id: 'unfinished',
    name: '未完成题目',
    icon: 'mingcute:edit-line',
    defaultLayout: { w: 6, h: 4 },
    sizes: [{ w: 6, h: 4 }, { w: 6, h: 6 }, { w: 12, h: 4 }],
    component: () => import('./UnfinishedProblems.vue'),
  },
  {
    id: 'practice',
    name: '在刷的题单',
    icon: 'mingcute:book-4-line',
    defaultLayout: { w: 6, h: 4 },
    sizes: [{ w: 6, h: 4 }, { w: 6, h: 6 }, { w: 12, h: 4 }],
    component: () => import('./PracticeTrainings.vue'),
  },
  {
    id: 'trainingFav',
    name: '收藏的题单',
    icon: 'mingcute:star-line',
    defaultLayout: { w: 6, h: 4 },
    sizes: [{ w: 6, h: 4 }, { w: 6, h: 6 }, { w: 12, h: 4 }],
    component: () => import('./FavoriteTrainings.vue'),
  },
  {
    id: 'contestJoined',
    name: '已报比赛',
    icon: 'mingcute:trophy-line',
    defaultLayout: { w: 12, h: 4 },
    sizes: [{ w: 6, h: 4 }, { w: 12, h: 4 }, { w: 12, h: 6 }],
    component: () => import('./JoinedContests.vue'),
  },
]

export const WIDGET_MAP: Record<string, WidgetDef> = Object.fromEntries(WIDGETS.map(w => [w.id, w]))

/** 按注册表 defaultLayout 生成初始布局(自动排位,避免重叠) */
export function defaultLayout(): WidgetLayoutItem[] {
  const items: WidgetLayoutItem[] = []
  let x = 0
  let y = 0
  for (const w of WIDGETS) {
    const { w: ww, h } = w.defaultLayout
    if (x + ww > 12) { x = 0; y = items.length ? Math.max(...items.map(it => it.y + it.h)) : 0 }
    items.push({ i: w.id, x, y, w: ww, h })
    x += ww
    if (x >= 12) { x = 0; y = Math.max(y, ...items.map(it => it.y + it.h)) }
  }
  return items
}
