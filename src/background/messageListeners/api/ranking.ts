const API_RANKING = {
  'RANKING.getList': async (message: any) => {
    try {
      const { page = 1 } = message
      const qs = Number(page) > 1 ? `?page=${page}` : ''
      const url = `https://www.luogu.com.cn/ranking${qs}`
      const res = await fetch(url)
      if (!res.ok)
        return { error: `HTTP ${res.status}` }
      const html = await res.text()
      const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
      if (match?.[1])
        return JSON.parse(match[1])
      return { error: 'No data' }
    }
    catch (e: any) { return { error: e.message } }
  },
  'RANKING.getUserRank': async (message: any) => {
    try {
      const uid = message.uid
      if (!uid)
        return { error: 'Missing uid' }
      const res = await fetch(`https://www.luogu.com.cn/user/${uid}`)
      if (!res.ok)
        return { error: `HTTP ${res.status}` }
      const html = await res.text()
      const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
      if (match?.[1])
        return JSON.parse(match[1])
      return { error: 'No data' }
    }
    catch (e: any) { return { error: e.message } }
  },
}

export default API_RANKING
