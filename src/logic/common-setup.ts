import { createPinia } from 'pinia'
import type { App } from 'vue'

import components from '~/components'
import { i18n } from '~/utils/i18n'

const pinia = createPinia()

export async function setupApp(app: App) {
  app.config.globalProperties.$app = { context: 'content-script' }
  // 模板表达式访问不到 window/location 全局,但模板里大量用 location.origin 拼接同源 URL,
  // 全局暴露一份,免得逐组件声明。
  app.config.globalProperties.location = typeof location !== 'undefined' ? location : undefined
  app.provide('app', app.config.globalProperties.$app)
  app.use(i18n)
  app.use(components)
  app.use(pinia)
}
