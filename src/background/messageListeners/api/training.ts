const API_TRAINING = {
  'TRAINING.getList': async (message: any) => {
    try {
      const res = await fetch('https://www.luogu.com.cn/training/list')
      if (!res.ok)
        return { error: `HTTP ${res.status}` }
      const html = await res.text()
      const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
      if (match?.[1])
        return JSON.parse(match[1])
      return { error: 'No data found' }
    }
    catch (e: any) {
      return { error: e.message || 'Network error' }
    }
  },
  'TRAINING.getDetail': async (message: any) => {
    try {
      const res = await fetch(`https://www.luogu.com.cn/training/${message.id}`)
      if (!res.ok)
        return { error: `HTTP ${res.status}` }
      const html = await res.text()
      const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
      if (match?.[1])
        return JSON.parse(match[1])
      return { error: 'No data found' }
    }
    catch (e: any) {
      return { error: e.message || 'Network error' }
    }
  },
}

export default API_TRAINING
