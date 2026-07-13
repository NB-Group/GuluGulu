import browser from 'webextension-polyfill'

import { AHS } from '../../utils'

const process = import('node:process')

async function doProblemSubmit(message: any, sender?: any, sendResponse?: Function) {
  const { pid, code, lang, enableO2, csrfToken } = message
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-CSRF-TOKEN': csrfToken || '',
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (process.env.FIREFOX && sender?.tab?.cookieStoreId) {
    const cookies = await browser.cookies.getAll({ storeId: sender.tab.cookieStoreId })
    headers.Cookie = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
  }
  const res = await fetch(`https://www.luogu.com.cn/fe/api/problem/submit/${pid}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, lang: Number(lang), enableO2: enableO2 ? 1 : 0 }),
  })
  const data = await res.json()
  if (sendResponse)
    sendResponse(data)
  return data
}

const API_PROBLEM = {
  'PROBLEM.submit': doProblemSubmit as any,

  'PROBLEM.getList': async (message: any) => {
    const { page = 1, difficulty = '', keyword = '', tag = '', type = '' } = message
    const params = new URLSearchParams()
    if (Number(page) > 1)
      params.set('page', String(page))
    if (difficulty)
      params.set('difficulty', String(difficulty))
    if (keyword)
      params.set('keyword', keyword)
    if (tag)
      params.set('tag', String(tag))
    if (type)
      params.set('type', type)
    const qs = params.toString()
    const url = `https://www.luogu.com.cn/problem/list${qs ? `?${qs}` : ''}`

    console.log('[GuluGulu BG] fetching:', url)
    const res = await fetch(url)
    console.log('[GuluGulu BG] status:', res.status)
    if (!res.ok) {
      return { error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    console.log('[GuluGulu BG] html len:', html.length)
    const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
    if (match?.[1]) {
      const data = JSON.parse(match[1])
      console.log('[GuluGulu BG] parsed OK, count:', data?.data?.problems?.count)
      return data
    }
    console.log('[GuluGulu BG] no lentille-context, html:', html.slice(0, 200))
    return { error: 'No data found' }
  },

  'PROBLEM.getDetail': {
    url: 'https://www.luogu.com.cn/problem/P<%= pid %>',
    _fetch: { method: 'GET' },
    afterHandle: AHS.J_D,
  },
  'PROBLEM.getTags': {
    url: 'https://www.luogu.com.cn/_lfe/tags',
    _fetch: { method: 'GET' },
    params: { type: 'problem' },
    afterHandle: AHS.J_D,
  },
  'PROBLEM.getSolution': {
    url: 'https://www.luogu.com.cn/problem/solution/P<%= pid %>',
    _fetch: { method: 'GET' },
    params: { page: 1 },
    afterHandle: AHS.J_D,
  },
}

export default API_PROBLEM
