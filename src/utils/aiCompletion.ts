/**
 * AI inline 补全的强度映射 + 中继调用。
 * 与 Monaco 解耦:由 utils/monaco.ts 的 inline provider 调 requestInlineCompletion,
 * 由编辑器组件(ProblemDetail.vue)经 setAiState 注入当前设置(读 settings.value)。
 * 实际网络请求走 background SW(参见 background/messageListeners/api/ai.ts)绕 CORS。
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
}

let state: AiState = { enabled: false, intensity: 'off', baseURL: '', apiKey: '', model: '', thinking: false }
export function setAiState(s: Partial<AiState>) {
  state = { ...state, ...s }
}

const INTENSITY_PROMPT: Record<Exclude<AiIntensity, 'off'>, string> = {
  light: 'Complete ONLY the single syntactic construct currently being typed. No new logic, no full algorithms. Example: prefix "for (int i" -> " = 1; i <= n; i++)". Output ONLY the suffix to append, no markdown, no prose, no code fences.',
  strong: 'Based on the preceding comment or context, generate a complete runnable implementation in the same language. Example: prefix "//bfs" -> the full BFS code. Output ONLY code (no markdown fences, no prose).',
  guide: 'Give ONE short Chinese sentence of algorithmic guidance (max ~40 chars), NOT code. Example: "此处应状态转移 dp[i]=min(dp[i-1]+1,…)". Output ONLY that sentence.',
}
const INTENSITY_MAXTOKENS: Record<Exclude<AiIntensity, 'off'>, number> = { light: 64, strong: 600, guide: 80 }

// 思考模式:对 strong/guide 注入「先内部推理再输出最终结果」指令,并放宽 token 上限。
// (light 只补当前结构,思考无意义,保持原样。)OpenAI 兼容端点无统一 reasoning 开关,
// 故以 system prompt 指令实现 —— 模型若支持思维链效果更好,不支持也只是多花点 token。
const THINKING_SUFFIX
  = '\n\nTHINKING MODE ON: reason step by step internally about the algorithm and edge cases before producing the final answer. Do NOT output your reasoning, output ONLY the final answer in the format above.'

function stripFences(s: string): string {
  // 去掉 ```lang ... ``` 包裹,去掉行首多余缩进的前导空行
  return s.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '').trimEnd()
}

/** 由 monaco inline provider 调用;返回应追加的文本(空串=不补) */
export async function requestInlineCompletion(lang: string, prefix: string): Promise<string> {
  // 关键门控:强度=off 或缺端点 → 不补。enabled 作为设置里的总闸,由编辑器选强度时自动置 true。
  if (!state.enabled || state.intensity === 'off' || !state.baseURL || !state.model) {
    import.meta.env.DEV && console.debug('[guly-ai] gated off', { enabled: state.enabled, intensity: state.intensity, hasBase: !!state.baseURL, hasModel: !!state.model })
    return ''
  }
  const intensity = state.intensity as Exclude<AiIntensity, 'off'>
  const thinking = state.thinking && intensity !== 'light'
  const sys = INTENSITY_PROMPT[intensity] + (thinking ? THINKING_SUFFIX : '')
  const messages = [
    { role: 'system', content: `${sys}\nProgramming language: ${lang}.` },
    { role: 'user', content: prefix },
  ]
  try {
    const r: any = await browser.runtime.sendMessage({
      contentScriptQuery: 'AIComplete',
      baseURL: state.baseURL.replace(/\/+$/, ''),
      apiKey: state.apiKey,
      model: state.model,
      messages,
      maxTokens: thinking ? Math.round(INTENSITY_MAXTOKENS[intensity] * 1.6) : INTENSITY_MAXTOKENS[intensity],
      temperature: intensity === 'strong' ? 0.3 : 0.15,
    })
    import.meta.env.DEV && console.debug('[guly-ai] relay ->', r?.ok, (r?.error || r?.content || '').slice?.(0, 120))
    if (!r?.ok)
      return ''
    return stripFences(r.content || '')
  }
  catch {
    return ''
  }
}
