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

const FullAPI = Object.assign({}, ...API_COLLECTION)
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
