/**
 * AI 守卫(防作弊+教学约束)。所有 AI HTTP 在背景 SW 的入口先过这个纯函数:
 *  - 比赛(isContest)→ 全拒
 *  - FIM:只放 light(单行)和 step(注释驱动,限长);禁 strong(完整代码)
 *  - chat:放 guide/ce(纯文字);禁 strong
 *  - step 必须 trigger='comment'(用户先写注释)
 * 单一 chokepoint,内容脚本绕不过。详见 docs/superpowers/specs/2026-07-28-ai-safeguard-design.md。
 */
export interface AiPolicyInput {
  mode?: string
  intensity?: string
  isContest?: boolean
  trigger?: string
  maxTokens?: number
  stop?: string[]
}

export type AiPolicyReason = 'contest' | 'no-full-code' | 'need-comment' | 'unknown-mode'

export type AiPolicyResult =
  | { allowed: true, mode: string, maxTokens: number, stop: string[] }
  | { allowed: false, reason: AiPolicyReason }

export const AI_POLICY = {
  fimLight: { maxTokens: 64, stop: ['\n'] },
  fimStep: { maxTokens: 160, stop: ['\n\n', '\n//', '\n#'] },
} as const

export function enforceAiPolicy(msg: AiPolicyInput): AiPolicyResult {
  if (msg.isContest)
    return { allowed: false, reason: 'contest' }

  const mode = msg.mode
  const intensity = msg.intensity

  if (mode === 'fim') {
    if (intensity === 'strong')
      return { allowed: false, reason: 'no-full-code' }
    if (intensity === 'step') {
      if (msg.trigger !== 'comment')
        return { allowed: false, reason: 'need-comment' }
      return { allowed: true, mode: 'fim', maxTokens: AI_POLICY.fimStep.maxTokens, stop: [...AI_POLICY.fimStep.stop] }
    }
    if (intensity === 'light' || !intensity)
      return { allowed: true, mode: 'fim', maxTokens: AI_POLICY.fimLight.maxTokens, stop: [...AI_POLICY.fimLight.stop] }
    return { allowed: false, reason: 'unknown-mode' }
  }

  if (mode === 'chat') {
    if (intensity === 'strong')
      return { allowed: false, reason: 'no-full-code' }
    if (intensity === 'guide' || intensity === 'ce')
      return { allowed: true, mode: 'chat', maxTokens: msg.maxTokens ?? 512, stop: msg.stop ?? [] }
    return { allowed: false, reason: 'unknown-mode' }
  }

  return { allowed: false, reason: 'unknown-mode' }
}
