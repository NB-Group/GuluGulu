import type { WidgetDef, WidgetLayoutItem, WidgetSize } from './types'

/**
 * 「开始」tab 的 widget 注册表 —— 加新卡片只在此追加一条 + 在 widgets/ 建对应 .vue。
 * 布局用 vuedraggable 顺序排列 + CSS Grid 列占位:size 决定横向占几列(12 列网格)。
 *  sm=4 / md=6 / lg=12(整行)
 */
const SIZE_COLS: Record<WidgetSize, number> = { sm: 4, md: 6, lg: 12 }

export function sizeCols(size: WidgetSize): number {
  return SIZE_COLS[size] ?? 6
}

export const WIDGETS: WidgetDef[] = [
  {
    id: 'unfinished',
    name: '未完成题目',
    icon: 'mingcute:edit-line',
    defaultSize: 'md',
    component: () => import('./UnfinishedProblems.vue'),
  },
  {
    id: 'practice',
    name: '练习进度',
    icon: 'mingcute:book-4-line',
    defaultSize: 'md',
    component: () => import('./PracticeTrainings.vue'),
  },
  {
    id: 'trainingFav',
    name: '收藏的题单',
    icon: 'mingcute:star-line',
    defaultSize: 'md',
    component: () => import('./FavoriteTrainings.vue'),
  },
  {
    id: 'contestJoined',
    name: '已报比赛',
    icon: 'mingcute:trophy-line',
    defaultSize: 'lg',
    component: () => import('./JoinedContests.vue'),
  },
]

export const WIDGET_MAP: Record<string, WidgetDef> = Object.fromEntries(WIDGETS.map(w => [w.id, w]))

/** 按注册表顺序 + defaultSize 生成初始布局 */
export function defaultLayout(): WidgetLayoutItem[] {
  return WIDGETS.map(w => ({ i: w.id, size: w.defaultSize }))
}
