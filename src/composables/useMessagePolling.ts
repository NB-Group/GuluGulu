import { ref, onMounted, onUnmounted } from 'vue'

const unreadMsgCount = ref(0)
const prevUnreadCount = ref(0)
const notifyEnabled = ref(localStorage.getItem('gulugulu-msg-notify') === 'true')
let onNewData: ((data: any) => void) | null = null
export function onMessagePoll(cb: (data: any) => void) { onNewData = cb }

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
  const lastPollKey = 'gulugulu-last-poll'
  const lastPoll = Number(localStorage.getItem(lastPollKey) || '0')
  const now = Date.now()
  if (now - lastPoll < 3000) return
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

    if (notifyEnabled.value && total > prevUnreadCount.value
      && 'Notification' in window && Notification.permission === 'granted') {
      const msgs: any[] = json?.currentData?.latestMessages?.result || []
      for (const [uidStr, count] of Object.entries(currentUnread)) {
        if (count === 0) continue
        const nuid = Number(uidStr)
        const msg = msgs.find((m: any) => Number(m.sender.uid) === nuid)
        if (msg) {
          try {
            new Notification(`${msg.sender.name || '有人'} 发来新消息`, {
              body: msg.content?.slice(0, 100) || '',
              icon: `https://cdn.luogu.com.cn/upload/usericon/${nuid}.png`,
              tag: `gulugulu-msg-${nuid}`,
            }).onclick = () => { window.location.href = 'https://www.luogu.com.cn/chat' }
          } catch {}
        }
      }
    }

    prevUnreadCount.value = total
    if (!(window as any).__guly_viewing_messages) unreadMsgCount.value = total
    if (onNewData) onNewData(json)
  } catch {}
}

function start() {
  pollCount++
  if (timer) return
  poll()
  timer = setInterval(poll, 8000)
}

function stop() {
  pollCount = Math.max(0, pollCount - 1)
  if (pollCount > 0) return
}

function resetUnread() {
  unreadMsgCount.value = 0
  prevUnreadCount.value = 0
}

export function useMessagePolling() {
  onMounted(() => {
    const uid = (window as any).__guly_user?.uid
    if (uid && uid !== '0') start()
  })
  onUnmounted(() => stop())
  return { unreadMsgCount, notifyEnabled, toggleNotify, resetUnread }
}
