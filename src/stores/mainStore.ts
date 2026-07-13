import { defineStore } from 'pinia'

import { AppPage, HomeSubPage } from '~/enums/appEnums'

export interface DockItem {
  i18nKey: string
  icon: string
  iconActivated: string
  page: AppPage
  openInNewTab: boolean
  useOriginalLuoguPage: boolean
  url: string
  hasGulyPage: boolean // Whether GuluGulu has a page for this item
}

export interface HomeTab {
  i18nKey: string
  page: HomeSubPage
}

export const useMainStore = defineStore('main', () => {
  const dockItems = computed((): DockItem[] => {
    return [
      {
        i18nKey: 'nav.home',
        icon: 'mingcute:home-4-line',
        iconActivated: 'i-mingcute:home-4-fill',
        page: AppPage.Home,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.problem_list',
        icon: 'mingcute:code-line',
        iconActivated: 'i-mingcute:code-fill',
        page: AppPage.ProblemList,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/problem/list',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.contest_list',
        icon: 'mingcute:trophy-line',
        iconActivated: 'i-mingcute:trophy-fill',
        page: AppPage.ContestList,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/contest/list',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.ranking',
        icon: 'mingcute:chart-bar-line',
        iconActivated: 'i-mingcute:chart-bar-fill',
        page: AppPage.Ranking,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/ranking',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.blog',
        icon: 'mingcute:comment-line',
        iconActivated: 'i-mingcute:comment-fill',
        page: AppPage.Blog,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/discuss',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.training',
        icon: 'mingcute:book-4-line',
        iconActivated: 'i-mingcute:book-4-fill',
        page: AppPage.Training,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/training/list',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.record',
        icon: 'mingcute:time-line',
        iconActivated: 'i-mingcute:time-fill',
        page: AppPage.Record,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/record/list',
        hasGulyPage: true,
      },
      {
        i18nKey: 'nav.messages',
        icon: 'mingcute:message-2-line',
        iconActivated: 'i-mingcute:message-2-fill',
        page: AppPage.Messages,
        openInNewTab: false,
        useOriginalLuoguPage: false,
        url: 'https://www.luogu.com.cn/chat',
        hasGulyPage: true,
      },
    ]
  })

  const homeTabs = shallowReadonly<HomeTab[]>(
    [
      {
        i18nKey: 'home.trending',
        page: HomeSubPage.Trending,
      },
      {
        i18nKey: 'home.recent_contests',
        page: HomeSubPage.RecentContests,
      },
      {
        i18nKey: 'home.hot_problems',
        page: HomeSubPage.HotProblems,
      },
      {
        i18nKey: 'home.recent_discussions',
        page: HomeSubPage.RecentDiscussions,
      },
    ],
  )

  function getLuoguWebPageURLByPage(page: AppPage): string {
    const dockItem = dockItems.value.find(e => e.page === page)
    return dockItem?.url || ''
  }

  function getDockItemByPage(page: AppPage): DockItem | undefined {
    return dockItems.value.find(e => e.page === page)
  }

  return { dockItems, homeTabs, getLuoguWebPageURLByPage, getDockItemByPage }
})
