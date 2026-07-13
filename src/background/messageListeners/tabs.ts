import browser from 'webextension-polyfill'

export function setupTabMsgLstnrs() {
  browser.runtime.onMessage.addListener((message: any) => {
    if (message?.contentScriptQuery === 'openOptionsPage') {
      browser.runtime.openOptionsPage()
    }
  })
}
