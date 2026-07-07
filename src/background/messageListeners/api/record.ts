const API_RECORD = {
  'RECORD.getList': async (message: any) => {
    const { page = 1 } = message
    const qs = Number(page) > 1 ? `?page=${page}` : ''
    try {
      const res = await fetch(`https://www.luogu.com.cn/record/list${qs}`)
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const html = await res.text()
      const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
      if (match?.[1]) return JSON.parse(match[1])
      return { error: 'No data found' }
    } catch (e: any) {
      return { error: e.message || 'Network error' }
    }
  },
}

export default API_RECORD
