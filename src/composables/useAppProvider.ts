import type { Ref } from 'vue'
import { inject } from 'vue'

import type { AppPage } from '~/enums/appEnums'

export interface GulyAppProvider {
  activatedPage: Ref<AppPage>
  scrollbarRef: Ref<any>
  reachTop: Ref<boolean>
  mainAppRef: Ref<HTMLElement>
  handleReachBottom: Ref<(() => void) | undefined>
  handlePageRefresh: Ref<(() => void) | undefined>
  handleBackToTop: (targetScrollTop?: number) => void
  haveScrollbar: () => Promise<boolean>
  openIframeDrawer: (url: string) => void
  openSettings: () => void
  navigateTo: (page: AppPage) => void
}

export function useGulyApp(): GulyAppProvider {
  const provider = inject<GulyAppProvider>('GULY_APP')

  if (import.meta.env.DEV && !provider)
    throw new Error('AppProvider is not injected')

  return provider!
}
