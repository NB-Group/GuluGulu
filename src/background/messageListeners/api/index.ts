import browser from 'webextension-polyfill'

import { apiListenerFactory } from '../../utils'
import API_BLOG from './blog'
import API_CONTEST from './contest'
import API_HOME from './home'
import API_PROBLEM from './problem'
import API_RANKING from './ranking'
import API_RECORD from './record'
import API_TRAINING from './training'
import API_USER from './user'

export const API_COLLECTION = {
  PROBLEM: API_PROBLEM,
  CONTEST: API_CONTEST,
  USER: API_USER,
  BLOG: API_BLOG,
  RANKING: API_RANKING,
  TRAINING: API_TRAINING,
  RECORD: API_RECORD,
  HOME: API_HOME,

  [Symbol.iterator]() {
    return Object.values(this).values()
  },
}

// Merge all API objects into one
const FullAPI = Object.assign({}, ...API_COLLECTION)
// Create a message listener for each API
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
