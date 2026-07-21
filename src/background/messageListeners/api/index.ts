import browser from 'webextension-polyfill'

import { apiListenerFactory } from '../../utils'
import API_CONTEST from './contest'
import API_HOME from './home'
import API_PROBLEM from './problem'
import API_RANKING from './ranking'

export const API_COLLECTION = {
  PROBLEM: API_PROBLEM,
  CONTEST: API_CONTEST,
  RANKING: API_RANKING,
  HOME: API_HOME,

  [Symbol.iterator]() {
    return Object.values(this).values()
  },
}

const FullAPI = Object.assign({}, ...API_COLLECTION, {
  // 截取当前可见 tab 画面(MV3 SW,洛谷 host 权限已声明 → 可用),
  // 返回 PNG data URL。供主题切换动画在扩散圆外显示真实旧主题内容,而非平涂色块。
  CAPTURE_TAB: async () => {
    try {
      const url = await browser.tabs.captureVisibleTab(undefined, { format: 'png' })
      return { ok: true, url }
    }
    catch (e: any) {
      return { ok: false, error: String(e) }
    }
  },
})
const handleMessage = apiListenerFactory(FullAPI)

export function setupApiMsgLstnrs() {
  browser.runtime.onMessage.removeListener(handleMessage)
  browser.runtime.onMessage.addListener(handleMessage)

  browser.runtime.onConnect.removeListener(handleConnect)
  browser.runtime.onConnect.addListener(handleConnect)
}

function handleConnect() {
  browser.runtime.onMessage.removeListener(handleMessage)
  browser.runtime.onMessage.addListener(handleMessage)
}
