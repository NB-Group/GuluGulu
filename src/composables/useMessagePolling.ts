/**
 * Shared message polling composable — singleton state across all callers.
 * Used by TopBar (unread badge) and Messages page (notification toggle).
 */
import { ref, onMounted, onUnmounted } from 'vue'

// Module-level singleton state (shared across all component instances)
const unreadMsgCount = ref(0)
const notifyEnabled = ref(localStorage.getItem('gulugulu-msg-notify') !== 'false')
const lastUnreadUsers = ref<Set<number>>(new Set())
const notifiedOnce = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let pollCount = 0

function toggleNotify() {
  notifyEnabled.value = !notifyEnabled.value
  localStorage.setItem('gulugulu-msg-notify', String(notifyEnabled.value))
  if (notifyEnabled.value && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

async function poll() {
  const uid = (window as any).__guly_user?.uid
  if (!uid || uid === '0') return
  // Prevent duplicate polling across tabs: only one tab polls per 15s window
  const lastPollKey = 'gulugulu-last-poll'
  const lastPoll = Number(localStorage.getItem(lastPollKey) || '0')
  const now = Date.now()
  if (now - lastPoll < 3000) return // another tab polled within 3s
  localStorage.setItem(lastPollKey, String(now))

  try {
    const res = await fetch('https://www.luogu.com.cn/chat?_contentOnly=1', { credentials: 'same-origin' })
    const json = await res.json()
    const raw = json?.currentData?.unreadMessageCount
    const currentUnread: Record<number, number> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) currentUnread[Number(k)] = Number(v) || 0
    }
    const total = Object.values(currentUnread).reduce((a: number, b) => a + b, 0)
    const newUsers = Object.keys(currentUnread).map(Number).filter(uid => !lastUnreadUsers.value.has(uid))

    if (notifyEnabled.value && notifiedOnce.value && newUsers.length > 0
      && 'Notification' in window && Notification.permission === 'granted') {
      const msgs: any[] = json?.currentData?.latestMessages?.result || []
      for (const nuid of newUsers) {
        const msg = msgs.find((m: any) => Number(m.sender.uid) === nuid || Number(m.receiver.uid) === nuid)
        const name = msg ? (Number(msg.sender.uid) === nuid ? msg.sender.name : msg.receiver.name) : '有人'
        try {
          const n = new Notification(`${name} 发来新消息`, {
            body: msg?.content?.slice(0, 80) || '',
            icon: `https://cdn.luogu.com.cn/upload/usericon/${nuid}.png`,
            tag: 'gulugulu-msg',
          })
          n.onclick = () => { window.location.href = 'https://www.luogu.com.cn/chat'; n.close() }
        } catch {}
      }
    }
    notifiedOnce.value = true
    lastUnreadUsers.value = new Set(Object.keys(currentUnread).map(Number))
    unreadMsgCount.value = total
  } catch {}
}

function start() {
  pollCount++
  if (timer) return // already running
  poll()
  timer = setInterval(poll, 8000)
}

function stop() {
  pollCount = Math.max(0, pollCount - 1)
  if (pollCount > 0) return // another component still needs polling
  if (timer) { clearInterval(timer); timer = null }
}

export function useMessagePolling() {
  onMounted(() => {
    const uid = (window as any).__guly_user?.uid
    if (uid && uid !== '0') start()
  })
  onUnmounted(() => stop())

  return { unreadMsgCount, notifyEnabled, toggleNotify }
}
