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

/** 密集调试日志(毫秒时间戳 + 步骤号)。排查「点了没反应」:页面控制台看 [guly-tutor] 停在哪一步。 */
let __seq = 0
export function tlog(...args: any[]) {
  console.log(`[guly-tutor +${Date.now() % 1000000} #${++__seq}]`, ...args)
}

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

function buildPayload(model: AiModel, messages: any[], maxTokens: number, temperature: number, thinking: boolean) {
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
    // 思考开关(2026-08-27 恢复):早前「GLM 经中转思考 >420s 零输出」实为 SSE 行循环
    // stale-nl 死循环吞流所致,已修,思考无罪。备课永远 true(深想验证),授课跟设置开关。
    // SW 把 disableThinking 译成 anthropic body.thinking={type:'disabled'} / openai enable_thinking=false。
    disableThinking: !thinking,
    messages,
    maxTokens,
    temperature,
  }
}

/** streamChat 的结果:text=累积正文;error 非空=失败原因;truncated 非空=流被掐断(max_tokens/连接硬剪),可续写。 */
export interface StreamResult { text: string, error?: string, truncated?: string }

/**
 * 发送一轮 chat(流式)。onChunk 收累积全文,onReasoning 收思考片段(思考模型)。
 * 错误不再静默:HTTP 错误/连接中断/超时都会带 error 返回,调用方原样上屏。
 * 超时看门狗:首个响应 90s 内不到、或总时长 240s,按超时收场(推理模型备课很慢,给足)。
 */
function streamChat(payload: any, onChunk: (acc: string) => void, onReasoning?: (acc: string) => void, onKa?: () => void, _attempt = 0): Promise<StreamResult> {
  tlog(`S2 port connect 'guly-ai-stream' (attempt ${_attempt + 1}) →`, (payload.baseURL || '').replace(/\/\/.*@/, '//***@'), payload.model, `fmt=${payload.apiFormat} msgs=${payload.messages?.length} maxTok=${payload.maxTokens} disableThinking=${payload.disableThinking}`)
  const port = browser.runtime.connect({ name: 'guly-ai-stream' })
  tutorPort = port
  // ★ SW→页面的 port 投递在 MV3 下不可靠(实测:SW 已 ack/推 chunk,页面 port.onMessage 3s 零到达)。
  // 双通道:payload 带 tutorId,新 SW 走 tabs.sendMessage 定向回传(本监听器收);
  // 旧 SW(未重载)仍走 port.onMessage —— 两条不会同时来,无重复。
  const tutorId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  let viaTabs = 0
  let viaPort = 0
  let detachTabs: () => void = () => {}
  tlog('S3 port 已建立,postMessage 发送中, payloadBytes≈', JSON.stringify(payload).length)
  let acc = ''
  let reasoningAcc = ''
  let firstSeen = false
  let truncatedReason = ''
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
    const bump = () => {
      clearTimeout(gotDataTimer)
      gotDataTimer = setTimeout(() => finish(acc
        ? { text: acc, truncated: 'mid-silence-90s' } // 有部分输出:按掐断处理,上层自动续写
        : { text: '', error: '流中途静默超时(90s)' }), 90_000)
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
      console.warn('[guly-tutor] no ack in 3s — pinging SW, keep waiting')
      try { port.postMessage({ ping: 1, tutorId }) }
      catch { /* port 已死则等 onDisconnect */ }
    }, 3000)

    const onAlive = (v: any) => {
      clearTimeout(ackTimer)
      firstSeen = true
      if (typeof v === 'number' && v < AI_PROTO_VERSION)
        finish({ text: '', error: `后台是旧版(协议 v${v} < v${AI_PROTO_VERSION})——请到 chrome://extensions 点「刷新」重载扩展,然后 F5 刷新本页` })
    }

    const handleMsg = (m: any, ch: 'tabs' | 'port') => {
      tlog(`S4 ← SW msg(${ch}):`, m && (m.ack ? `ack v${m.v}` : m.pong ? `pong v${m.v}` : m.ka ? 'ka' : m.chunk ? `chunk +${m.chunk.length} (acc=${acc.length + m.chunk.length})` : m.reasoning ? `reasoning +${m.reasoning.length}` : m.done ? 'DONE' : m.blocked ? `blocked:${m.reason}` : m.error ? `error:${String(m.error).slice(0, 120)}` : JSON.stringify(m).slice(0, 120)))
      if (!m)
        return
      if (m.ack || m.pong) {
        onAlive(m.v)
        return
      }
      if (m.ka) {
        // 流层保活(message_start/ping/keepalive):进入「已启动」相,中途静默计时重置;
        // 首 token 前不再受 90s 判死(深思考模型思考期上游零输出是常态)
        firstSeen = true
        clearTimeout(gotDataTimer) // 阶段B:等首 token,只受硬上限管
        onKa?.()
        return
      }
      firstSeen = true
      bump()
      if (m.chunk) {
        acc += m.chunk
        onChunk(acc)
      }
      else if (m.truncated) {
        // 中转/上游掐断标记(max_tokens / 连接硬剪):不是终点,标记后续写
        tlog('S4 掐断标记:', m.truncated)
        truncatedReason = String(m.truncated)
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
        finish({ text: final, error: final ? undefined : (reasoningAcc ? '模型只输出了思考、没有正文(尝试调大 maxTokens 或换模型)' : undefined), truncated: truncatedReason || undefined })
      }
      else if (m.error) {
        console.warn('[guly-tutor] stream error', m.error)
        finish({ text: acc, error: String(m.error).slice(0, 200) })
      }
    }

    // 通道1:tabs.sendMessage 定向回传(新 SW 主通道)
    const onTabsMsg = (msg: any) => {
      if (msg && msg.tutorStream === tutorId && msg.m) {
        viaTabs++
        handleMsg(msg.m, 'tabs')
      }
    }
    browser.runtime.onMessage.addListener(onTabsMsg)
    detachTabs = () => browser.runtime.onMessage.removeListener(onTabsMsg)
    // 通道2:port 回传(旧 SW 兼容)
    port.onMessage.addListener((m: any) => {
      viaPort++
      handleMsg(m, 'port')
    })
    port.onDisconnect.addListener(() => {
      // 中断(新请求主动 abort / SW 被杀 / 上下文失效)→ 读断开原因原样带回,不再猜。
      // tabs 通道不依赖 port,port 断了但已收到过 tabs 数据 → 正常等 done,不当失败。
      tlog('S5 port onDisconnect · firstSeen=', firstSeen, 'viaTabs=', viaTabs, 'viaPort=', viaPort, 'accLen=', acc.length, 'err=', (port as any).error?.message || '(无)')
      if (tutorPort === port && !settled && !firstSeen) {
        const why: string = (port as any).error?.message
          || (browser.runtime as any).lastError?.message
          || ''
        finish({
          text: acc,
          error: `SW 未发任何消息即断开${why ? `:${why}` : '(若刚重载过扩展,请刷新洛谷页面;否则看 SW 控制台)'}`,
        })
      }
    })
    port.postMessage({ ...payload, tutorId })
  })

  function cleanup() {
    detachTabs()
    // 先请 SW 取消在途 fetch(释放中转并发,别让放弃的请求继续占着模型),再断 port
    try { port.postMessage({ abort: 1, tutorId }) }
    catch { /* ignore */ }
    try { port.disconnect() }
    catch { /* ignore */ }
    if (tutorPort === port)
      tutorPort = null
  }
}

/**
 * 带自动续写的流:流被掐断(truncated)时,把已写内容作为 assistant 上下文发回去接着写,
 * 最多续 maxRounds 轮,把中转/上游硬剪的响应缝合成完整全文(onChunk 收缝合后的全文)。
 */
async function streamChatAuto(payload: any, hooks: { onChunk?: (acc: string) => void, onReasoning?: (acc: string) => void, onKa?: () => void } = {}, maxRounds = 3): Promise<StreamResult> {
  const messages: any[] = [...payload.messages]
  let r = await streamChat({ ...payload, messages }, acc => hooks.onChunk?.(acc), hooks.onReasoning, hooks.onKa)
  let text = r.text
  let round = 0
  while (r.truncated && text.trim() && round < maxRounds) {
    round++
    tlog(`流被掐断(${r.truncated}),自动续写第 ${round}/${maxRounds} 轮,已写 ${text.length} 字`)
    messages.push({ role: 'assistant', content: text })
    messages.push({ role: 'user', content: '继续。从你刚才停下的地方接着写,不要重复已写内容,直接续上。' })
    r = await streamChat({ ...payload, messages }, acc => hooks.onChunk?.(text + acc), hooks.onReasoning, hooks.onKa)
    text += r.text
  }
  return { text, error: r.error, truncated: r.truncated }
}

// ============================================================
// 题解抓取(ground truth)
// ============================================================
const solutionCache = new Map<string, string[]>()

/**
 * 取题解正文(前 limit 篇,官方/高赞优先),各截 maxLen 字符。
 * 未登录(401)/无题解/出错/**挂起 15s** → 空数组(备课回退模型自解)。
 * ⚠️ 必须带超时:fetchLentilleContext 是裸 fetch,题解页被 WAF/网络挂起时
 * 若无超时会永远卡在连模型之前 —— 表现为「点了导师,SW 一个请求都没有」。
 */
export async function fetchSolutionTexts(pid: string, limit = 3, maxLen = 4000): Promise<string[]> {
  if (solutionCache.has(pid))
    return solutionCache.get(pid)!
  let texts: string[] = []
  try {
    tlog('S1 抓题解 start', pid)
    const ctx = await Promise.race([
      fetchLentilleContext(`${location.origin}/problem/solution/${pid}`),
      new Promise<null>(resolve => setTimeout(() => { tlog('S1 抓题解 15s 超时,放弃题解回退自解'); resolve(null) }, 15_000)),
    ])
    tlog('S1 抓题解 done, ctx=', ctx ? (ctx.__needLogin ? 'needLogin' : 'ok') : 'null/timeout')
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
    tlog('S1 题解解析:', items.length, '篇含正文, 取', texts.length)
  }
  catch (e: any) { tlog('S1 抓题解异常(回退自解):', e?.message || e) /* 401 / 网络错误等 → 空数组 */ }
  solutionCache.set(pid, texts)
  return texts
}

// ============================================================
// 备课
// ============================================================
// ⚠️ 不再让模型「先内部完整推导再输出」:GLM 经中转思考时上游长时间(>420s)零输出,
// 题解在手也没必要重新推理。直出、不思考。

/** 备课结果:成功返回 TutorPlan,失败返回 {error}。onPhase 报告当前阶段(solutions=抓题解 / model=问模型)。 */
export async function runTutorPrep(
  pid: string,
  problemMarkdown: string,
  hooks: { onChunk?: (acc: string) => void, onReasoning?: (acc: string) => void, onKa?: () => void, onPhase?: (p: 'solutions' | 'model') => void } = {},
): Promise<TutorPlan | { error: string }> {
  tlog('P0 prep start, pid=', pid, 'markdownLen=', problemMarkdown.length)
  const model = resolveAiModel(settings.value.aiTutor.modelId)
  tlog('P1 模型解析:', model ? `${model.name} · ${model.modelName} · ${(model.baseUrl || '').replace(/\/\/.*@/, '//***@')} · fmt=${model.apiFormat ?? 'openai'}` : 'null')
  if (!model || !model.modelName || !model.baseUrl)
    return { error: '请先在 设置 → AI → 思路导师模块 选择模型' }

  hooks.onPhase?.('solutions')
  const solutions = await fetchSolutionTexts(pid)
  hooks.onPhase?.('model')
  tlog('P2 题解就绪:', solutions.length, '篇')
  const sysBase = solutions.length
    ? [
        '你是一名算法竞赛教练,正在为一道真题「备课」。题解原文已提供(社区/官方,视为 ground truth)。',
        '请先在内部消化题目与题解(核对复杂度与数据范围、用样例验证题解说法),再输出教学地图:',
        '1. 提炼题目本质与正解路线,核对复杂度与数据范围。',
        '2. 从题解中梳理「做法阶梯」:暴力 → 各优化阶段 → 正解,每档写清做法+复杂度。分数/子任务分布仅在题面明确给出时引用,禁止编造分数。',
        '3. 列出学生常见误区(想当然的地方)。',
        '4. 为每个阶段准备 1-2 条「指方向」级别提示语(不给答案的问句/方向)。',
        '输出结构化 markdown 备课稿。内部推导不要输出,只输出备课稿。',
      ].join('\n')
    : [
        '你是一名算法竞赛教练,正在为一道真题「备课」。没有题解可参考,请先独立解出此题:',
        '1. 认真推导:给出你认为的正解与复杂度,对照数据范围判断是否可行,用样例手算验证。',
        '2. 梳理「做法阶梯」:暴力 → 各优化阶段 → 正解,每档写清做法+复杂度。分数/子任务分布仅在题面明确给出时引用,禁止编造分数。',
        '3. 列出学生常见误区(想当然的地方)。',
        '4. 为每个阶段准备 1-2 条「指方向」级别提示语(不给答案的问句/方向)。',
        '推不出满足数据范围的解法时,如实写出你认为的最优解与复杂度,禁止编造。内部推导不要输出,只输出备课稿。',
        '输出结构化 markdown 备课稿,开头标注「⚠️ 未参考题解,思路未经社区验证」。',
      ].join('\n')

  const user = [
    `【题目】\n${problemMarkdown}`,
    solutions.length ? `\n【题解】\n${solutions.join('\n\n')}` : '',
    '\n请输出备课稿。',
  ].filter(Boolean).join('\n')

  // 备课永远深想(核对题解/自解验证),不受用户思考开关影响
  const r = await streamChatAuto(
    { ...buildPayload(model, [{ role: 'system', content: sysBase }, { role: 'user', content: user }], 8192, 0.3, true) },
    { onChunk: hooks.onChunk, onReasoning: hooks.onReasoning, onKa: hooks.onKa },
  )
  if (!r.text.trim())
    return { error: `备课失败:${r.error || '模型无返回(检查 BaseURL / Key / 模型名,或看 SW 控制台)'}` }

  const plan: TutorPlan = {
    // 仍被掐断(续写 3 轮也没缝完):保留但显式标注,不假装完整
    plan: (r.truncated ? `> ⚠️ 备课稿在 ${r.text.length} 字处被掐断(${r.truncated}),自动续写后仍不完整\n\n` : '') + r.text.trim(),
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

  const r = await streamChatAuto(
    // 授课思考跟用户开关:思考开时预算放宽(推理模型把 token 花在 reasoning)
    { ...buildPayload(model, messages, settings.value.aiTutor.thinking ? 3000 : 800, 0.5, settings.value.aiTutor.thinking) },
    { onChunk: hooks.onChunk, onReasoning: hooks.onReasoning, onKa: hooks.onKa },
    2,
  )
  if (r.text.trim()) {
    saveTutorChat(pid, [...chat, { role: 'assistant', content: r.text.trim() + (r.truncated ? '\n\n*(此条被掐断,可能不完整)*' : ''), ts: Date.now() }])
    return r.text
  }
  // 失败:把真实原因作为本轮回复显示(不持久化错误,重试不残留)
  return `⚠️ ${r.error || '模型无返回,重试一下?'}`
}
