/**
 * Shared message polling composable — singleton state across all callers.
 * Used by TopBar (unread badge) and Messages page (notification toggle).
 */
import { ref, onMounted, onUnmounted } from 'vue'

// Module-level singleton state (shared across all component instances)
const unreadMsgCount = ref(0)
const prevUnreadCount = ref(0)
const notifyEnabled = ref(localStorage.getItem('gulugulu-msg-notify') === 'true')
const latestChatData = ref<any>(null)
const chatVersion = ref(0) // increments on each poll to trigger watchers
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
  // Prevent duplicate polling across tabs
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

    // Only notify when unread count INCREASED (not just > 0)
    if (notifyEnabled.value && total > prevUnreadCount.value
      && 'Notification' in window && Notification.permission === 'granted') {
      const msgs: any[] = json?.currentData?.latestMessages?.result || []
      // Find the sender with the most recent unread message
      for (const [uidStr, count] of Object.entries(currentUnread)) {
        if (count === 0) continue
        const nuid = Number(uidStr)
        const msg = msgs.find((m: any) => Number(m.sender.uid) === nuid)
        if (msg) {
          try {
            const name = msg.sender.name || '有人'
            const n = new Notification(`${name} 发来新消息`, {
              body: msg.content?.slice(0, 100) || '',
              icon: `https://cdn.luogu.com.cn/upload/usericon/${nuid}.png`,
              tag: `gulugulu-msg-${nuid}`,
            })
            n.onclick = () => { window.location.href = 'https://www.luogu.com.cn/chat'; n.close() }
          } catch {}
        }
      }
    }

    prevUnreadCount.value = total
    // Only update badge if user is not actively viewing messages
    if (!(window as any).__guly_viewing_messages) unreadMsgCount.value = total
    latestChatData.value = json
    chatVersion.value++
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
  if (timer) { clearInterval(timer); timer = null }
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

  return { unreadMsgCount, notifyEnabled, toggleNotify, resetUnread, latestChatData, chatVersion }
}
