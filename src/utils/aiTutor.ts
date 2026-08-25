/**
 * 思路导师引擎:先备课、再授课(苏格拉底阶梯)。
 *
 * - 备课(runTutorPrep):ground truth 优先取社区/官方题解(复用 /problem/solution/{pid}
 *   的 lentille),模型只负责消化成「教学地图」;无题解(未登录/竞赛中/无题解)才回退
 *   模型自解,并在备课稿标注「未经社区验证」。备课永远强制深度思考。
 * - 授课(tutorRespond):system = 导师人格 + 备课稿 + 教学协议;user 轮注入当前代码快照。
 *   只准基于备课稿引导,备课稿之外的思路要诚实评估。
 *
 * 流式走 background SW 的 'guly-ai-stream' port(与补全共用协议 {chunk}/{reasoning}/
 * {done}/{error}),但**独立 port 生命周期**——补全的 abortAiStream 不会杀掉导师回合,反之亦然。
 *
 * 持久化(localStorage,与 gulu:code:{pid} 并排):
 *   gulu:tutor-plan:{pid}  备课稿
 *   gulu:tutor-chat:{pid}  对话历史
 *   gulu:tutor-ac:{pid}    AC 待庆祝标记(useProblemSubmit 落,TutorPanel 消费)
 */
import browser from 'webextension-polyfill'
import { resolveAiModel, settings } from '~/logic'
import type { AiModel } from '~/logic'
import { fetchLentilleContext } from './luogu-api'

/** port 协议版本(与 background/messageListeners/api/ai.ts 的 AI_PROTO_VERSION 同步,改协议时两边 +1)。 */
const AI_PROTO_VERSION = 2

// ============================================================
// 持久化
// ============================================================
export interface TutorMsg { role: 'user' | 'assistant', content: string, ts: number }
export interface TutorPlan { plan: string, source: 'solutions' | 'self', ts: number, modelKey: string }

const planKey = (pid: string) => `gulu:tutor-plan:${pid}`
const chatKey = (pid: string) => `gulu:tutor-chat:${pid}`
const acKey = (pid: string) => `gulu:tutor-ac:${pid}`

export function loadTutorPlan(pid: string): TutorPlan | null {
  try {
    const v = JSON.parse(localStorage.getItem(planKey(pid)) || 'null')
    return v && typeof v.plan === 'string' ? v : null
  }
  catch { return null }
}
export function saveTutorPlan(pid: string, plan: TutorPlan) {
  try { localStorage.setItem(planKey(pid), JSON.stringify(plan)) }
  catch { /* ignore */ }
}
export function loadTutorChat(pid: string): TutorMsg[] {
  try {
    const v = JSON.parse(localStorage.getItem(chatKey(pid)) || 'null')
    return Array.isArray(v?.messages) ? v.messages : []
  }
  catch { return [] }
}
export function saveTutorChat(pid: string, msgs: TutorMsg[]) {
  try { localStorage.setItem(chatKey(pid), JSON.stringify({ messages: msgs.slice(-80) })) } catch { /* ignore */ }
}
export function clearTutorChat(pid: string) {
  try { localStorage.removeItem(chatKey(pid)) } catch { /* ignore */ }
}
export function markTutorAc(pid: string) {
  try { localStorage.setItem(acKey(pid), '1') } catch { /* ignore */ }
}
export function consumeTutorAc(pid: string): boolean {
  try {
    if (localStorage.getItem(acKey(pid)) === '1') {
      localStorage.removeItem(acKey(pid))
      return true
    }
  }
  catch { /* ignore */ }
  return false
}

// ============================================================
// 流式 transport(独立 port)
// ============================================================
let tutorPort: any = null
export function abortTutorStream() {
  try { tutorPort?.disconnect() }
  catch { /* ignore */ }
  tutorPort = null
}

function buildPayload(model: AiModel, messages: any[], maxTokens: number, temperature: number) {
  return {
    mode: 'chat',
    // SW 的 enforceAiPolicy 守卫字段:导师属「纯文字引导」(guide 类,苏格拉底不代写整段代码);
    // 比赛模式(?contestId=)策略全禁,导师同样遵守。
    intensity: 'guide',
    isContest: /[?&]contestId=/.test(location.href),
    baseURL: (model.baseUrl || '').replace(/\/+$/, ''),
    apiKey: model.apiKey,
    model: model.modelName,
    apiFormat: model.apiFormat ?? 'openai',
    messages,
    maxTokens,
    temperature,
  }
}

/** streamChat 的结果:text=累积正文;error 非空=失败原因(拿不到正文时据此报错,不再吞)。 */
export interface StreamResult { text: string, error?: string }

/**
 * 发送一轮 chat(流式)。onChunk 收累积全文,onReasoning 收思考片段(思考模型)。
 * 错误不再静默:HTTP 错误/连接中断/超时都会带 error 返回,调用方原样上屏。
 * 超时看门狗:首个响应 90s 内不到、或总时长 240s,按超时收场(推理模型备课很慢,给足)。
 */
function streamChat(payload: any, onChunk: (acc: string) => void, onReasoning?: (acc: string) => void, onKa?: () => void, _attempt = 0): Promise<StreamResult> {
  const port = browser.runtime.connect({ name: 'guly-ai-stream' })
  tutorPort = port
  let acc = ''
  let reasoningAcc = ''
  let firstSeen = false
  return new Promise<StreamResult>((resolve) => {
    let settled = false
    const finish = (r: StreamResult) => {
      if (settled)
        return
      settled = true
      clearTimeout(gotDataTimer)
      clearTimeout(hardTimer)
      clearTimeout(ackTimer)
      cleanup()
      resolve(r)
    }
    // 看门狗分相(实测教训:glm 等深思考模型思考期上游零输出,连 keepalive 都只在开头发一次):
    //  A. 流从未启动(连 message_start/ka 都没收到)→ 90s 判隧道挂,重试一次;
    //  B. 流已启动但首 token 未到(模型思考)→ 不中断,只受 420s 硬上限保护;
    //  C. 正在输出中途 90s 静默 → 连接断,带已有部分收场。
    let streamStarted = false // 收到过任何流层信号(ka/chunk/reasoning)
    const bump = () => {
      clearTimeout(gotDataTimer)
      gotDataTimer = setTimeout(() => finish({ text: acc, error: `流中途静默超时(90s)${acc ? '(已有部分输出)' : ''}` }), 90_000)
    }
    let gotDataTimer = setTimeout(() => {
      // 阶段A:完全没启动 → 隧道挂,重试一次
      clearTimeout(hardTimer)
      clearTimeout(ackTimer)
      cleanup()
      if (_attempt === 0) {
        console.warn('[guly-tutor] stream never started in 90s — retrying once (tunnel hang?)')
        streamChat(payload, onChunk, onReasoning, onKa, _attempt + 1).then(r => !settled && (settled = true, resolve(r)))
        return
      }
      settled = true
      resolve({ text: '', error: '流从未启动(两轮 90s 连 message_start 都没到)——SW 控制台看该请求是 fetching 后无 HTTP、还是 HTTP 后无字节;本机直测端点若通即隧道/代理问题' })
    }, 90_000)
    const hardTimer = setTimeout(() => finish({ text: acc, error: `总时长超时(420s,模型思考太久或中转排队)${acc ? '(已有部分输出)' : ''}` }), 420_000)
    // ack 仅作体检,不作判死依据(MV3 port 唤醒竞态会偶发丢 ack,实测时有时无)。
    // 3s 没 ack → 发 ping 探活,继续等;真正的生死判据 = port 断开 / 90s 零数据 / done、error。
    const ackTimer = setTimeout(() => {
      if (firstSeen)
        return
      console.warn('[guly-tutor] no ack in 3s (MV3 port race?) — pinging SW, keep waiting')
      try { port.postMessage({ ping: 1 }) }
      catch { /* port 已死则等 onDisconnect */ }
    }, 3000)

    const onAlive = (v: any) => {
      clearTimeout(ackTimer)
      firstSeen = true
      if (typeof v === 'number' && v < AI_PROTO_VERSION)
        finish({ text: '', error: `后台是旧版(协议 v${v} < v${AI_PROTO_VERSION})——请到 chrome://extensions 点「刷新」重载扩展,然后 F5 刷新本页` })
    }

    port.onMessage.addListener((m: any) => {
      if (!m)
        return
      if (m.ack || m.pong) {
        console.log(`[guly-tutor] SW ${m.pong ? 'pong' : 'ack'} · proto v`, m.v)
        onAlive(m.v)
        return
      }
      if (m.ka) {
        // 流层保活(message_start/ping/keepalive):进入「已启动」相,中途静默计时重置;
        // 首 token 前不再受 90s 判死(深思考模型思考期上游零输出是常态)
        firstSeen = true
        streamStarted = true
        clearTimeout(gotDataTimer) // 阶段B:等首 token,只受硬上限管
        onKa?.()
        return
      }
      firstSeen = true
      streamStarted = true
      bump()
      if (m.chunk) {
        acc += m.chunk
        onChunk(acc)
      }
      else if (m.reasoning) {
        reasoningAcc += m.reasoning
        onReasoning?.(reasoningAcc)
      }
      else if (m.blocked) {
        // SW 的 enforceAiPolicy 拦截(比赛模式全禁等)。注意须在 done 之前判:
        // SW 的 blocked 消息同时带 done:true。
        finish({ text: m.reason === 'contest' ? '比赛模式下导师休息 🛡️(防作弊守卫,赛后再来)' : `被 AI 守卫拦截(${m.reason})` })
      }
      else if (m.done) {
        // 推理模型 content 可能为空:取 reasoning 末尾兜底
        const final = acc || reasoningAcc.trim().split('\n').filter(Boolean).slice(-3).join('\n')
        finish({ text: final, error: final ? undefined : (reasoningAcc ? '模型只输出了思考、没有正文(尝试调大 maxTokens 或换模型)' : undefined) })
      }
      else if (m.error) {
        console.warn('[guly-tutor] stream error', m.error)
        finish({ text: acc, error: String(m.error).slice(0, 200) })
      }
    })
    port.onDisconnect.addListener(() => {
      // 中断(新请求主动 abort / SW 被杀 / 上下文失效)→ 读断开原因原样带回,不再猜
      if (tutorPort === port) {
        const why: string = (port as any).error?.message
          || (browser.runtime as any).lastError?.message
          || ''
        finish({
          text: acc,
          error: acc
            ? undefined
            : (firstSeen
                ? `连接中断${why ? `:${why}` : ''}`
                : `SW 未发任何消息即断开${why ? `:${why}` : '(若刚重载过扩展,请刷新洛谷页面;否则看 SW 控制台)'}`),
        })
      }
    })
    port.postMessage(payload)
  })

  function cleanup() {
    // 先请 SW 取消在途 fetch(释放中转并发,别让放弃的请求继续占着模型),再断 port
    try { port.postMessage({ abort: 1 }) }
    catch { /* ignore */ }
    try { port.disconnect() }
    catch { /* ignore */ }
    if (tutorPort === port)
      tutorPort = null
  }
}

// ============================================================
// 题解抓取(ground truth)
// ============================================================
const solutionCache = new Map<string, string[]>()

/**
 * 取题解正文(前 limit 篇,官方/高赞优先),各截 maxLen 字符。
 * 未登录(401)/无题解/出错 → 空数组(备课回退模型自解)。
 */
export async function fetchSolutionTexts(pid: string, limit = 3, maxLen = 4000): Promise<string[]> {
  if (solutionCache.has(pid))
    return solutionCache.get(pid)!
  let texts: string[] = []
  try {
    const ctx = await fetchLentilleContext(`${location.origin}/problem/solution/${pid}`)
    const cd: any = (ctx as any)?.data || (ctx as any)?.currentData || {}
    const raw = cd.solutions?.result || cd.solutions || []
    const items = (Array.isArray(raw) ? raw : [])
      .map((s: any) => ({ content: String(s.content || ''), upvote: s.upvote || 0, verified: s.status === 2 || s.promoteStatus === 2 }))
      .filter(s => s.content.trim())
      .sort((a, b) => (Number(b.verified) - Number(a.verified)) || (b.upvote - a.upvote))
    texts = items.slice(0, limit).map((s, i) => {
      const body = s.content.length > maxLen ? `${s.content.slice(0, maxLen)}…` : s.content
      return `【题解 ${i + 1}${s.verified ? ' · 官方/审核通过' : ''}】\n${body}`
    })
  }
  catch { /* 401 / 网络错误等 → 空数组 */ }
  solutionCache.set(pid, texts)
  return texts
}

// ============================================================
// 备课
// ============================================================
const PREP_THINKING
  = '\n\n开课备课:请先在内部完整推导、用样例手算验证、核对复杂度与数据范围,再输出备课稿。不要输出推导过程。'

/** 备课结果:成功返回 TutorPlan,失败返回 {error}。 */
export async function runTutorPrep(
  pid: string,
  problemMarkdown: string,
  hooks: { onChunk?: (acc: string) => void, onReasoning?: (acc: string) => void, onKa?: () => void } = {},
): Promise<TutorPlan | { error: string }> {
  const model = resolveAiModel(settings.value.aiTutor.modelId)
  if (!model || !model.modelName || !model.baseUrl)
    return { error: '请先在 设置 → AI → 思路导师模块 选择模型' }

  const solutions = await fetchSolutionTexts(pid)
  const sysBase = solutions.length
    ? [
        '你是一名算法竞赛教练,正在为一道真题「备课」。题解原文已提供(社区/官方,视为 ground truth)。',
        '请通读题目与题解,消化成教学地图:',
        '1. 提炼题目本质与正解路线,核对复杂度与数据范围。',
        '2. 从题解中梳理「做法阶梯」:暴力 → 各优化阶段 → 正解,每档写清做法+复杂度。分数/子任务分布仅在题面明确给出时引用,禁止编造分数。',
        '3. 列出学生常见误区(想当然的地方)。',
        '4. 为每个阶段准备 1-2 条「指方向」级别提示语(不给答案的问句/方向)。',
        '输出结构化 markdown 备课稿。',
      ].join('\n')
    : [
        '你是一名算法竞赛教练,正在为一道真题「备课」。没有题解可参考,请先独立完整解出此题:',
        '1. 认真解题:推导正解,验证复杂度是否满足数据范围,用样例手算验证。',
        '2. 梳理「做法阶梯」:暴力 → 各优化阶段 → 正解,每档写清做法+复杂度。分数/子任务分布仅在题面明确给出时引用,禁止编造分数。',
        '3. 列出学生常见误区(想当然的地方)。',
        '4. 为每个阶段准备 1-2 条「指方向」级别提示语(不给答案的问句/方向)。',
        '推不出满足数据范围的解法时,如实写出你认为的最优解与复杂度,禁止编造。',
        '输出结构化 markdown 备课稿,开头标注「⚠️ 未参考题解,思路未经社区验证」。',
      ].join('\n')

  const user = [
    `【题目】\n${problemMarkdown}`,
    solutions.length ? `\n【题解】\n${solutions.join('\n\n')}` : '',
    '\n请输出备课稿。',
  ].filter(Boolean).join('\n')

  const r = await streamChat(
    buildPayload(model, [{ role: 'system', content: sysBase + PREP_THINKING }, { role: 'user', content: user }], 4096, 0.3),
    acc => hooks.onChunk?.(acc),
    acc => hooks.onReasoning?.(acc),
    () => hooks.onKa?.(),
  )
  if (!r.text.trim())
    return { error: `备课失败:${r.error || '模型无返回(检查 BaseURL / Key / 模型名,或看 SW 控制台)'}` }

  const plan: TutorPlan = {
    plan: r.text.trim(),
    source: solutions.length ? 'solutions' : 'self',
    ts: Date.now(),
    modelKey: `${model.baseUrl}|${model.modelName}`,
  }
  saveTutorPlan(pid, plan)
  return plan
}

// ============================================================
// 授课
// ============================================================
const TUTOR_PERSONA = (plan: string) => [
  '你是一道算法题的「思路导师」,苏格拉底式渐进引导,绝不直接给完整解法。像同学一样自然讨论。',
  '',
  '【备课稿】(你已备好课,以下是你的教学地图,必须以此为准,不得编造)',
  plan,
  '',
  '【教学协议】',
  '1. 阶梯递进:暴力→部分分→正解。每轮只给「指方向」级提示(如「考虑X的深层含义」「此时Y还适用吗」),不给答案。',
  '2. 学生连续2轮卡住或明确说「下一层/再多点」才升一级。',
  '3. 以问题回应问题,逼学生自己完成关键突破;学生说出好想法立即肯定。',
  '4. 学生思路超出备课稿时诚实评估,不确定就说「这超出我的备课范围」,不懂装懂。',
  '5. 可以认错:「你说得对,我之前那个说法有问题」。',
  '6. 中文,简洁(一般≤120字/轮),可用 666/妙 等自然反应。',
  '7. 学生报喜 AC 时真诚庆祝。',
  '8. 学生坚持要看正解:先确认,给后要求他复述关键一步。',
].join('\n')

const TURN_THINKING
  = '\n\nTHINKING MODE ON: 回应前先在内部对照备课稿核对事实(复杂度/做法是否记错),再输出简短回应。不要输出推理过程。'

/** 学生代码快照:太长只留尾部(写到哪里比从哪开始重要)。 */
function codeSnapshot(code: string, maxLen = 3000): string {
  const c = code.trim()
  if (!c)
    return ''
  return c.length > maxLen ? `…(前面省略)\n${c.slice(-maxLen)}` : c
}

/**
 * 导师回应一轮。chat 为**含刚发出的 user 消息**的完整历史(调用方负责持久化 user 条目;
 * assistant 回复由本函数持久化并返回)。
 * 流式回调同备课。resolve 最终回复全文(空串=失败)。
 */
export async function tutorRespond(
  pid: string,
  problemMarkdown: string,
  code: string,
  chat: TutorMsg[],
  hooks: { onChunk?: (acc: string) => void, onReasoning?: (acc: string) => void, onKa?: () => void } = {},
): Promise<string> {
  const plan = loadTutorPlan(pid)
  const model = resolveAiModel(settings.value.aiTutor.modelId)
  if (!model || !model.modelName || !model.baseUrl)
    return '我还没就位——请先在 设置 → AI → 思路导师模块 选一个模型 🙏'
  if (!plan)
    return '备课稿还没好,稍等我一下(或点「重新备课」)。'

  const sys = TUTOR_PERSONA(plan.plan) + (settings.value.aiTutor.thinking ? TURN_THINKING : '')
  // 请求侧消息:历史照传;最后一条 user 附当前代码快照(不落盘,免得聊天记录膨胀)
  const messages: any[] = [{ role: 'system', content: sys }]
  chat.forEach((m, i) => {
    const isLastUser = m.role === 'user' && i === chat.length - 1
    const snap = isLastUser ? codeSnapshot(code) : ''
    messages.push({ role: m.role, content: snap ? `${m.content}\n\n【我的当前代码】\n\`\`\`\n${snap}\n\`\`\`` : m.content })
  })

  const r = await streamChat(
    buildPayload(model, messages, settings.value.aiTutor.thinking ? 1600 : 800, 0.5),
    acc => hooks.onChunk?.(acc),
    acc => hooks.onReasoning?.(acc),
    () => hooks.onKa?.(),
  )
  if (r.text.trim()) {
    saveTutorChat(pid, [...chat, { role: 'assistant', content: r.text.trim(), ts: Date.now() }])
    return r.text
  }
  // 失败:把真实原因作为本轮回复显示(不持久化错误,重试不残留)
  return `⚠️ ${r.error || '模型无返回,重试一下?'}`
}
