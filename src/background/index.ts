import browser from 'webextension-polyfill'

import { setupApiMsgLstnrs } from './messageListeners/api'
import { setupTabMsgLstnrs } from './messageListeners/tabs'

browser.runtime.onInstalled.addListener(async () => {
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
      if (!details.documentUrl || !isExtensionUri(details.documentUrl))
        return

      const requestHeaders: browser.WebRequest.HttpHeaders = []
      details.requestHeaders = details.requestHeaders || []
      for (let i = 0; i < details.requestHeaders.length; i++) {
        const name = details.requestHeaders[i].name.toLowerCase()
        if (name === 'origin' || name === 'referer') {
          requestHeaders.push({ name: details.requestHeaders[i].name, value: 'https://www.luogu.com.cn' })
        }
        else {
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
