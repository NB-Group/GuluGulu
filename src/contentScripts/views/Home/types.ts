import type { GridLayoutType } from '~/logic'

export enum HomeSubPage {
  Trending = 'Trending',
  RecentContests = 'RecentContests',
  HotProblems = 'HotProblems',
  RecentDiscussions = 'RecentDiscussions',
}

export interface GridLayoutIcon {
  icon: string
  iconActivated: string
  value: GridLayoutType
}
