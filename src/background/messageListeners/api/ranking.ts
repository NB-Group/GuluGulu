const API_RANKING = {
  'RANKING.getList': async (message: any) => {
    try {
      const { page = 1 } = message
      const qs = Number(page) > 1 ? `?page=${page}` : ''
      const url = `https://www.luogu.com.cn/ranking${qs}`
      // credentials:'include' — see problem.ts. SW origin ≠ luogu, default sends no cookies.
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const html = await res.text()
      const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
      if (match?.[1]) return JSON.parse(match[1])
      if (html.includes('login-form') || html.includes('请先登录') || html.includes('user-login')) return { __needLogin: true }
      return { error: 'No data' }
    } catch (e: any) { return { error: e.message } }
  },
}

export default API_RANKING
