/**
 * AI inline 补全的强度映射 + 中继调用。
 * 与 Monaco 解耦:由 utils/monaco.ts 的 inline provider 调 requestInlineCompletion,
 * 由编辑器组件(ProblemDetail.vue)经 setAiState 注入当前设置(读 settings.value)。
 * 实际网络请求走 background SW(参见 background/messageListeners/api/ai.ts)绕 CORS。
 */

export type AiIntensity = 'off' | 'light' | 'strong' | 'guide'

interface AiState {
  enabled: boolean
  intensity: AiIntensity
  baseURL: string
  apiKey: string
  model: string
}

let state: AiState = { enabled: false, intensity: 'off', baseURL: '', apiKey: '', model: '' }
export function setAiState(s: Partial<AiState>) {
  state = { ...state, ...s }
}

const INTENSITY_PROMPT: Record<Exclude<AiIntensity, 'off'>, string> = {
  light: 'Complete ONLY the single syntactic construct currently being typed. No new logic, no full algorithms. Example: prefix "for (int i" -> " = 1; i <= n; i++)". Output ONLY the suffix to append, no markdown, no prose, no code fences.',
  strong: 'Based on the preceding comment or context, generate a complete runnable implementation in the same language. Example: prefix "//bfs" -> the full BFS code. Output ONLY code (no markdown fences, no prose).',
  guide: 'Give ONE short Chinese sentence of algorithmic guidance (max ~40 chars), NOT code. Example: "此处应状态转移 dp[i]=min(dp[i-1]+1,…)". Output ONLY that sentence.',
}
const INTENSITY_MAXTOKENS: Record<Exclude<AiIntensity, 'off'>, number> = { light: 64, strong: 600, guide: 80 }

function stripFences(s: string): string {
  // 去掉 ```lang ... ``` 包裹,去掉行首多余缩进的前导空行
  return s.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '').trimEnd()
}

/** 由 monaco inline provider 调用;返回应追加的文本(空串=不补) */
export async function requestInlineCompletion(lang: string, prefix: string): Promise<string> {
  if (!state.enabled || state.intensity === 'off' || !state.baseURL || !state.model)
    return ''
  const intensity = state.intensity as Exclude<AiIntensity, 'off'>
  const messages = [
    { role: 'system', content: `${INTENSITY_PROMPT[intensity]}\nProgramming language: ${lang}.` },
    { role: 'user', content: prefix },
  ]
  try {
    const r: any = await browser.runtime.sendMessage({
      contentScriptQuery: 'AIComplete',
      baseURL: state.baseURL.replace(/\/+$/, ''),
      apiKey: state.apiKey,
      model: state.model,
      messages,
      maxTokens: INTENSITY_MAXTOKENS[intensity],
      temperature: intensity === 'strong' ? 0.3 : 0.15,
    })
    if (!r?.ok)
      return ''
    return stripFences(r.content || '')
  }
  catch {
    return ''
  }
}
