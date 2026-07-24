/**
 * AI inline 补全。两种模式:
 *  - FIM(Fill In the Middle,默认):POST {base}/completions,prompt=光标前 + suffix=光标后,
 *    补中间(DeepSeek 等)。轻/强 走 FIM。
 *  - Chat(思路指引 或 关 FIM):POST {base}/chat/completions,messages(思路指引带题目 markdown)。
 *
 * 网络走 background SW 绕 CORS;**流式**:用 runtime.connect port 边到 token 边回调,
 * 让 Monaco 的 ghost 逐字更新(见 streamInlineCompletion)。与 Monaco 解耦:由 utils/monaco.ts
 * 的 inline provider 调用,由编辑器组件经 setAiState 注入当前设置。
 */
import browser from 'webextension-polyfill'

export type AiIntensity = 'off' | 'light' | 'strong' | 'guide'

interface AiState {
  enabled: boolean
  intensity: AiIntensity
  baseURL: string
  apiKey: string
  model: string
  thinking: boolean
  fim: boolean
  problemMarkdown: string
}

let state: AiState = { enabled: false, intensity: 'off', baseURL: '', apiKey: '', model: '', thinking: false, fim: true, problemMarkdown: '' }
export function setAiState(s: Partial<AiState>) {
  state = { ...state, ...s }
}

const INTENSITY_PROMPT: Record<Exclude<AiIntensity, 'off'>, string> = {
  light: 'Complete ONLY the single syntactic construct currently being typed. No new logic, no full algorithms. Example: prefix "for (int i" -> " = 1; i <= n; i++)". Output ONLY the suffix to append, no markdown, no prose, no code fences.',
  strong: 'Based on the preceding comment or context, generate a complete runnable implementation in the same language. Example: prefix "//bfs" -> the full BFS code. Output ONLY code (no markdown fences, no prose).',
  guide: 'Give ONE short Chinese sentence of algorithmic guidance (max ~40 chars), NOT code. Example: "此处应状态转移 dp[i]=min(dp[i-1]+1,…)". Output ONLY that sentence.',
}

// FIM 力度档(无 system prompt,靠 max_tokens + stop 控长度)
const FIM_CONFIG: Record<'light' | 'strong', { maxTokens: number, stop: string[] }> = {
  light: { maxTokens: 64, stop: ['\n'] },
  strong: { maxTokens: 512, stop: [] },
}

// chat 力度档 token。guide 给到 384:思考模式开启时,推理模型会把 token 花在内部 reasoning,
// 预算太小 → content 还没开始输出就被截断(返回空)。thinking 再 ×2 放宽。
const CHAT_MAXTOKENS: Record<Exclude<AiIntensity, 'off'>, number> = { light: 128, strong: 600, guide: 384 }

const THINKING_SUFFIX
  = '\n\nTHINKING MODE ON: reason step by step internally about the algorithm and edge cases before producing the final answer. Do NOT output your reasoning, output ONLY the final answer in the format above.'

function stripFences(s: string): string {
  return s.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '').trimEnd()
}

/** 组 chat 模式的 messages。guide(思路指引)时带上题目 markdown,让指引贴合本题。 */
function buildChatMessages(intensity: Exclude<AiIntensity, 'off'>, lang: string, prefix: string) {
  const sys = INTENSITY_PROMPT[intensity] + (state.thinking && intensity !== 'light' ? THINKING_SUFFIX : '') + `\nProgramming language: ${lang}.`
  if (intensity === 'guide' && state.problemMarkdown.trim()) {
    const prob = state.problemMarkdown.length > 2400 ? `${state.problemMarkdown.slice(0, 2400)}…` : state.problemMarkdown
    return [
      { role: 'system', content: sys },
      { role: 'user', content: `【题目描述】\n${prob}\n\n【我的代码/草稿(光标前)】\n${prefix}\n\n请针对光标处给一句简短的算法思路。` },
    ]
  }
  return [
    { role: 'system', content: sys },
    { role: 'user', content: prefix },
  ]
}

export function aiGated(): boolean {
  return !state.enabled || state.intensity === 'off' || !state.baseURL || !state.model
}

/** 当前强度是否走 FIM */
export function aiUseFim(): boolean {
  return state.fim && state.intensity !== 'guide' && state.intensity !== 'off'
}

// ---- 流式 ----
let curPort: any = null
export function abortAiStream() {
  try { curPort?.disconnect() }
  catch { /* ignore */ }
  curPort = null
}

/**
 * 流式补全。每到一个 chunk 调 onChunk(累积全文);resolve 最终全文(空串=没拿到)。
 * 由 monaco inline provider 调用,provider 在 onChunk 里触发 Monaco 重显实现逐字 ghost。
 */
export function streamInlineCompletion(lang: string, prefix: string, suffix: string, onChunk: (acc: string) => void): Promise<string> {
  if (aiGated()) {
    console.warn('[guly-ai] stream gated off', { enabled: state.enabled, intensity: state.intensity, hasBase: !!state.baseURL, hasModel: !!state.model })
    return Promise.resolve('')
  }
  abortAiStream()
  const intensity = state.intensity as Exclude<AiIntensity, 'off'>
  const useFim = aiUseFim()
  const temperature = intensity === 'strong' ? 0.3 : 0.15
  const base = state.baseURL.replace(/\/+$/, '')

  const payload: any = useFim
    ? {
        mode: 'fim',
        baseURL: base,
        apiKey: state.apiKey,
        model: state.model,
        prompt: prefix,
        suffix,
        maxTokens: FIM_CONFIG[intensity as 'light' | 'strong'].maxTokens,
        stop: FIM_CONFIG[intensity as 'light' | 'strong'].stop,
        temperature,
      }
    : {
        mode: 'chat',
        baseURL: base,
        apiKey: state.apiKey,
        model: state.model,
        messages: buildChatMessages(intensity, lang, prefix),
        maxTokens: state.thinking ? CHAT_MAXTOKENS[intensity] * 2 : CHAT_MAXTOKENS[intensity],
        temperature,
      }

  const port = browser.runtime.connect({ name: 'guly-ai-stream' })
  curPort = port
  let acc = ''
  console.warn('[guly-ai] stream start', { mode: payload.mode })
  return new Promise<string>((resolve) => {
    port.onMessage.addListener((m: any) => {
      if (!m)
        return
      if (m.chunk) {
        acc += m.chunk
        onChunk(acc)
      }
      else if (m.done) {
        console.warn('[guly-ai] stream done', JSON.stringify(acc).slice(0, 120))
        cleanup()
        resolve(stripFences(acc))
      }
      else if (m.error) {
        console.warn('[guly-ai] stream error', m.error)
        cleanup()
        resolve('')
      }
    })
    port.onDisconnect.addListener(() => {
      // 中断(新位置主动 abort)→ resolve 当前累积;正常 done 已先 resolve
      if (curPort === port) {
        cleanup()
        resolve(acc)
      }
    })
    port.postMessage(payload)
  })

  function cleanup() {
    try { port.disconnect() }
    catch { /* ignore */ }
    if (curPort === port)
      curPort = null
  }
}
