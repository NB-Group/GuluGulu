import browser from 'webextension-polyfill'

import { setupApiMsgLstnrs } from './messageListeners/api'
import { setupTabMsgLstnrs } from './messageListeners/tabs'

browser.runtime.onInstalled.addListener(async () => {
  // eslint-disable-next-line no-console
  console.log('GuluGulu extension installed')
})

function isExtensionUri(url: string) {
  return new URL(url).origin === new URL(browser.runtime.getURL('')).origin
}

// eslint-disable-next-line node/prefer-global/process
if (process.env.FIREFOX) {
  browser.webRequest.onBeforeSendHeaders.addListener(
    async (details: any) => {
      // Only modify requests from our extension, never from web pages
      if (!details.documentUrl || !isExtensionUri(details.documentUrl)) return

      const requestHeaders: browser.WebRequest.HttpHeaders = []
      details.requestHeaders = details.requestHeaders || []
      for (let i = 0; i < details.requestHeaders.length; i++) {
        const name = details.requestHeaders[i].name.toLowerCase()
        if (name === 'origin' || name === 'referer') {
          requestHeaders.push({ name: details.requestHeaders[i].name, value: 'https://www.luogu.com.cn' })
        } else {
          requestHeaders.push(details.requestHeaders[i])
        }

        if (details.requestHeaders[i].name === 'firefox-multi-account-cookie') {
          requestHeaders.push({ name: 'cookie', value: details.requestHeaders[i].value })
        }
      }

      return { ...details, requestHeaders }
    },
    { urls: ['<all_urls>'] },
    ['blocking', 'requestHeaders'],
  )
}

// Setup all message listeners
setupApiMsgLstnrs()
setupTabMsgLstnrs()

// 启动灯日志:SW 控制台看到这行 = 新版后台确实在跑(排查「旧构建/未应答」类问题第一步)
console.log('[guly-ai SW] booted · proto v2 · listeners ready')
