/**
 * AI 补全中继:内容脚本(在 luogu origin)直连 OpenAI 兼容端点会 CORS,故由 background
 * SW(chrome-extension origin)代发。manifest host_permissions 通配所有 host 覆盖自定义端点。
 *
 * 两种模式:
 *  - mode==='fim':POST {base}/completions,body {model,prompt,suffix,max_tokens,...},
 *    返回 {ok, content: choices[0].text}(DeepSeek 等 FIM 代码补全,beta base)。
 *  - 其它(默认 chat):POST {base}/chat/completions,body {model,messages,...},
 *    返回 {ok, content: choices[0].message.content}。
 */
const API_AI = {
  AIComplete: async (message: any) => {
    const {
      mode = 'chat',
      baseURL = '',
      apiKey = '',
      model = '',
      messages = [],
      prompt = '',
      suffix = '',
      maxTokens = 256,
      temperature = 0.2,
    } = message
    const base = baseURL.replace(/\/+$/, '')
    const isFim = mode === 'fim'
    const url = `${base}${isFim ? '/completions' : '/chat/completions'}`
    try {
      const body = isFim
        ? { model, prompt, suffix, max_tokens: maxTokens, temperature, stream: false }
        : { model, messages, max_tokens: maxTokens, temperature, stream: false }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok)
        return { ok: false, status: res.status, error: text.slice(0, 240) || `HTTP ${res.status}` }
      const json = JSON.parse(text)
      const content: string = isFim
        ? (json?.choices?.[0]?.text || '')
        : (json?.choices?.[0]?.message?.content || '')
      return { ok: true, content }
    }
    catch (e: any) {
      return { ok: false, error: e?.message || 'network error' }
    }
  },
}

export default API_AI
