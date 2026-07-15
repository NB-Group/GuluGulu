interface Message {
  contentScriptQuery: string
  [key: string]: any
}

type APIFunction = (message: Message, sender?: any, sendResponse?: Function) => any
export type APIType = APIFunction
export interface APIMAP {
  [key: string]: APIType
}

function apiListenerFactory(API_MAP: APIMAP) {
  return async (message: Message) => {
    const contentScriptQuery = message.contentScriptQuery
    if (!contentScriptQuery || !API_MAP[contentScriptQuery])
      return console.error(`Cannot find this contentScriptQuery: ${contentScriptQuery}`)
    return (API_MAP[contentScriptQuery] as APIFunction)(message)
  }
}

export { apiListenerFactory, type Message }
