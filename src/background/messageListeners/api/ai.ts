/**
 * AI 补全中继:内容脚本(在 luogu origin)直连 OpenAI 兼容端点会 CORS,故由 background
 * SW(chrome-extension origin)代发。manifest host_permissions 通配所有 host 覆盖自定义端点。
 *
 * 两种模式:
 *  - mode==='fim':POST {base}/completions,body {model,prompt,suffix,max_tokens,stop,...},
 *    返回 {ok, content: choices[0].text}(DeepSeek 等 FIM 代码补全,beta base)。
 *  - 其它(默认 chat):POST {base}/chat/completions,body {model,messages,...},
 *    返回 {ok, content: choices[0].message.content}。
 *
 * 另有流式版本 handleAiStreamPort:用 runtime.connect port 边读 SSE 边把 chunk 推回内容脚本,
 * 让 Monaco 的 ghost 能逐字更新。fim 取 choices[0].text,chat 取 choices[0].delta.content。
 */
function buildUrlAndBody(message: any): { url: string, body: any } {
  const {
    mode = 'chat',
    baseURL = '',
    model = '',
    messages = [],
    prompt = '',
    suffix = '',
    maxTokens = 256,
    temperature = 0.2,
    stop = [],
  } = message
  const base = baseURL.replace(/\/+$/, '')
  const isFim = mode === 'fim'
  // DeepSeek 的 FIM 必须走 /beta base(报 "completions api is only available when using
  // beta api")。用户填普通 host 或 /v1 时,FIM 自动补 /beta;chat 不动。
  let fimBase = base
  if (isFim && /deepseek\.com/i.test(base) && !/\/beta$/i.test(base))
    fimBase = base.replace(/\/v1$/i, '') + '/beta'
  const url = `${isFim ? fimBase : base}${isFim ? '/completions' : '/chat/completions'}`
  const body = isFim
    ? { model, prompt, suffix, max_tokens: maxTokens, temperature, stop, stream: true }
    : { model, messages, max_tokens: maxTokens, temperature, stop, stream: true }
  return { url, body }
}

function authHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

// 非流式(设置面板「测试连接」用)
const API_AI = {
  AIComplete: async (message: any) => {
    const { url, body } = buildUrlAndBody({ ...message, /* 测试连接强制非流式 */ })
    const nonStreamBody = { ...body, stream: false }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(message.apiKey || ''),
        body: JSON.stringify(nonStreamBody),
      })
      const text = await res.text()
      if (!res.ok)
        return { ok: false, status: res.status, url, error: text.slice(0, 240) || `HTTP ${res.status}` }
      const json = JSON.parse(text)
      const content: string = message.mode === 'fim'
        ? (json?.choices?.[0]?.text || '')
        : (json?.choices?.[0]?.message?.content || '')
      return { ok: true, url, content }
    }
    catch (e: any) {
      return { ok: false, error: e?.message || 'network error' }
    }
  },
}

// 流式:port 收到首条参数消息后开 SSE 流,逐 chunk post 回内容脚本
export function handleAiStreamPort(port: any) {
  port.onMessage.addListener(async (message: any) => {
    const isFim = message?.mode === 'fim'
    const { url, body } = buildUrlAndBody(message)
    try {
      const res = await fetch(url, { method: 'POST', headers: authHeaders(message.apiKey || ''), body: JSON.stringify(body) })
      if (!res.ok || !res.body) {
        const text = res.ok ? 'no body' : await res.text()
        try { port.postMessage({ error: text.slice(0, 240) || `HTTP ${res.status}` }) } catch {}
        return
      }
      const reader = (res.body as any).getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done)
          break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:'))
            continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') {
            if (data === '[DONE]') {
              try { port.postMessage({ done: true }) } catch {}
              return
            }
            continue
          }
          try {
            const j = JSON.parse(data)
            const ch = j?.choices?.[0]
            const chunk: string = isFim
              ? (ch?.text || '')
              : (ch?.delta?.content || ch?.text || '')
            // 推理模型(deepseek-reasoner 等)把内容放 reasoning_content、content 可能为空;
            // 一并推回,内容侧作兜底。
            const reasoning: string = !isFim ? (ch?.delta?.reasoning_content || '') : ''
            if (chunk) {
              try { port.postMessage({ chunk }) } catch { return }
            }
            if (reasoning) {
              try { port.postMessage({ reasoning }) } catch { return }
            }
          }
          catch { /* keep-alive / 非 JSON 行,忽略 */ }
        }
      }
      try { port.postMessage({ done: true }) } catch {}
    }
    catch (e: any) {
      try { port.postMessage({ error: e?.message || 'network error' }) } catch {}
    }
  })
}

export default API_AI
