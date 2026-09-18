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
 * port 协议统一为 {chunk}/{reasoning}/{done}/{error}/{truncated}/{toolCalls},格式差异全部在本层消化。
 *  - {truncated:'max_tokens'}:OpenAI finish_reason==='length' / Anthropic stop_reason==='max_tokens',
 *    上层据此走续写缝合(此前 SW 从不发这个消息,m.truncated 是死代码,本次补上)。
 *  - {toolCalls:[{id,name,argsJson}]}:流式 tool_calls 归一(SseToolCallTracker),永远先于 {done}。
 *    工具本体由内容脚本在本地 dispatch,SW 只透传 tools 数组并翻译格式。
 */
import browser from 'webextension-polyfill'

import { enforceAiPolicy } from './ai.policy'
import { SseToolCallTracker } from './aiTools'

/** port 协议版本:内容脚本(aiTutor.ts 有同名常量)据此检测「SW 是旧构建」并提示重载。改协议时 +1。 */
const AI_PROTO_VERSION = 3

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
    tools = [],
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
    // 内容脚本统一发 OpenAI 形状的工具轮消息(assistant.tool_calls / role:'tool'),
    // Anthropic 格式在这里翻译:tool_use 块 / user+tool_result 块,并折叠连续同 role。
    const rest = toAnthropicMessages(messages.filter((m: any) => m?.role !== 'system'))
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
    if (tools.length) {
      body.tools = tools.map((t: any) => ({
        name: t?.function?.name,
        description: t?.function?.description,
        input_schema: t?.function?.parameters ?? { type: 'object', properties: {} },
      }))
    }
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
  // 工具(chat only,原生 tool calling;schema 走 body 不进 system prompt)
  if (tools.length && !isFim) {
    body.tools = tools
    body.tool_choice = 'auto'
  }
  return { url, body }
}

/**
 * OpenAI 形状 → Anthropic Messages 形状(工具轮翻译 + role 折叠):
 *  - assistant + tool_calls → content:[已有文本?, tool_use...] (arguments JSON.parse → input,失败 {})
 *  - role:'tool'            → { role:'user', content:[{type:'tool_result', tool_use_id, content}] }
 *  - 折叠连续同 role(content 数组合并):并行 tool_result、续写轮的「继续」user 都需要
 *    (部分 Anthropic 版本校验 user/assistant 严格交替)。
 */
function toAnthropicMessages(messages: any[]): any[] {
  const out: any[] = []
  const push = (role: string, content: any[]) => {
    const last = out[out.length - 1]
    if (last && last.role === role && Array.isArray(last.content))
      last.content.push(...content) // 折叠连续同 role
    else
      out.push({ role, content })
  }
  for (const m of messages) {
    if (m?.role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: String(m.tool_call_id || ''), content: String(m.content ?? '') }])
      continue
    }
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const blocks: any[] = []
      const text = String(m.content ?? '').trim()
      if (text)
        blocks.push({ type: 'text', text })
      for (const tc of m.tool_calls) {
        let input: any = {}
        try { input = JSON.parse(tc?.function?.arguments || '{}') }
        catch { /* 截断的 arguments → 空 input,内容脚本会给 tool_result 报错让模型重调 */ }
        blocks.push({ type: 'tool_use', id: String(tc?.id || ''), name: String(tc?.function?.name || ''), input })
      }
      push('assistant', blocks)
      continue
    }
    push(String(m?.role || 'user'), [{ type: 'text', text: String(m.content ?? '') }])
  }
  return out
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

/** 单条 SSE data JSON → 归一化 {chunk?}/{reasoning?}/{done?}/{error?}/{truncated?},两格式通用。(导出供单测) */
export function sseJsonToPortMessage(j: any, isFim: boolean, apiFormat: string): { chunk?: string, reasoning?: string, done?: boolean, error?: string, truncated?: string } | null {
  if (apiFormat === 'anthropic') {
    const t = j?.type
    if (t === 'content_block_delta') {
      if (j?.delta?.text)
        return { chunk: j.delta.text }
      if (j?.delta?.thinking)
        return { reasoning: j.delta.thinking }
      return null
    }
    if (t === 'message_delta') {
      if (j?.delta?.stop_reason === 'max_tokens')
        return { truncated: 'max_tokens' }
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
  if (ch?.finish_reason === 'length')
    return { truncated: 'max_tokens' }
  return null
}

// 流式:port 收到首条参数消息后开 SSE 流,逐 chunk post 回内容脚本。
// ★ 回程双通道:SW→页面的 port 投递在 MV3 下实测不可靠(页面→SW 通,SW ack/chunk 页面收不到)。
// 消息带 tutorId 时(导师流)改走 tabs.sendMessage 定向回传(可靠);无 tutorId(补全 ghost)
// 仍走 port(该路径历史工作正常)。两条路径由 tutorId 互斥,页面不会收到重复。
export function handleAiStreamPort(port: any) {
  const tabId = (port as any)?.sender?.tab?.id
  let tutorRoute: { tabId: number, tutorId: string } | null = null
  const reply = (msg: any) => {
    if (tutorRoute) {
      browser.tabs.sendMessage(tutorRoute.tabId, { tutorStream: tutorRoute.tutorId, m: msg })
        .catch(() => { /* tab 已关/刷新 */ })
    }
    else {
      try { port.postMessage(msg) }
      catch { /* port 已死 */ }
    }
  }
  port.onMessage.addListener(async (message: any) => {
    if (message?.tutorId && tabId != null && !tutorRoute) {
      tutorRoute = { tabId, tutorId: message.tutorId }
      console.log('[guly-ai SW] tutor stream → tabs.sendMessage 回传, tabId=', tabId)
    }
    // 探活:内容脚本 ack 丢失(MV3 port 竞态)时发 ping,回 pong(带协议版本)
    if (message?.ping) {
      reply({ pong: true, v: AI_PROTO_VERSION })
      return
    }
    // ⚠️ abort 只给 streamOnce 内的 onAbort 用(取消在途 fetch),绝不能落进主流程 ——
    // 否则页面 cleanup 发 {abort} 会被当成新流请求,再起一条垃圾 fetch + 搅浑回传。
    if (message?.abort) {
      console.log('[guly-ai SW] abort received(由 streamOnce 的 onAbort 处理)')
      return
    }
    // 立刻 ack:内容脚本据此区分「SW 没收到消息」与「fetch 在途」。
    // 整个 listener 包 try/catch:任何崩溃(异常/上下文失效)都把原因回传+打到 SW 控制台,
    // 不再让内容脚本只能看到「连接中断」猜原因。
    console.log('[guly-ai SW] stream req received · apiFormat=', message?.apiFormat, '· mode=', message?.mode, '· intensity=', message?.intensity)
    reply({ ack: true, v: AI_PROTO_VERSION })
    try {
      await streamOnce(port, reply, message)
    }
    catch (e: any) {
      const why = `${e?.message || e}\n${String(e?.stack || '').split('\n').slice(1, 3).join(' | ')}`
      console.error('[guly-ai SW] stream handler crashed:', why)
      reply({ error: `SW 异常:${String(why).slice(0, 200)}` })
    }
  })
}

async function streamOnce(port: any, reply: (m: any) => void, message: any) {
  {
    const pol = enforceAiPolicy(message)
    if (!pol.allowed) {
      reply({ blocked: true, reason: pol.reason, done: true })
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
        reply({ error: `HTTP ${res.status} ${res.statusText || ''} · ${text.slice(0, 200)}`.trim() })
        return
      }
      const reader = (res.body as any).getReader()
      // 内容脚本放弃(超时/关面板/新请求)→ 取消在途 fetch,释放中转/模型并发
      const onAbort = (m: any) => {
        if (m?.abort) {
          console.log('[guly-ai SW] 收到 abort,取消在途 fetch')
          try { reader.cancel() }
          catch { /* ignore */ }
        }
      }
      port.onMessage.addListener(onAbort)
      let firstChunkLogged = false
      const decoder = new TextDecoder()
      let buf = ''
      let lastKa = 0
      let lineCount = 0
      let chunkCount = 0
      // 流式 tool_calls 累积(协议 v3):归一后一次性 {toolCalls} 回传,内容脚本本地 dispatch
      const tracker = new SseToolCallTracker(apiFormat)
      const flushTools = () => {
        const calls = tracker.flush()
        if (calls.length) {
          console.log('[guly-ai SW] tool calls completed:', calls.map(c => c.name).join(','))
          reply({ toolCalls: calls }) // ⚠️ 永远先于 {done:true} 发出,内容脚本靠 done 触发工具轮
        }
      }
      const ka = () => {
        // 保活信号透传(≥5s 节流):HTTP 200 后模型可能思考/排队很久才吐首 token,
        // 中转靠 : keepalive / ping 维持连接;内容脚本据此给看门狗续命,区分「模型慢」与「连接挂」
        const now = Date.now()
        if (now - lastKa > 5000) {
          lastKa = now
          reply({ ka: 1 })
        }
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[guly-ai SW] body 流结束 · SSE行=', lineCount, 'chunk=', chunkCount)
          break
        }
        if (!firstChunkLogged) {
          firstChunkLogged = true
          console.log('[guly-ai SW] first body chunk arrived', value?.length, 'bytes · ct=', res.headers?.get?.('content-type'))
        }
        buf += decoder.decode(value, { stream: true })
        // ⚠️ 行循环必须用 for(;;)+break:continue 不能跳过「重扫换行下标」。
        // 旧 while(nl>=0) 写法里 event:/注释行/空行的 continue 路径带着过期 nl 回到
        // 条件判断 → buffer 切片错位 → 吞数据行 / 空 buf 死循环(anthropic 流每条
        // data: 前都有 event: 行,必中;OpenAI 无 event: 行,从不触发 —— 故补全正常导师必死)。
        for (;;) {
          const nl = buf.indexOf('\n')
          if (nl < 0)
            break
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line)
            continue
          if (line.startsWith(':')) { // SSE 注释行(: keepalive)
            ka()
            continue
          }
          if (!line.startsWith('data:'))
            continue // anthropic 的 event: 行天然跳过
          const data = line.slice(5).trim()
          if (!data)
            continue
          lineCount++
          if (lineCount <= 3 || lineCount % 20 === 0)
            console.log('[guly-ai SW] SSE line', lineCount, ':', data.slice(0, 140))
          if (data === '[DONE]') { // OpenAI 结束哨兵
            console.log('[guly-ai SW] [DONE] · 共', lineCount, '行')
            flushTools()
            reply({ done: true })
            return
          }
          try {
            const j = JSON.parse(data)
            tracker.feed(j)
            const m = sseJsonToPortMessage(j, isFim, apiFormat)
            if (m) {
              chunkCount++
              if (m.error)
                console.warn('[guly-ai SW] SSE error event:', m.error)
              if (m.done)
                flushTools() // anthropic message_stop:工具调用先于 done 回传
              reply(m)
              if (m.done)
                return
            }
            else {
              ka() // message_start/ping 等无负载事件:也算连接活着
            }
          }
          catch { /* keep-alive / 非 JSON 行,忽略 */ }
        }
      }
      // body 流自然结束(无 [DONE]/message_stop):同样先 flush 工具再收场
      flushTools()
      reply({ done: true })
    }
    catch (e: any) {
      // fetch/SSE 阶段错误:带 HTTP 状态与响应体片段回传,内容脚本原样上屏
      reply({ error: e?.message || 'network error' })
    }
  }
}

export default API_AI
