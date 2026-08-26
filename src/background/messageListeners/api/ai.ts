/**
 * AI 中继:内容脚本(在 luogu origin)直连 AI 端点会 CORS,故由 background
 * SW(chrome-extension origin)代发。manifest host_permissions 通配所有 host 覆盖自定义端点。
 *
 * 两种接口格式(按 message.apiFormat 分支,归一化后回推,内容脚本无感):
 *  - openai(默认):
 *    · mode==='fim':POST {base}/completions,body {model,prompt,suffix,max_tokens,stop},
 *      流式取 choices[0].text(DeepSeek 等 FIM,beta base)。
 *    · chat:POST {base}/chat/completions,body {model,messages},流式取
 *      choices[0].delta.content(+reasoning_content 推理兜底),[DONE] 结束。
 *  - anthropic:POST {base}(/v1)/messages,headers x-api-key + anthropic-version,
 *    system 是顶层参数(从 messages 里拎出),流式事件 content_block_delta 的
 *    delta.text → chunk、delta.thinking → reasoning,message_stop → done。
 *
 * port 协议统一为 {chunk}/{reasoning}/{done}/{error},格式差异全部在本层消化。
 */
import { enforceAiPolicy } from './ai.policy'

/** port 协议版本:内容脚本(aiTutor.ts 有同名常量)据此检测「SW 是旧构建」并提示重载。改协议时 +1。 */
const AI_PROTO_VERSION = 2

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
    apiFormat = 'openai',
    disableThinking = false,
  } = message
  const base = baseURL.replace(/\/+$/, '')

  // ---- Anthropic Messages API ----
  if (apiFormat === 'anthropic') {
    // Anthropic 无 FIM,一律 chat。base 已含 /v1 则直接拼 /messages,否则补 /v1。
    const url = /\/v1$/i.test(base) ? `${base}/messages` : `${base}/v1/messages`
    // system 必须是顶层参数;从 messages 里拎出所有 system 条目拼接
    const sys = messages
      .filter((m: any) => m?.role === 'system')
      .map((m: any) => String(m.content ?? ''))
      .filter(Boolean)
      .join('\n\n')
    const rest = messages.filter((m: any) => m?.role !== 'system')
    const body: any = {
      model,
      messages: rest,
      max_tokens: Math.max(1, maxTokens | 0), // Anthropic 必填
      stream: true,
    }
    if (sys)
      body.system = sys
    if (temperature != null)
      body.temperature = temperature
    // 关思考:GLM 等经中转思考时上游长时间零输出(>420s),导师默认直出。
    // new-api 类中转会把它译成 enable_thinking=false。
    if (disableThinking)
      body.thinking = { type: 'disabled' }
    return { url, body }
  }

  // ---- OpenAI 兼容 ----
  const isFim = mode === 'fim'
  // DeepSeek 的 FIM 必须走 /beta base(报 "completions api is only available when using
  // beta api")。用户填普通 host 或 /v1 时,FIM 自动补 /beta;chat 不动。
  let fimBase = base
  if (isFim && /deepseek\.com/i.test(base) && !/\/beta$/i.test(base))
    fimBase = `${base.replace(/\/v1$/i, '')}/beta`
  const url = `${isFim ? fimBase : base}${isFim ? '/completions' : '/chat/completions'}`
  const body: any = isFim
    ? { model, prompt, suffix, max_tokens: maxTokens, temperature, stop, stream: true }
    : { model, messages, max_tokens: maxTokens, temperature, stop, stream: true }
  // 关思考(chat only):GLM 惯例 thinking:{type:'disabled'},Qwen/new-api 惯例 enable_thinking:false。
  // 两字段都带 —— 不认识的服务端按未知字段忽略,无副作用。
  if (disableThinking && !isFim) {
    body.thinking = { type: 'disabled' }
    body.enable_thinking = false
  }
  return { url, body }
}

function authHeaders(apiKey: string, apiFormat = 'openai') {
  if (apiFormat === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'anthropic-version': '2023-06-01',
    }
  }
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

/** 非流式响应正文提取(两格式归一)。 */
function extractNonStreamContent(json: any, mode: string, apiFormat: string): string {
  if (apiFormat === 'anthropic') {
    // content 是块数组(text/thinking/...),拼全部 text 块
    const blocks = Array.isArray(json?.content) ? json.content : []
    return blocks.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join('')
  }
  return mode === 'fim'
    ? (json?.choices?.[0]?.text || '')
    : (json?.choices?.[0]?.message?.content || '')
}

// 非流式(设置面板「测试连接」用)
const API_AI = {
  AIComplete: async (message: any) => {
    const pol = enforceAiPolicy(message)
    if (!pol.allowed)
      return { ok: false, blocked: true, reason: pol.reason }
    const guarded = { ...message, mode: pol.mode, maxTokens: pol.maxTokens, stop: pol.stop }
    const apiFormat = guarded.apiFormat || 'openai'
    const { url, body } = buildUrlAndBody({ ...guarded /* 测试连接强制非流式 */ })
    const nonStreamBody = { ...body, stream: false }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(message.apiKey || '', apiFormat),
        body: JSON.stringify(nonStreamBody),
      })
      const text = await res.text()
      if (!res.ok)
        return { ok: false, status: res.status, url, error: text.slice(0, 240) || `HTTP ${res.status}` }
      const json = JSON.parse(text)
      return { ok: true, url, content: extractNonStreamContent(json, message.mode || 'chat', apiFormat) }
    }
    catch (e: any) {
      return { ok: false, error: e?.message || 'network error' }
    }
  },
}

/** 单条 SSE data JSON → 归一化 {chunk?}/{reasoning?}/{done?}/{error?},两格式通用。(导出供单测) */
export function sseJsonToPortMessage(j: any, isFim: boolean, apiFormat: string): { chunk?: string, reasoning?: string, done?: boolean, error?: string } | null {
  if (apiFormat === 'anthropic') {
    const t = j?.type
    if (t === 'content_block_delta') {
      if (j?.delta?.text)
        return { chunk: j.delta.text }
      if (j?.delta?.thinking)
        return { reasoning: j.delta.thinking }
      return null
    }
    if (t === 'message_stop')
      return { done: true }
    if (t === 'error')
      return { error: String(j?.error?.message || 'anthropic stream error') }
    return null // message_start / ping / content_block_start 等忽略
  }
  const ch = j?.choices?.[0]
  const chunk: string = isFim
    ? (ch?.text || '')
    : (ch?.delta?.content || ch?.text || '')
  // 推理模型(deepseek-reasoner 等)把内容放 reasoning_content、content 可能为空;
  // 一并推回,内容侧作兜底。
  const reasoning: string = !isFim ? (ch?.delta?.reasoning_content || '') : ''
  if (chunk)
    return { chunk }
  if (reasoning)
    return { reasoning }
  return null
}

// 流式:port 收到首条参数消息后开 SSE 流,逐 chunk post 回内容脚本
export function handleAiStreamPort(port: any) {
  port.onMessage.addListener(async (message: any) => {
    // 探活:内容脚本 ack 丢失(MV3 port 竞态)时发 ping,回 pong(带协议版本)
    if (message?.ping) {
      try { port.postMessage({ pong: true, v: AI_PROTO_VERSION }) }
      catch { /* port 已死 */ }
      return
    }
    // 立刻 ack:内容脚本据此区分「SW 没收到消息」与「fetch 在途」。
    // 整个 listener 包 try/catch:任何崩溃(异常/上下文失效)都把原因回传+打到 SW 控制台,
    // 不再让内容脚本只能看到「连接中断」猜原因。
    console.log('[guly-ai SW] stream req received · apiFormat=', message?.apiFormat, '· mode=', message?.mode, '· intensity=', message?.intensity)
    try {
      port.postMessage({ ack: true, v: AI_PROTO_VERSION })
    }
    catch (e: any) {
      console.error('[guly-ai SW] ack postMessage failed:', e?.message || e)
    }
    try {
      await streamOnce(port, message)
    }
    catch (e: any) {
      const why = `${e?.message || e}\n${String(e?.stack || '').split('\n').slice(1, 3).join(' | ')}`
      console.error('[guly-ai SW] stream handler crashed:', why)
      try {
        port.postMessage({ error: `SW 异常:${String(why).slice(0, 200)}` })
      }
      catch { /* port 已死 */ }
    }
  })
}

async function streamOnce(port: any, message: any) {
  {
    const pol = enforceAiPolicy(message)
    if (!pol.allowed) {
      try {
        port.postMessage({ blocked: true, reason: pol.reason, done: true })
      }
      catch {}
      return
    }
    const guarded = { ...message, mode: pol.mode, maxTokens: pol.maxTokens, stop: pol.stop }
    const isFim = guarded.mode === 'fim'
    const apiFormat = guarded.apiFormat || 'openai'
    const { url, body } = buildUrlAndBody(guarded)
    try {
      console.log('[guly-ai SW] fetching →', url.replace(/\/\/[^/]+/, '//<host>'), `(${Math.round(JSON.stringify(body).length / 1024)}KB body)`)
      const res = await fetch(url, { method: 'POST', headers: authHeaders(message.apiKey || '', apiFormat), body: JSON.stringify(body) })
      console.log('[guly-ai SW] ← HTTP', res.status, res.statusText)
      if (!res.ok || !res.body) {
        const text = res.ok ? 'no body' : await res.text()
        try {
          port.postMessage({ error: `HTTP ${res.status} ${res.statusText || ''} · ${text.slice(0, 200)}`.trim() })
        }
        catch {}
        return
      }
      const reader = (res.body as any).getReader()
      // 内容脚本放弃(超时/关面板/新请求)→ 取消在途 fetch,释放中转/模型并发
      const onAbort = (m: any) => {
        if (m?.abort) {
          try { reader.cancel() }
          catch { /* ignore */ }
        }
      }
      port.onMessage.addListener(onAbort)
      let firstChunkLogged = false
      const decoder = new TextDecoder()
      let buf = ''
      let lastKa = 0
      const ka = () => {
        // 保活信号透传(≥5s 节流):HTTP 200 后模型可能思考/排队很久才吐首 token,
        // 中转靠 : keepalive / ping 维持连接;内容脚本据此给看门狗续命,区分「模型慢」与「连接挂」
        const now = Date.now()
        if (now - lastKa > 5000) {
          lastKa = now
          try { port.postMessage({ ka: 1 }) }
          catch { /* port 已死 */ }
        }
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done)
          break
        if (!firstChunkLogged) {
          firstChunkLogged = true
          console.log('[guly-ai SW] first body chunk arrived', value?.length, 'bytes')
        }
        buf += decoder.decode(value, { stream: true })
        let nl = buf.indexOf('\n')
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (line.startsWith(':')) { // SSE 注释行(: keepalive)
            ka()
            continue
          }
          if (!line.startsWith('data:'))
            continue // anthropic 的 event: 行天然跳过
          const data = line.slice(5).trim()
          if (!data)
            continue
          if (data === '[DONE]') { // OpenAI 结束哨兵
            try { port.postMessage({ done: true }) } catch {}
            return
          }
          try {
            const m = sseJsonToPortMessage(JSON.parse(data), isFim, apiFormat)
            if (m) {
              try { port.postMessage(m) } catch { return }
              if (m.done)
                return
            }
            else {
              ka() // message_start/ping 等无负载事件:也算连接活着
            }
          }
          catch { /* keep-alive / 非 JSON 行,忽略 */ }
          nl = buf.indexOf('\n')
        }
      }
      try {
        port.postMessage({ done: true })
      }
      catch {}
    }
    catch (e: any) {
      // fetch/SSE 阶段错误:带 HTTP 状态与响应体片段回传,内容脚本原样上屏
      try {
        port.postMessage({ error: e?.message || 'network error' })
      }
      catch {}
    }
  }
}

export default API_AI
