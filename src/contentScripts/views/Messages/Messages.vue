<script setup lang="ts">
import { getCsrfToken } from '~/utils/luogu-api'

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
    const unread: Record<number, number> = json?.currentData?.unreadMessageCount || {}

    // Group latest messages by conversation partner
    const map = new Map<number, Conversation>()
    for (const msg of msgs) {
      const other = getOppositeUser(msg)
      if (!map.has(other.uid)) {
        map.set(other.uid, {
          user: other,
          lastMsg: msg,
          unread: unread[String(other.uid)] || unread[other.uid] || 0,
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
    messages.value = (json?.messages?.result || []).reverse()

    // Clear unread
    try {
      const csrf = getCsrfToken()
      await fetch('https://www.luogu.com.cn/api/chat/clearUnread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
        body: JSON.stringify({ user: uid }),
      })
      // Update local unread count
      const conv = conversations.value.find(c => c.user.uid === uid)
      if (conv) conv.unread = 0
    } catch {}
  } catch {}
  chatLoading.value = false
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
      // Add sent message locally
      messages.value.push({
        id: Date.now(),
        sender: { uid: currentUid.value, name: (window as any).__guly_user?.name || '', avatar: `https://cdn.luogu.com.cn/upload/usericon/${currentUid.value}.png`, color: '', badge: null },
        receiver: activeChatUser.value || { uid: activeChatUid.value!, name: '', avatar: '', color: '', badge: null },
        time: Math.floor(Date.now() / 1000),
        status: 2,
        content: text,
      })
      newMsg.value = ''
      nextTick(() => {
        const el = document.querySelector('.msg-list')
        if (el) el.scrollTop = el.scrollHeight
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
        <div class="chat-layout" flex="~" h-full rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
          <!-- Sidebar: conversation list -->
          <div class="chat-sidebar" w="300px" shrink-0 border="r-1 $bew-border-color" bg="$bew-content" flex="~ col">
            <div p-4 border="b-1 $bew-border-color" bg="$bew-fill-1">
              <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">私信</h2>
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
              <div v-else class="msg-list" flex="~ col 1" p-4 gap-2>
                <div v-if="messages.length === 0" text="center" style="color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>
                  暂无消息，发送第一条消息吧
                </div>
                <div
                  v-for="msg in messages" :key="msg.id"
                  flex="~"
                  :style="{ justifyContent: msg.sender.uid === currentUid ? 'flex-end' : 'flex-start' }"
                >
                  <div
                    :style="{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      fontSize: 'var(--bew-base-font-size)',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: msg.sender.uid === currentUid ? 'var(--bew-theme-color)' : 'var(--bew-fill-2)',
                      color: msg.sender.uid === currentUid ? 'white' : 'var(--bew-text-1)',
                      borderBottomRightRadius: msg.sender.uid === currentUid ? '4px' : '12px',
                      borderBottomLeftRadius: msg.sender.uid === currentUid ? '12px' : '4px',
                    }"
                  >
                    {{ msg.content }}
                    <div :style="{ fontSize: '.7em', marginTop: '4px', opacity: .7, textAlign: 'right' }">
                      {{ formatTime(msg.time) }}
                    </div>
                  </div>
                </div>
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
  min-height: 70vh;
  max-height: calc(100vh - var(--bew-top-bar-height) - 60px);
}
.chat-sidebar {
  overflow-y: auto;
  @media (max-width: 768px) {
    width: 100% !important;
    border-right: none !important;
  }
}
.chat-area {
  min-height: 0; /* critical: allows flex child to shrink for scrolling */
}
.msg-list {
  min-height: 0;
  overflow-y: auto;
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--bew-border-color); border-radius: 3px; &:hover { background: var(--bew-text-4); } }
}
.conversation-item:hover { background: var(--bew-fill-2); }
</style>
