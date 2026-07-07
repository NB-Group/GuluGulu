<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { getCsrfToken } from '~/utils/luogu-api'
import { useMessagePolling } from '~/composables/useMessagePolling'

const { notifyEnabled, toggleNotify } = useMessagePolling()

interface ChatUser {
  uid: number; name: string; avatar: string; color: string; badge: string | null
}
interface Message {
  id: number; sender: ChatUser; receiver: ChatUser; time: number; status: number
  content: string
}
interface Conversation {
  user: ChatUser; lastMsg: Message; unread: number
}

// ============================================================
// State
// ============================================================
const conversations = ref<Conversation[]>([])
const loading = ref(true)
const errorMsg = ref('')

const activeChatUid = ref<number | null>(null)
const activeChatUser = ref<ChatUser | null>(null)
const messages = ref<Message[]>([])
const chatLoading = ref(false)

const newMsg = ref('')
const sending = ref(false)

const currentUid = computed(() => Number((window as any).__guly_user?.uid) || 0)
const currentName = computed(() => (window as any).__guly_user?.name || '')

// ============================================================
// Fetch conversations
// ============================================================
function getOppositeUser(msg: Message): ChatUser {
  return Number(msg.sender.uid) !== currentUid.value ? msg.sender : msg.receiver
}

async function fetchConversations() {
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch('https://www.luogu.com.cn/chat?_contentOnly=1', { credentials: 'same-origin' })
    const json = await res.json()
    const msgs: Message[] = json?.currentData?.latestMessages?.result || []
    const rawUnread = json?.currentData?.unreadMessageCount
    // unreadMessageCount may be object {} or array []
    const unread: Record<string, number> = {}
    if (rawUnread && typeof rawUnread === 'object' && !Array.isArray(rawUnread)) {
      for (const [k, v] of Object.entries(rawUnread)) unread[String(k)] = Number(v) || 0
    }

    // Group latest messages by conversation partner
    const map = new Map<number, Conversation>()
    for (const msg of msgs) {
      const other = getOppositeUser(msg)
      if (!map.has(other.uid)) {
        map.set(other.uid, {
          user: other,
          lastMsg: msg,
          unread: unread[String(other.uid)] || 0,
        })
      }
    }
    conversations.value = [...map.values()]
  } catch (e: any) { errorMsg.value = e.message }
  loading.value = false
}

// ============================================================
// Fetch conversation with specific user
// ============================================================
async function openChat(uid: number, user?: ChatUser) {
  activeChatUid.value = uid
  activeChatUser.value = user || null
  messages.value = []
  chatLoading.value = true

  try {
    const res = await fetch(`https://www.luogu.com.cn/api/chat/record?user=${uid}`, {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    const json = await res.json()
    const result = json?.messages?.result || []
    // Sort by time: oldest first → newest last (chat order)
    messages.value = [...result].sort((a: any, b: any) => (a.time || 0) - (b.time || 0))

    // Clear unread
    try {
      const csrf = getCsrfToken()
      await fetch('https://www.luogu.com.cn/api/chat/clearUnread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
        body: JSON.stringify({ user: uid }),
      })
      const conv = conversations.value.find(c => c.user.uid === uid)
      if (conv) conv.unread = 0
    } catch {}
  } catch {}
  chatLoading.value = false

  // Scroll to bottom after messages render
  await nextTick()
  requestAnimationFrame(() => {
    const el = document.querySelector('.msg-list')
    if (el) el.scrollTop = el.scrollHeight
  })
}

function closeChat() {
  activeChatUid.value = null
  activeChatUser.value = null
  messages.value = []
}

// ============================================================
// Send message
// ============================================================
async function sendMessage() {
  const text = newMsg.value.trim()
  if (!text || !activeChatUid.value || sending.value) return
  sending.value = true
  try {
    const csrf = getCsrfToken()
    const res = await fetch('https://www.luogu.com.cn/api/chat/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      body: JSON.stringify({ user: activeChatUid.value, content: text }),
    })
    const json = await res.json()
    if (json?._empty !== undefined || res.ok) {
      const newMsgObj: Message = {
        id: Date.now(),
        sender: { uid: currentUid.value, name: currentName.value, avatar: `https://cdn.luogu.com.cn/upload/usericon/${currentUid.value}.png`, color: '', badge: null },
        receiver: activeChatUser.value || { uid: activeChatUid.value!, name: '', avatar: '', color: '', badge: null },
        time: Math.floor(Date.now() / 1000),
        status: 2,
        content: text,
      }
      messages.value.push(newMsgObj)
      newMsg.value = ''

      // Update conversation in sidebar
      const idx = conversations.value.findIndex(c => c.user.uid === activeChatUid.value)
      if (idx !== -1) {
        conversations.value[idx] = { ...conversations.value[idx], lastMsg: newMsgObj, unread: 0 }
      } else {
        // New conversation — insert at top
        conversations.value.unshift({
          user: activeChatUser.value || { uid: activeChatUid.value!, name: '', avatar: '', color: '', badge: null },
          lastMsg: newMsgObj,
          unread: 0,
        })
      }

      nextTick(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector('.msg-list')
          if (el) el.scrollTop = el.scrollHeight
        })
      })
    }
  } catch (e: any) {
    console.error('[GuluGulu] Send message error:', e)
  }
  sending.value = false
}

// ============================================================
// Helpers
// ============================================================
function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}
function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

onMounted(fetchConversations)
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />

    <Transition name="content-reveal">
      <div v-if="!loading" w-full h-full>
        <!-- ============================================================ -->
        <!-- Messages Layout: sidebar + chat area -->
        <!-- ============================================================ -->
        <div class="chat-layout" flex="~" h-full bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
          <!-- Sidebar: conversation list -->
          <div class="chat-sidebar" w="300px" shrink-0 border="r-1 $bew-border-color" bg="$bew-content" flex="~ col">
            <div p-4 border="b-1 $bew-border-color" bg="$bew-fill-1" flex="~ items-center justify-between">
              <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">私信</h2>
              <button
                @click="toggleNotify"
                :title="notifyEnabled ? '桌面通知已开启' : '桌面通知已关闭'"
                style="background:none;border:1px solid var(--bew-border-color);border-radius:999px;cursor:pointer;padding:3px 10px;font-size:11px;font-weight:600;color:var(--bew-text-2);display:flex;align-items:center;gap:4px;transition:all .2s"
                :style="notifyEnabled ? { background: 'var(--bew-theme-color-20)', color: 'var(--bew-theme-color)', borderColor: 'var(--bew-theme-color-30)' } : {}"
              >
                <span v-html="renderIcon(notifyEnabled ? 'mingcute:notification-line' : 'mingcute:notification-off-line', 13)" style="display:contents" />
                {{ notifyEnabled ? '提醒' : '静音' }}
              </button>
            </div>
            <div flex="1" overflow="y-auto">
              <div v-if="conversations.length === 0" p-8 text="center" style="color:var(--bew-text-3);font-size:var(--bew-base-font-size)">
                暂无私信
              </div>
              <div
                v-for="conv in conversations" :key="conv.user.uid"
                class="conversation-item"
                flex="~ items-center gap-3" p="x-4 y-3" cursor="pointer" duration-150
                border="b-1 $bew-border-color"
                :style="{ background: activeChatUid === conv.user.uid ? 'var(--bew-fill-2)' : 'transparent' }"
                @click="openChat(conv.user.uid, conv.user)"
              >
                <div pos="relative" shrink-0>
                  <img :src="conv.user.avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover" @error="(e:any) => e.target.style.display='none'" />
                  <div v-if="conv.unread > 0" pos="absolute top-0 right-0" style="min-width:18px;height:18px;background:var(--bew-error-color);color:white;font-size:11px;font-weight:700;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px;transform:translate(30%,-30%)">
                    {{ conv.unread > 99 ? '99+' : conv.unread }}
                  </div>
                </div>
                <div flex="1" min-w-0>
                  <div flex="~ items-center justify-between" mb-1>
                    <span fw-bold style="font-size:var(--bew-base-font-size);color:var(--bew-text-1)">{{ conv.user.name }}</span>
                    <span style="font-size:.75em;color:var(--bew-text-4)">{{ formatTime(conv.lastMsg.time) }}</span>
                  </div>
                  <div style="font-size:.85em;color:var(--bew-text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" :style="{ fontWeight: conv.unread > 0 ? 600 : 400, color: conv.unread > 0 ? 'var(--bew-text-1)' : 'var(--bew-text-3)' }">
                    {{ conv.lastMsg.content.slice(0, 50) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Chat area -->
          <div class="chat-area" flex="~ col 1" bg="$bew-content">
            <!-- No chat selected -->
            <div v-if="!activeChatUid" flex="~ col 1 items-center justify-center" style="color:var(--bew-text-3)">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p mt-4 style="font-size:var(--bew-base-font-size)">选择对话开始聊天</p>
            </div>

            <!-- Chat header -->
            <template v-if="activeChatUid">
              <div flex="~ items-center gap-3" p="x-4 y-3" border="b-1 $bew-border-color" bg="$bew-fill-1">
                <button style="background:none;border:none;cursor:pointer;color:var(--bew-text-2);padding:4px" @click="closeChat">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <img v-if="activeChatUser?.avatar" :src="activeChatUser.avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover" @error="(e:any) => e.target.style.display='none'" />
                <span fw-bold cursor="pointer" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1)" @click="openUser(activeChatUid)">{{ activeChatUser?.name || 'UID:' + activeChatUid }}</span>
              </div>

              <!-- Messages list -->
              <Loading v-if="chatLoading" />
              <div v-else class="msg-list" flex="~ col 1" p="x-4 y-3" gap-2>
                <div v-if="messages.length === 0" text="center" style="color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>
                  暂无消息，发送第一条消息吧
                </div>
                <TransitionGroup name="msg-fade" tag="div" appear>
                  <div
                    v-for="msg in messages" :key="msg.id"
                    flex="~"
                    :style="{ justifyContent: Number(msg.sender.uid) === currentUid ? 'flex-end' : 'flex-start' }"
                  >
                    <div class="msg-bubble" :class="Number(msg.sender.uid) === currentUid ? 'msg-mine' : 'msg-other'">
                      {{ msg.content }}
                      <div class="msg-time">{{ formatTime(msg.time) }}</div>
                    </div>
                  </div>
                </TransitionGroup>
              </div>

              <!-- Input area -->
              <div border="t-1 $bew-border-color" p-3 flex="~ items-end gap-2" bg="$bew-fill-1">
                <textarea
                  v-model="newMsg"
                  style="flex:1;background:var(--bew-content);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);padding:8px 12px;font-size:var(--bew-base-font-size);resize:none;min-height:40px;max-height:120px;font-family:inherit;outline:none"
                  placeholder="输入消息... (Enter 发送)"
                  rows="1"
                  @keydown="handleKeydown"
                />
                <button
                  style="background:var(--bew-theme-color);color:white;border:none;border-radius:var(--bew-radius);padding:8px 16px;cursor:pointer;font-size:var(--bew-base-font-size);font-weight:600;white-space:nowrap"
                  :disabled="sending || !newMsg.trim()"
                  :style="{ opacity: (sending || !newMsg.trim()) ? .5 : 1 }"
                  @click="sendMessage"
                >
                  {{ sending ? '发送中...' : '发送' }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.chat-layout {
  height: calc(100vh - var(--bew-top-bar-height) - 60px);
  min-height: 400px;
}
.chat-sidebar {
  overflow-y: auto;
  @media (max-width: 768px) { width: 100% !important; border-right: none !important; }
}
.chat-area {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.msg-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--bew-border-color); border-radius: 3px; &:hover { background: var(--bew-text-4); } }
}
.conversation-item:hover { background: var(--bew-fill-2); }
/* Message bubbles */
.msg-bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: var(--bew-base-font-size);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 8px;
}
.msg-mine {
  background: var(--bew-theme-color);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.msg-other {
  background: var(--bew-fill-2);
  color: var(--bew-text-1);
  border-bottom-left-radius: 4px;
}
.msg-time {
  font-size: .7em;
  margin-top: 4px;
  opacity: .7;
  text-align: right;
}
/* Message fade animation */
.msg-fade-enter-active,
.msg-fade-appear-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.msg-fade-leave-active {
  transition: opacity 0.2s ease;
  position: absolute;
}
.msg-fade-enter-from,
.msg-fade-appear-from {
  opacity: 0;
  transform: translateY(10px);
}
.msg-fade-leave-to {
  opacity: 0;
}
.msg-fade-move {
  transition: transform 0.3s ease;
}
</style>
