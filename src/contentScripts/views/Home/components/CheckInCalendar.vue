<script setup lang="ts">
// Event countdown constants (based on real CSP 2026 schedule)
const CSP_ROUND_1_DATE = new Date('2026-09-18')
const CSP_ROUND_2_DATE = new Date('2026-10-30')

const now = new Date()

// Chinese month names
const chineseMonths = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
// Chinese day-of-week names
const chineseWeekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
// Month size labels
function getMonthSizeLabel(month: number, year: number): string {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  if (daysInMonth === 31) return '大'
  if (daysInMonth === 30) return '小'
  return '平'
}

const currentYear = now.getFullYear()
const currentMonth = now.getMonth()
const currentDay = now.getDate()

const monthName = chineseMonths[currentMonth]
const monthSizeLabel = getMonthSizeLabel(currentMonth, currentYear)
const weekdayName = chineseWeekdays[now.getDay()]
const dayDisplay = String(currentDay).padStart(2, '0')

function daysUntil(target: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diff = targetDay.getTime() - today.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

const cspRound1Days = daysUntil(CSP_ROUND_1_DATE)
const cspRound2Days = daysUntil(CSP_ROUND_2_DATE)

// === Persist check-in state across page switches ===
// Module-level cache survives component mount/unmount cycles
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
const checkInState = (window as any).__guly_checkin || ((window as any).__guly_checkin = { date: '', done: false, fortune: null as any })
const checkInDone = ref(checkInState.date === todayStr() && checkInState.done)
const checkInMsg = ref('')
const fortuneResult = ref(checkInState.date === todayStr() ? checkInState.fortune : null)
function saveCheckInState() {
  checkInState.date = todayStr(); checkInState.done = checkInDone.value; checkInState.fortune = fortuneResult.value
}

const uid = (window as any).__guly_user?.uid

function parsePunchHtml(html: string) {
  const r = { level: '', levelColor: 'var(--bew-text-2)', good: [] as string[], bad: [] as string[], days: '' }
  const lm = html.match(/lg-punch-result\s+lg-fg-(\w+)[^>]*>([^<]+)</)
  if (lm) {
    r.level = lm[2].trim()
    const cm: Record<string, string> = { green: '#52c41a', red: '#e74c3c', yellow: '#f39c12', blue: '#3498db' }
    r.levelColor = cm[lm[1]] || 'var(--bew-text-2)'
  }
  for (const m of html.matchAll(/宜：<[^>]*>([^<]+)<[^>]*>[\s\S]*?lg-small[^>]*>([^<]+)</g)) r.good.push(`${m[1].trim()} — ${m[2].trim()}`)
  for (const m of html.matchAll(/忌：<[^>]*>([^<]+)<[^>]*>[\s\S]*?lg-small[^>]*>([^<]+)</g)) r.bad.push(`${m[1].trim()} — ${m[2].trim()}`)
  const dm = html.match(/连续打卡了\s*<strong>(\d+)<\/strong>\s*天/)
  if (dm) r.days = dm[1]
  return r
}

const checkInLoading = ref(true)

// GET the Luogu homepage and parse today's punch fortune from its HTML card.
// ajax_punch's response is just {code, message} (no fortune html), so the
// fortune must be read from the homepage — used both on mount and right after
// a successful check-in, so the result shows without a manual page refresh.
async function fetchFortuneFromHome() {
  const res = await fetch('https://www.luogu.com.cn/', { credentials: 'same-origin' })
  const html = await res.text()
  const punchMatch = html.match(/lg-punch[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)
  if (punchMatch && punchMatch[1].includes('运势')) return parsePunchHtml(punchMatch[1])
  return null
}

// On mount: GET Luogu homepage to check today's punch status (server-side, no auto-check-in)
onMounted(async () => {
  if (!uid || uid === '0') { checkInLoading.value = false; return }
  try {
    const fortune = await fetchFortuneFromHome()
    if (fortune) {
      fortuneResult.value = fortune
      checkInDone.value = true
      saveCheckInState()
    }
  } catch (e) { console.warn('[GuluGulu]', e) }
  checkInLoading.value = false
})

async function handleCheckIn() {
  if (!uid || uid === '0') { checkInMsg.value = '请先登录洛谷'; return }
  if (checkInDone.value) return
  checkInMsg.value = '打卡中...'
  try {
    const csrf = (window as any).__guly_user?.csrfToken || ''
    const res = await fetch('https://www.luogu.com.cn/index/ajax_punch', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    })
    const data = await res.json()
    // code 200: success (html=fortune card), code 201: already checked in today
    if (data?.code === 200) {
      checkInDone.value = true
      saveCheckInState()
      checkInMsg.value = ''
      // ajax_punch returns {code, message} with no fortune html — fetch the
      // freshly-unlocked fortune from the homepage so it shows without refresh.
      try {
        fortuneResult.value = data?.html ? parsePunchHtml(data.html) : await fetchFortuneFromHome()
      } catch (e) { console.warn('[GuluGulu]', e) }
    } else if (data?.code === 201 || data?.message?.includes('已经打过') || data?.message?.includes('已经打卡')) {
      checkInDone.value = true
      saveCheckInState()
      checkInMsg.value = '今日已打卡'
    } else if (res.status === 200) {
      // API returned 200 OK but unexpected body — treat as success
      checkInDone.value = true
      saveCheckInState()
      checkInMsg.value = ''
    } else {
      checkInMsg.value = data?.message || data?.data || '打卡失败，请重试'
    }
  } catch (e: any) {
    checkInMsg.value = '打卡失败：' + (e.message || '网络错误')
  }
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1)"
    bg="$bew-content"
    rounded="12px"
    shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
    border="1 solid $bew-border-color"
    p="16px"
    flex="~ col items-center"
  >
    <!-- Calendar Header -->
    <div class="calendar-header" text="center" mb-2 w-full>
      <div text="xs $bew-text-3" mb-1>
        打卡
      </div>
      <div class="calendar-date-display" flex="~ col items-center" gap-1>
        <span text="sm" fw-bold style="color: var(--bew-theme-color)">
          {{ monthName }}{{ monthSizeLabel }}
        </span>
        <span text="4xl $bew-text-1" fw-bold class="calendar-day">
          {{ dayDisplay }}
        </span>
        <span text="sm $bew-text-2">
          {{ weekdayName }}
        </span>
      </div>
    </div>

    <!-- Divider -->
    <div w-full h-1px bg="$bew-border-color" my-3 />

    <!-- Check-in Button / Result -->
    <button
      v-if="!checkInDone"
      class="checkin-btn"
      bg="$bew-theme-color" text="sm white" rounded-full
      px-6 py-2 fw-bold cursor-pointer
      duration-300 w-full
      :disabled="checkInLoading || !!checkInMsg"
      @click="handleCheckIn"
    >
      {{ checkInLoading ? '检查打卡状态...' : (checkInMsg || '点击打卡') }}
    </button>

    <!-- Fortune result -->
    <div v-if="fortuneResult" w-full mt-3 style="line-height:1.7;font-size:var(--bew-base-font-size)">
      <div text="center" fw-bold mb-2 :style="{ color: fortuneResult.levelColor, fontSize: '1.3em' }">
        {{ fortuneResult.level }}
      </div>
      <div v-if="fortuneResult.good.length" mb-2>
        <div fw-bold mb-1 style="color:#52c41a">宜</div>
        <div v-for="g in fortuneResult.good" :key="g" style="color:var(--bew-text-2)">{{ g }}</div>
      </div>
      <div v-if="fortuneResult.bad.length" mb-2>
        <div fw-bold mb-1 style="color:#e74c3c">忌</div>
        <div v-for="b in fortuneResult.bad" :key="b" style="color:var(--bew-text-2)">{{ b }}</div>
      </div>
      <div v-if="fortuneResult.days" text="center" mt-2 style="color:var(--bew-text-3)">
        连续打卡 <strong style="color:var(--bew-text-1)">{{ fortuneResult.days }}</strong> 天
      </div>
    </div>

    <!-- Divider -->
    <div w-full h-1px bg="$bew-border-color" my-3 />

    <!-- Countdown section -->
    <div class="countdown-section" w-full text="xs $bew-text-2" flex="~ col" gap-1>
      <p v-if="cspRound1Days > 0" text="center">
        距 <strong style="color: var(--bew-theme-color)">CSP-J/S 2026 第一轮</strong> 还剩 <strong text="$bew-text-1">{{ cspRound1Days }} 天</strong>
      </p>
      <p v-if="cspRound2Days > 0" text="center">
        距 <strong style="color: var(--bew-theme-color)">CSP-J/S 2026 第二轮</strong> 还剩 <strong text="$bew-text-1">{{ cspRound2Days }} 天</strong>
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.calendar-header {
  .calendar-day {
    line-height: 1;
    font-feature-settings: "tnum";
    font-variant-numeric: tabular-nums;
  }
}

.calendar-date-display {
  padding: 8px 0;
}

.checkin-btn {
  box-shadow: 0 2px 8px var(--bew-theme-color-30);
  transition: all 200ms ease;

  &:hover {
    box-shadow: 0 4px 16px var(--bew-theme-color-40);
    filter: brightness(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}
</style>
