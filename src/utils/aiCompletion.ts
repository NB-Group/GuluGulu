/**
 * AI inline 补全:支持两种模式
 *  - FIM(Fill In the Middle,默认):POST {base}/completions,prompt=光标前 + suffix=光标后,
 *    模型补中间。真正的代码补全(DeepSeek 等)。返回 choices[0].text。
 *  - Chat(仅「思路指引」或关闭 FIM 时):POST {base}/chat/completions,messages,返回 message.content。
 * 与 Monaco 解耦:由 utils/monaco.ts 的 inline provider 调 requestInlineCompletion,
 * 由编辑器组件经 setAiState 注入当前设置。网络请求走 background SW 绕 CORS。
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
}

let state: AiState = { enabled: false, intensity: 'off', baseURL: '', apiKey: '', model: '', thinking: false, fim: true }
export function setAiState(s: Partial<AiState>) {
  state = { ...state, ...s }
}

const INTENSITY_PROMPT: Record<Exclude<AiIntensity, 'off'>, string> = {
  light: 'Complete ONLY the single syntactic construct currently being typed. No new logic, no full algorithms. Example: prefix "for (int i" -> " = 1; i <= n; i++)". Output ONLY the suffix to append, no markdown, no prose, no code fences.',
  strong: 'Based on the preceding comment or context, generate a complete runnable implementation in the same language. Example: prefix "//bfs" -> the full BFS code. Output ONLY code (no markdown fences, no prose).',
  guide: 'Give ONE short Chinese sentence of algorithmic guidance (max ~40 chars), NOT code. Example: "此处应状态转移 dp[i]=min(dp[i-1]+1,…)". Output ONLY that sentence.',
}
const INTENSITY_MAXTOKENS: Record<Exclude<AiIntensity, 'off'>, number> = { light: 64, strong: 600, guide: 80 }

// 思考模式:对 chat 模式的 strong/guide 注入「先内部推理再输出」指令并放宽 token。
const THINKING_SUFFIX
  = '\n\nTHINKING MODE ON: reason step by step internally about the algorithm and edge cases before producing the final answer. Do NOT output your reasoning, output ONLY the final answer in the format above.'

function stripFences(s: string): string {
  return s.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '').trimEnd()
}

/**
 * 由 monaco inline provider 调用。
 * @param lang  monaco 语言 id
 * @param prefix 光标前文本
 * @param suffix 光标后文本(FIM 用)
 * @returns 应在光标处插入的文本(空串=不补)
 */
export async function requestInlineCompletion(lang: string, prefix: string, suffix = ''): Promise<string> {
  if (!state.enabled || state.intensity === 'off' || !state.baseURL || !state.model) {
    console.warn('[guly-ai] gated off', { enabled: state.enabled, intensity: state.intensity, hasBase: !!state.baseURL, hasModel: !!state.model })
    return ''
  }
  const intensity = state.intensity as Exclude<AiIntensity, 'off'>
  // FIM 适用于 light/strong(代码补全);guide 是自然语言,只能走 chat。
  const useFim = state.fim && intensity !== 'guide'
  const maxTokens = intensity === 'light' ? INTENSITY_MAXTOKENS.light : intensity === 'strong' ? INTENSITY_MAXTOKENS.strong : INTENSITY_MAXTOKENS.guide
  const temperature = intensity === 'strong' ? 0.3 : 0.15

  try {
    const base = state.baseURL.replace(/\/+$/, '')
    const r: any = useFim
      ? await browser.runtime.sendMessage({
          contentScriptQuery: 'AIComplete',
          mode: 'fim',
          baseURL: base,
          apiKey: state.apiKey,
          model: state.model,
          prompt: prefix,
          suffix,
          maxTokens,
          temperature,
        })
      : await browser.runtime.sendMessage({
          contentScriptQuery: 'AIComplete',
          mode: 'chat',
          baseURL: base,
          apiKey: state.apiKey,
          model: state.model,
          messages: [
            { role: 'system', content: INTENSITY_PROMPT[intensity] + (state.thinking && intensity !== 'light' ? THINKING_SUFFIX : '') + `\nProgramming language: ${lang}.` },
            { role: 'user', content: prefix },
          ],
          maxTokens: state.thinking && intensity !== 'light' ? Math.round(maxTokens * 1.6) : maxTokens,
          temperature,
        })
    console.warn('[guly-ai] relay ->', { mode: useFim ? 'fim' : 'chat', ok: r?.ok, body: (r?.error || r?.content || '').slice?.(0, 120) })
    if (!r?.ok)
      return ''
    return stripFences(r.content || '')
  }
  catch (e: any) {
    console.warn('[guly-ai] request threw', e?.message)
    return ''
  }
}
