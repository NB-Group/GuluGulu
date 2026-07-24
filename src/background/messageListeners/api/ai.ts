/**
 * AI 补全中继:内容脚本(在 luogu origin)直接 fetch OpenAI 兼容端点会触发 CORS,
 * 故由 background SW(chrome-extension origin,不受页面 CORS)代发。需 manifest
 * host_permissions 覆盖目标域(baseURL 用户自定义,任意域 → 通配所有 host)。
 */
const API_AI = {
  AIComplete: async (message: any) => {
    const { baseURL = '', apiKey = '', model = '', messages = [], maxTokens = 256, temperature = 0.2 } = message
    const base = baseURL.replace(/\/+$/, '')
    // 用户 baseURL 可能已含 /v1 或不含;统一补 /chat/completions
    const url = `${base}/chat/completions`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: false }),
      })
      const text = await res.text()
      if (!res.ok)
        return { ok: false, status: res.status, error: text.slice(0, 240) || `HTTP ${res.status}` }
      const json = JSON.parse(text)
      const content: string = json?.choices?.[0]?.message?.content || ''
      return { ok: true, content }
    }
    catch (e: any) {
      return { ok: false, error: e?.message || 'network error' }
    }
  },
}

export default API_AI
