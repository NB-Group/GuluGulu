const API_PROBLEM = {
  'PROBLEM.getList': async (message: any) => {
    const { page = 1, difficulty = '', keyword = '', tag = '', type = '' } = message
    const params = new URLSearchParams()
    if (Number(page) > 1) params.set('page', String(page))
    if (difficulty) params.set('difficulty', String(difficulty))
    if (keyword) params.set('keyword', keyword)
    if (tag) params.set('tag', String(tag))
    if (type) params.set('type', type)
    const qs = params.toString()
    const url = `https://www.luogu.com.cn/problem/list${qs ? '?' + qs : ''}`

    // credentials:'include' — background SW origin ≠ luogu, so 'same-origin' (fetch default)
    // sends no cookies and trips Luogu's C3VK anti-bot challenge (302 → no lentille-context).
    // host_permissions + cookies permission let the SW attach the browser's luogu cookie jar.
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const html = await res.text()
    const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (match?.[1]) {
      const data = JSON.parse(match[1])
      return data
    }
    if (html.includes('login-form') || html.includes('请先登录') || html.includes('user-login')) return { __needLogin: true }
    return { error: 'No data found' }
  },
}

export default API_PROBLEM
