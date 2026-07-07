import { createPinia } from 'pinia'
import type { App } from 'vue'

import components from '~/components'
import { i18n } from '~/utils/i18n'

const pinia = createPinia()

export async function setupApp(app: App) {
  app.config.globalProperties.$app = { context: 'content-script' }
  app.provide('app', app.config.globalProperties.$app)
  app.use(i18n)
  app.use(components)
  app.use(pinia)
}
