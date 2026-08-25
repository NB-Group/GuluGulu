<script setup lang="ts">
/**
 * 思路导师面板:右侧固定抽屉,苏格拉底式对话引导。
 * 打开时自动「备课」(题解优先消化成教学地图,流式状态可见),之后基于备课稿授课
 * (协议见 utils/aiTutor.ts)。对话/备课稿按 pid 持久化,AC 后回来会自动庆祝。
 * UI 气泡模式抄 Messages.vue;Teleport 到 app 根避开页内 transform 祖先(同 Dialog/Select)。
 */
import { onKeyStroke } from '@vueuse/core'
import { useGuluApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { parseMarkdownContent } from '~/utils/markdown'
import { renderIcon } from '~/utils/icons'
import {
  clearTutorChat, consumeTutorAc, loadTutorChat, loadTutorPlan, runTutorPrep,
  saveTutorChat, tutorRespond, abortTutorStream,
} from '~/utils/aiTutor'
import type { TutorMsg, TutorPlan } from '~/utils/aiTutor'

const props = defineProps<{
  problemId: string
  problemMarkdown: string
  code: string
}>()
const emit = defineEmits<{ close: [] }>()

const { mainAppRef } = useGuluApp()

const msgs = ref<TutorMsg[]>([])
const plan = ref<TutorPlan | null>(null)
const prepping = ref(false)
const prepThinking = ref('') // 备课思考片段长度指示
const prepError = ref('')
const sending = ref(false)
const streamAcc = ref('') // 服务器累积全文(流式)
const streamShown = ref('') // 打字机逐字揭示的可见文本(声明须在上方 watch 之前 —— TDZ)
const streamThinking = ref(false)
const input = ref('')
const showPlan = ref(false)
const listRef = ref<HTMLElement>()
const endRef = ref<HTMLElement>()

// 备课/授课进度指示:耗时(s)+ 思考字数 + 已输出字数(推理模型可能闷头想很久,没反馈像死机)
const prepElapsed = ref(0)
const prepThinkChars = ref(0)
const prepOutChars = ref(0)
const turnElapsed = ref(0)

const modelReady = computed(() => !!settings.value.aiTutor.modelId)

function fmtChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function startTimer(setter: (v: number) => void): () => void {
  let t: number | null = null
  let sec = 0
  setter(0)
  t = window.setInterval(() => { sec++; setter(sec) }, 1000)
  return () => { if (t) { clearInterval(t); t = null } }
}

// 备课没好时发的问题排队,备完自动发出
const pendingQuestion = ref<string | null>(null)

function scrollToBottom() {
  endRef.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
}

watch(() => [msgs.value.length, streamShown.value, prepping.value, prepThinking.value.length], () => {
  nextTick(scrollToBottom)
})

/** 备课(自动:面板打开且无稿;手动:重新备课按钮)。 */
async function prep(force = false) {
  if (prepping.value)
    return
  if (!force && plan.value)
    return
  if (!modelReady.value) {
    prepError.value = '请先在 设置 → AI → 思路导师模块 选择模型'
    return
  }
  prepping.value = true
  prepError.value = ''
  prepThinking.value = ''
  prepThinkChars.value = 0
  prepOutChars.value = 0
  const stopPrepTimer = startTimer(v => (prepElapsed.value = v))
  try {
    const r = await runTutorPrep(props.problemId, props.problemMarkdown, {
      onChunk: (acc) => { prepOutChars.value = acc.length },
      onReasoning: (acc) => {
        prepThinking.value = acc
        prepThinkChars.value = acc.length
      },
    })
    if ('error' in r && r.error) {
      prepError.value = r.error
    }
    else if ('plan' in r) {
      plan.value = r
      prepError.value = ''
    }
  }
  catch (e: any) {
    prepError.value = e?.message || '备课失败'
  }
  stopPrepTimer()
  prepping.value = false
  // 备课期间排队的问题自动发出(须在 prepping=false 之后,否则 send 又把它塞回队列)
  if (plan.value && pendingQuestion.value) {
    const q = pendingQuestion.value
    pendingQuestion.value = null
    send(q)
  }
}

/** 发送一轮:持久化 user 消息 → 流式导师回复(tutorRespond 负责持久化 assistant)。 */
async function send(preset?: string) {
  const text = (preset ?? input.value).trim()
  if (!text || sending.value)
    return
  if (prepping.value || !plan.value) {
    // 备课还没好:排队等备完自动发,不当作错误
    if (modelReady.value) {
      pendingQuestion.value = text
      input.value = ''
    }
    else {
      prepError.value = '请先在 设置 → AI → 思路导师模块 选择模型'
    }
    return
  }
  input.value = ''
  const chat = [...msgs.value, { role: 'user' as const, content: text, ts: Date.now() }]
  msgs.value = chat
  saveTutorChat(props.problemId, chat)
  sending.value = true
  streamAcc.value = ''
  streamShown.value = ''
  streamThinking.value = false
  startTyper()
  const stopTurnTimer = startTimer(v => (turnElapsed.value = v))
  try {
    const final = await tutorRespond(props.problemId, props.problemMarkdown, props.code, chat, {
      onChunk: (acc) => { streamAcc.value = acc },
      onReasoning: () => { streamThinking.value = true },
    })
    // 等打字机追平服务器全文,再同步终稿(否则终稿+打字气泡同时出现,文字重复)
    await until(() => streamShown.value.length >= streamAcc.value.length || !streamAcc.value)
    // 成功:tutorRespond 已持久化 → 读回;失败(⚠️ 错误串,不持久化)→ 本地兜一条
    const stored = loadTutorChat(props.problemId)
    msgs.value = stored.length > chat.length
      ? stored
      : [...chat, { role: 'assistant', content: final || '(网络错误,重试一下?)', ts: Date.now() }]
  }
  finally {
    stopTurnTimer()
    sending.value = false
    streamAcc.value = ''
    streamShown.value = ''
    streamThinking.value = false
    stopTyper()
  }
}

// ---- 打字机平滑:服务器常一次吐大块 chunk(甚至整段),直接渲染「糊」出来不像流式。
// streamAcc=服务器累积全文,streamShown=逐字揭示;ticker 每 30ms 按剩余量自适应步进。
// (streamShown 声明在文件顶部 refs 区,这里只放定时器)
let typerTimer: number | null = null
function startTyper() {
  stopTyper()
  typerTimer = window.setInterval(() => {
    const diff = streamAcc.value.length - streamShown.value.length
    if (diff > 0) {
      const step = Math.max(1, Math.min(48, Math.ceil(diff / 8)))
      streamShown.value = streamAcc.value.slice(0, streamShown.value.length + step)
    }
    else if (!sending.value) {
      stopTyper()
    }
  }, 30)
}
function stopTyper() {
  if (typerTimer) { clearInterval(typerTimer); typerTimer = null }
}
/** 轮询直到 fn() 为真(打字机追平用;最多等 5s 兜底)。 */
function until(fn: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const check = () => (fn() || Date.now() - t0 > 5000) ? resolve() : setTimeout(check, 60)
    check()
  })
}

function resetChat() {
  abortTutorStream()
  clearTutorChat(props.problemId)
  msgs.value = []
}

// pid 变化(竞赛切题)→ 整体重载
watch(() => props.problemId, (pid) => {
  abortTutorStream()
  msgs.value = loadTutorChat(pid)
  plan.value = loadTutorPlan(pid)
  prepError.value = ''
})

onMounted(() => {
  msgs.value = loadTutorChat(props.problemId)
  plan.value = loadTutorPlan(props.problemId)
  // AC 庆祝:提交后回来自动报喜(还没备课时,等备课完成再发,免得被 send 的备课检查挡掉)
  const hasAc = consumeTutorAc(props.problemId)
  prep()
  if (hasAc) {
    if (plan.value)
      send('(我刚 AC 了这题!🎉)')
    else
      watch(plan, (p) => { if (p) send('(我刚 AC 了这题!🎉)') })
  }
})

onKeyStroke('Escape', () => emit('close'))
onUnmounted(() => abortTutorStream())

const prepStatus = computed(() => {
  if (prepping.value) {
    const parts = [`${prepElapsed.value}s`]
    if (prepThinkChars.value)
      parts.push(`思考 ${fmtChars(prepThinkChars.value)} 字`)
    if (prepOutChars.value)
      parts.push(`已写 ${fmtChars(prepOutChars.value)} 字`)
    else if (!prepThinkChars.value)
      parts.push('等待模型响应…')
    return `备课中… ${parts.join(' · ')}`
  }
  if (pendingQuestion.value)
    return '备课中,你的问题已排队,备完自动发'
  if (prepError.value)
    return prepError.value.startsWith('备课失败') ? prepError.value : `备课失败:${prepError.value}`
  if (plan.value)
    return `备课完成 ✓(${plan.value.source === 'solutions' ? '基于题解' : '模型自解,未经社区验证'})`
  return modelReady.value ? '尚未备课' : '未选导师模型'
})
</script>

<template>
  <Teleport :to="mainAppRef" :disabled="!mainAppRef">
    <Transition name="tutor-slide" appear>
      <div
        v-if="true"
        class="tutor-panel" pos="fixed top-70px right-12px bottom-12px" w-360px z-9990
        bg="$bew-elevated" rounded="$bew-radius" border="1 $bew-border-color"
        shadow="[var(--bew-shadow-4),var(--bew-shadow-edge-glow-2)]"
        style="backdrop-filter:var(--bew-filter-glass-2)" flex="~ col"
      >
        <!-- 头部 -->
        <header flex="~ items-center gap-2" p="x-4 t-4 b-3" border="b-1 $bew-border-color" shrink-0>
          <span v-html="renderIcon('mingcute:compass-line', 18)" style="display:contents;color:var(--bew-theme-color)" />
          <span fw-700 style="font-size:var(--bew-base-font-size)">思路导师</span>
          <span flex-1 />
          <button
            v-if="msgs.length" title="清空对话"
            text="sm $bew-text-3 hover:$bew-error-color" bg="transparent" border="none" cursor-pointer p-2
            @click="resetChat"
          >
            <span style="display:contents" v-html="renderIcon('mingcute:broom-line', 15)" />
          </button>
          <button
            title="重新备课" text="sm $bew-text-3 hover:$bew-theme-color" bg="transparent"
            border="none" cursor-pointer p-2 :disabled="prepping"
            @click="prep(true)"
          >
            <span style="display:contents" v-html="renderIcon('mingcute:refresh-2-line', 15)" />
          </button>
          <button
            title="关闭 (Esc)" text="sm $bew-text-3 hover:$bew-text-1" bg="transparent"
            border="none" cursor-pointer p-2 @click="emit('close')"
          >
            <span style="display:contents" v-html="renderIcon('mingcute:close-line', 16)" />
          </button>
        </header>

        <!-- 备课状态条 -->
        <div
          flex="~ items-center gap-2" px-4 py-2 shrink-0 text="xs $bew-text-3"
          border="b-1 $bew-border-color" bg="$bew-fill-1"
          :style="{ color: prepError ? 'var(--bew-error-color)' : plan && !prepping ? 'var(--bew-success-color)' : undefined }"
        >
          <div v-if="prepping" i-svg-spinners-ring-resize />
          <span :class="prepError ? 'tutor-prep-error' : 'truncate'">{{ prepStatus }}</span>
          <span flex-1 />
          <button
            v-if="plan" border="none" bg="transparent" cursor-pointer text="xs $bew-text-3 hover:$bew-theme-color"
            style="white-space:nowrap" @click="showPlan = !showPlan"
          >{{ showPlan ? '收起备课稿' : '偷看备课稿 ⚠️剧透' }}</button>
        </div>
        <div v-if="showPlan && plan" px-4 py-2 shrink-0 max-h-200px overflow-y-auto border="b-1 $bew-border-color" text="xs $bew-text-2" class="tutor-plan-preview">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span v-html="parseMarkdownContent(plan.plan)" />
        </div>

        <!-- 消息区 -->
        <div ref="listRef" flex-1 overflow-y-auto p-3>
          <div v-if="msgs.length === 0 && !sending" text="center $bew-text-3" py-8 style="font-size:var(--bew-base-font-size)">
            {{ modelReady ? '问我「怎么做」开始引导 🧭' : '先去 设置 → AI → 思路导师模块 选个模型' }}
          </div>
          <div
            v-for="(m, i) in msgs" :key="i" flex="~" mb-2
            :style="{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }"
          >
            <div v-if="m.role === 'user'" class="tb tb-mine">{{ m.content }}</div>
            <div v-else class="tb tb-tutor markdown-body">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-html="parseMarkdownContent(m.content)" />
            </div>
          </div>
          <!-- 流式中的导师气泡(打字机逐字揭示) -->
          <div v-if="sending" flex="~ justify-start" mb-2>
            <div class="tb tb-tutor markdown-body">
              <span v-if="streamThinking && !streamShown" text="xs $bew-text-3">思考中… {{ turnElapsed }}s</span>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-else-if="streamShown" v-html="parseMarkdownContent(streamShown)" />
              <span v-else text="xs $bew-text-3">等待响应… {{ turnElapsed }}s</span>
            </div>
          </div>
          <div ref="endRef" />
        </div>

        <!-- 输入区 -->
        <div border="t-1 $bew-border-color" p-3 flex="~ items-end gap-2" bg="$bew-fill-1" shrink-0>
          <button
            title="要下一层提示" text="sm" border="1 $bew-border-color" bg="$bew-content"
            rounded="$bew-radius" cursor-pointer p="x-2 y-2" style="white-space:nowrap;color:var(--bew-text-2)"
            :disabled="sending || prepping" @click="send('给我下一层提示')"
          >
            下一层
          </button>
          <textarea
            v-model="input"
            style="flex:1;background:var(--bew-content);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);padding:8px 12px;font-size:var(--bew-base-font-size);resize:none;min-height:40px;max-height:120px;font-family:inherit;outline:none"
            placeholder="说说你的想法… (Enter 发送)"
            rows="1"
            @keydown.enter.exact.prevent="send()"
          />
          <button
            style="background:var(--bew-theme-color);color:white;border:none;border-radius:var(--bew-radius);padding:8px 14px;cursor:pointer;font-size:var(--bew-base-font-size);font-weight:600;white-space:nowrap"
            :disabled="sending || prepping || !input.trim()"
            :style="{ opacity: (sending || prepping || !input.trim()) ? .5 : 1 }"
            @click="send()"
          >
            {{ sending ? '…' : '发送' }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tutor-panel :deep(.markdown-body) {
  font-size: var(--bew-base-font-size);
  p { margin: 0 0 .4em; &:last-child { margin-bottom: 0; } }
  pre { max-width: 100%; }
}
.tb {
  max-width: 86%;
  padding: 9px 13px;
  border-radius: 12px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
.tb-mine {
  background: var(--bew-theme-color);
  color: #fff;
  border-bottom-right-radius: 4px;
  font-size: var(--bew-base-font-size);
}
.tb-tutor {
  background: var(--bew-fill-2);
  color: var(--bew-text-1);
  border-bottom-left-radius: 4px;
  white-space: normal;
}
.tutor-plan-preview :deep(p) { margin: 0 0 .3em; }
/* 备课错误:允许换行看全服务器返回的原因(而非单行截断) */
.tutor-prep-error {
  white-space: pre-wrap;
  word-break: break-all;
  text-align: left;
  max-height: 96px;
  overflow-y: auto;
}

.tutor-slide-enter-active,
.tutor-slide-leave-active {
  transition: transform var(--bew-dur-cozy) var(--bew-ease), opacity var(--bew-dur-cozy) ease;
}
.tutor-slide-enter-from,
.tutor-slide-leave-to {
  transform: translateX(30px);
  opacity: 0;
}
</style>
