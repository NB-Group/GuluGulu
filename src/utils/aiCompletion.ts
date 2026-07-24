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
const INTENSITY_MAXTOKENS: Record<Exclude<AiIntensity, 'off'>, number> = { light: 64, strong: 600, guide: 80 }

// FIM 模式下的力度档(无 system prompt,FIM 只能靠 max_tokens + stop 控长度):
//  - light:只补当前结构/行 → 少 token + stop 在换行,避免一口气补整段
//  - strong:按注释/上下文补整段 → 放开 token、不限 stop
const FIM_CONFIG: Record<'light' | 'strong', { maxTokens: number, stop: string[] }> = {
  light: { maxTokens: 64, stop: ['\n'] },
  strong: { maxTokens: 512, stop: [] },
}

// 思考模式:对 chat 模式的 strong/guide 注入「先内部推理再输出」指令并放宽 token。
const THINKING_SUFFIX
  = '\n\nTHINKING MODE ON: reason step by step internally about the algorithm and edge cases before producing the final answer. Do NOT output your reasoning, output ONLY the final answer in the format above.'

function stripFences(s: string): string {
  return s.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '').trimEnd()
}

/** 组 chat 模式的 messages。guide(思路指引)时带上题目 markdown,让指引贴合本题。 */
function buildChatMessages(intensity: Exclude<AiIntensity, 'off'>, lang: string, prefix: string) {
  const sys = INTENSITY_PROMPT[intensity] + (state.thinking && intensity !== 'light' ? THINKING_SUFFIX : '') + `\nProgramming language: ${lang}.`
  // guide 模式:把题目描述塞进上下文(裁到 ~2400 字符省 token);其它强度只看代码前缀。
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
          maxTokens: FIM_CONFIG[intensity as 'light' | 'strong'].maxTokens,
          stop: FIM_CONFIG[intensity as 'light' | 'strong'].stop,
          temperature,
        })
      : await browser.runtime.sendMessage({
          contentScriptQuery: 'AIComplete',
          mode: 'chat',
          baseURL: base,
          apiKey: state.apiKey,
          model: state.model,
          messages: buildChatMessages(intensity, lang, prefix),
          maxTokens: state.thinking && intensity !== 'light' ? Math.round(INTENSITY_MAXTOKENS[intensity] * 1.6) : INTENSITY_MAXTOKENS[intensity],
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
