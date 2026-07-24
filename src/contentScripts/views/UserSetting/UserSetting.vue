<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import { fetchLentilleContext, friendlyError, getCsrfToken } from '~/utils/luogu-api'
import { captchaImageUrl, uploadAndSetAvatar } from '~/utils/upload'

const { navigateTo } = useGuluApp()

type SettingTab = 'profile' | 'prize' | 'preferences'

const TAB_ROUTES: Record<SettingTab, string> = {
  profile: '/user/setting',
  prize: '/user/setting/prize',
  preferences: '/user/setting/preferences',
}

const TAB_LABELS: Record<SettingTab, string> = {
  profile: '资料',
  prize: '奖项',
  preferences: '偏好设置',
}

// 从 URL pathname 推导当前 tab
function tabFromPath(pathname: string): SettingTab {
  if (/\/user\/setting\/prize/i.test(pathname))
    return 'prize'
  if (/\/user\/setting\/(?:preferences|payment)/i.test(pathname))
    return 'preferences'
  return 'profile'
}

const activeTab = ref<SettingTab>(tabFromPath(window.location.pathname))

const tabs = computed(() => [
  { key: 'profile' as SettingTab, label: TAB_LABELS.profile },
  { key: 'prize' as SettingTab, label: TAB_LABELS.prize },
  { key: 'preferences' as SettingTab, label: TAB_LABELS.preferences },
])

function switchTab(key: SettingTab) {
  if (key === activeTab.value)
    return
  activeTab.value = key
  navigateTo(AppPage.UserSetting, `${location.origin}${TAB_ROUTES[key]}`)
}

// 监听 URL 变化(浏览器前进/后退),同步 tab
function onLocationChange() {
  activeTab.value = tabFromPath(window.location.pathname)
}
window.addEventListener('popstate', onLocationChange)
window.addEventListener('historychange', onLocationChange as EventListener)
onUnmounted(() => {
  window.removeEventListener('popstate', onLocationChange)
  window.removeEventListener('historychange', onLocationChange as EventListener)
})

// ============================================================
// 当前用户
// ============================================================
const myUid = computed(() => Number((window as any).__gulu_user?.uid) || 0)

// ============================================================
// Toast 提示(简单内联,参考 Blog.vue 的提示风格)
// ============================================================
interface Toast { id: number, type: 'success' | 'error' | 'info', text: string }
const toasts = ref<Toast[]>([])
let toastSeq = 0
function showToast(type: Toast['type'], text: string) {
  const id = ++toastSeq
  toasts.value.push({ id, type, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 3200)
}

// ============================================================
// 资料数据
// ============================================================
interface ProfileUser {
  uid: number
  name: string
  avatar: string
  slogan: string
  introduction: string
  [k: string]: any
}

const loading = ref(true)
const errorMsg = ref('')
const user = ref<ProfileUser | null>(null)
// vjudgeAccounts / openidAccounts / qqGroupToken —— 只读展示用
const vjudgeAccounts = ref<any[]>([])
const openidAccounts = ref<any[]>([])

// 编辑简介 / 个性签名
const editIntroduction = ref('')
const editSlogan = ref('')
const savingProfile = ref(false)

async function loadProfile() {
  loading.value = true
  errorMsg.value = ''
  try {
    const ctx = await fetchLentilleContext(location.origin + '/user/setting')
    if (!ctx || ctx.__needLogin) {
      errorMsg.value = '请先登录洛谷后再使用设置页'
      loading.value = false
      return
    }
    const u = ctx?.data?.user
    if (u) {
      user.value = {
        uid: u.uid ?? myUid.value,
        name: u.name ?? '',
        avatar: u.avatar ?? '',
        slogan: u.slogan ?? '',
        introduction: u.introduction ?? '',
        ...u,
      }
      editIntroduction.value = u.introduction ?? ''
      editSlogan.value = u.slogan ?? ''
    }
    vjudgeAccounts.value = ctx?.data?.vjudgeAccounts || []
    openidAccounts.value = ctx?.data?.openidAccounts || []
  }
  catch (e: any) {
    errorMsg.value = friendlyError(e)
  }
  loading.value = false
}

async function saveProfile() {
  if (!myUid.value) {
    showToast('error', '未获取到用户 uid,请先登录')
    return
  }
  savingProfile.value = true
  try {
    const res = await fetch(`${location.origin}/api/user/${myUid.value}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': getCsrfToken(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        introduction: editIntroduction.value,
        slogan: editSlogan.value,
      }),
    })
    const text = await res.text()
    let json: any = {}
    try { json = JSON.parse(text) }
    catch {}
    if (json?.errorMessage) {
      showToast('error', `保存失败:${json.errorMessage}`)
    }
    else {
      if (user.value) {
        user.value.introduction = editIntroduction.value
        user.value.slogan = editSlogan.value
      }
      showToast('success', '资料已保存')
    }
  }
  catch (e: any) {
    showToast('error', `保存失败:${e?.message || e}`)
  }
  savingProfile.value = false
}

// ============================================================
// 头像上传
// ============================================================
const avatarFile = ref<File | null>(null)
const avatarPreview = ref('')
const avatarCaptchaSrc = ref('')
const avatarCaptcha = ref('')
const avatarUploading = ref(false)
const avatarResultUrl = ref('')

function pickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f)
    return
  avatarFile.value = f
  avatarResultUrl.value = ''
  avatarPreview.value = URL.createObjectURL(f)
  if (!avatarCaptchaSrc.value)
    avatarCaptchaSrc.value = captchaImageUrl()
}

function refreshAvatarCaptcha() {
  avatarCaptcha.value = ''
  avatarCaptchaSrc.value = captchaImageUrl()
}

async function doUploadAvatar() {
  if (!avatarFile.value) {
    showToast('error', '请先选择图片')
    return
  }
  if (!avatarCaptcha.value.trim()) {
    showToast('error', '请输入验证码')
    return
  }
  if (!myUid.value) {
    showToast('error', '未获取到用户 uid,请先登录')
    return
  }
  avatarUploading.value = true
  try {
    const { url, setOk, setMessage } = await uploadAndSetAvatar(
      avatarFile.value,
      avatarCaptcha.value.trim(),
      myUid.value,
    )
    avatarResultUrl.value = url
    showToast(setOk ? 'success' : 'info', setMessage)
    // 验证码单次有效,刷新
    refreshAvatarCaptcha()
  }
  catch (e: any) {
    showToast('error', `上传失败:${e?.message || e}`)
    refreshAvatarCaptcha()
  }
  avatarUploading.value = false
}

// ============================================================
// 奖项 tab
// ============================================================
interface PrizeItem {
  prize: {
    year?: number
    contest?: string
    event?: string
    prize?: string
    score?: string | number
    rank?: string | number
    id?: number
    name?: string
    affiliation?: string
    type?: string
  }
  showLevel?: number
}
const prizeLoading = ref(false)
const prizeError = ref('')
const prizes = ref<PrizeItem[]>([])
const prizeLevel = ref<{ oi?: { level?: number, show?: number }, xcpc?: { level?: number, show?: number } }>({})
const hasRealName = ref(false)

async function loadPrizes() {
  prizeLoading.value = true
  prizeError.value = ''
  try {
    const ctx = await fetchLentilleContext(location.origin + '/user/setting/prize')
    if (!ctx || ctx.__needLogin) {
      prizeError.value = '请先登录洛谷'
      prizeLoading.value = false
      return
    }
    prizes.value = ctx?.data?.prizes || []
    prizeLevel.value = ctx?.data?.prizeLevel || {}
    hasRealName.value = !!ctx?.data?.hasRealName
  }
  catch (e: any) {
    prizeError.value = friendlyError(e)
  }
  prizeLoading.value = false
}

// ============================================================
// 偏好设置 tab(best-effort)
// ============================================================
interface Preferences {
  openSource?: boolean
  learningMode?: boolean
  messageMode?: boolean
  acceptPromotion?: boolean
  [k: string]: any
}
const prefLoading = ref(false)
const prefError = ref('')
const prefs = ref<Preferences>({})
const prefChanged = ref(false)
const savingPrefs = ref(false)

// 拿到的设置字段不固定,挑已知的渲染成开关
const PREF_FIELDS: { key: keyof Preferences, label: string, desc: string }[] = [
  { key: 'openSource', label: '开源贡献', desc: '展示你的开源项目贡献' },
  { key: 'learningMode', label: '学习模式', desc: '隐藏部分社交元素,专注刷题' },
  { key: 'messageMode', label: '消息提醒', desc: '允许接收站内消息提醒' },
  { key: 'acceptPromotion', label: '接收推广', desc: '允许接收运营推广信息' },
]

async function loadPreferences() {
  prefLoading.value = true
  prefError.value = ''
  try {
    const ctx = await fetchLentilleContext(location.origin + '/user/setting')
    if (!ctx || ctx.__needLogin) {
      prefError.value = '请先登录洛谷'
      prefLoading.value = false
      return
    }
    // 偏好字段散落在 ctx.data.user 或 ctx.data.setting 里,取并集
    const merged: Preferences = {
      ...(ctx?.data?.user || {}),
      ...(ctx?.data?.setting || {}),
    }
    prefs.value = merged
    prefChanged.value = false
  }
  catch (e: any) {
    prefError.value = friendlyError(e)
  }
  prefLoading.value = false
}

function onPrefToggle() {
  prefChanged.value = true
}

async function savePreferences() {
  savingPrefs.value = true
  try {
    const res = await fetch(`${location.origin}/user/setting/preferences/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': getCsrfToken(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        openSource: !!prefs.value.openSource,
        learningMode: !!prefs.value.learningMode,
        messageMode: !!prefs.value.messageMode,
        acceptPromotion: !!prefs.value.acceptPromotion,
      }),
    })
    const text = await res.text()
    let json: any = {}
    try { json = JSON.parse(text) }
    catch {}
    if (json?.errorMessage) {
      showToast('error', `保存失败:${json.errorMessage}`)
    }
    else {
      showToast('success', '偏好已保存')
      prefChanged.value = false
    }
  }
  catch (e: any) {
    // best-effort:端点未完全确认
    showToast('error', `保存失败(该端点可能未生效):${e?.message || e}`)
  }
  savingPrefs.value = false
}

// ============================================================
// 生命周期:按当前 tab 懒加载
// ============================================================
onMounted(async () => {
  if (activeTab.value === 'profile') {
    await loadProfile()
  }
  else if (activeTab.value === 'prize') {
    await loadPrizes()
  }
  else if (activeTab.value === 'preferences') {
    await loadPreferences()
  }
  else {
    await loadProfile()
  }
})

// tab 切换时懒加载对应数据
watch(activeTab, async (t) => {
  if (t === 'prize' && prizes.value.length === 0 && !prizeLoading.value && !prizeError.value)
    await loadPrizes()
  else if (t === 'preferences' && Object.keys(prefs.value).length === 0 && !prefLoading.value)
    await loadPreferences()
  else if (t === 'profile' && !user.value && !loading.value)
    await loadProfile()
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- Toast 容器 -->
    <div class="toast-wrap">
      <TransitionGroup name="content-reveal">
        <div
          v-for="t in toasts" :key="t.id"
          class="toast-item"
          :class="`toast-${t.type}`"
        >
          <span
            style="display: contents" v-html="renderIcon(
              t.type === 'success' ? 'mingcute:check-circle-line'
              : t.type === 'error' ? 'mingcute:close-line'
                : 'mingcute:information-line', 18)"
          />
          <span>{{ t.text }}</span>
        </div>
      </TransitionGroup>
    </div>

    <div class="us-card us-main-card">
      <!-- Tab bar -->
      <nav class="us-tabs">
        <button
          v-for="tab in tabs" :key="tab.key"
          class="us-tab btn-press" :class="{ 'us-tab--active': activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Tab content -->
      <div class="us-tab-scroll">
        <Transition name="content-reveal" mode="out-in">
          <!-- ============================================================ -->
          <!-- 资料 tab -->
          <!-- ============================================================ -->
          <div v-if="activeTab === 'profile'" key="profile" class="us-tab-panel">
            <Loading v-if="loading" />
            <div v-else-if="errorMsg" class="us-empty">
              <span style="display: contents" v-html="renderIcon('mingcute:warning-line', 32)" />
              <p mt-2>
                {{ errorMsg }}
              </p>
            </div>
            <template v-else>
              <!-- 头像上传 -->
              <section class="us-section">
                <div class="us-section-title">
                  <span style="display: contents" v-html="renderIcon('mingcute:user-4-line', 16)" />
                  <span>头像</span>
                </div>
                <div flex="~ items-start gap-6 wrap">
                  <!-- 当前/预览 -->
                  <div flex="~ col items-center gap-2" shrink-0>
                    <img
                      v-if="avatarResultUrl || avatarPreview"
                      :src="avatarResultUrl || avatarPreview"
                      class="avatar-preview"
                    >
                    <img
                      v-else
                      :src="user?.avatar"
                      class="avatar-preview"
                      @error="(e: any) => { e.target.onerror = null; e.target.style.opacity = '0.4' }"
                    >
                    <span text="xs $bew-text-3">
                      {{ avatarResultUrl ? '已上传(点击下方保存提交)' : '当前头像 / 预览' }}
                    </span>
                  </div>
                  <!-- 选择 + 验证码 + 上传 -->
                  <div flex="~ col gap-3" flex-1 min-w-0>
                    <label class="us-file-label btn-press">
                      <span style="display: contents" v-html="renderIcon('mingcute:transfer-line', 16)" />
                      <span>选择图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        style="display: none"
                        @change="pickAvatar"
                      >
                    </label>
                    <div v-if="avatarFile" flex="~ items-center gap-2 wrap">
                      <span text="xs $bew-text-3" mr-1>{{ avatarFile.name }}</span>
                      <div v-if="avatarCaptchaSrc" flex="~ items-center gap-2">
                        <img
                          :src="avatarCaptchaSrc"
                          class="captcha-img"
                          title="点击刷新"
                          alt="验证码"
                          @click="refreshAvatarCaptcha"
                        >
                        <input
                          v-model="avatarCaptcha"
                          class="us-input captcha-input"
                          placeholder="验证码"
                          @keydown.enter="doUploadAvatar"
                        >
                      </div>
                      <button
                        class="us-btn us-btn-primary btn-press"
                        :disabled="avatarUploading"
                        @click="doUploadAvatar"
                      >
                        <span v-if="avatarUploading">上传中...</span>
                        <span v-else>上传</span>
                      </button>
                    </div>
                    <p v-if="avatarResultUrl" text="xs $bew-text-3" break-all>
                      URL: <code class="us-code">{{ avatarResultUrl }}</code>
                    </p>
                  </div>
                </div>
              </section>

              <!-- 个性签名 -->
              <section class="us-section">
                <div class="us-section-title">
                  <span style="display: contents" v-html="renderIcon('mingcute:chat', 16)" />
                  <span>个性签名</span>
                </div>
                <input
                  v-model="editSlogan"
                  class="us-input"
                  placeholder="一句话签名"
                  maxlength="100"
                >
              </section>

              <!-- 个人简介 -->
              <section class="us-section">
                <div class="us-section-title">
                  <span style="display: contents" v-html="renderIcon('mingcute:book-4-line', 16)" />
                  <span>个人简介</span>
                </div>
                <textarea
                  v-model="editIntroduction"
                  class="us-textarea"
                  placeholder="支持 Markdown 的个人简介"
                  rows="6"
                />
              </section>

              <!-- 保存按钮 -->
              <div flex="~ justify-end">
                <button
                  class="us-btn us-btn-primary btn-press"
                  :disabled="savingProfile"
                  @click="saveProfile"
                >
                  <span v-if="savingProfile">保存中...</span>
                  <span v-else>保存资料</span>
                </button>
              </div>
            </template>
          </div>

          <!-- ============================================================ -->
          <!-- 奖项 tab -->
          <!-- ============================================================ -->
          <div v-else-if="activeTab === 'prize'" key="prize" class="us-tab-panel">
            <Loading v-if="prizeLoading" />
            <div v-else-if="prizeError" class="us-empty">
              <span style="display: contents" v-html="renderIcon('mingcute:warning-line', 32)" />
              <p mt-2>
                {{ prizeError }}
              </p>
            </div>
            <template v-else>
              <!-- 等级 -->
              <section v-if="prizeLevel.oi || prizeLevel.xcpc" class="us-section">
                <div class="us-section-title">
                  <span style="display: contents" v-html="renderIcon('mingcute:trophy-line', 16)" />
                  <span>奖项等级</span>
                </div>
                <div flex="~ gap-3 wrap">
                  <div v-if="prizeLevel.oi" class="us-chip">
                    OI <strong>{{ prizeLevel.oi.level ?? '-' }}</strong>
                  </div>
                  <div v-if="prizeLevel.xcpc" class="us-chip">
                    XCPC <strong>{{ prizeLevel.xcpc.level ?? '-' }}</strong>
                  </div>
                  <div class="us-chip" :class="{ 'us-chip-ok': hasRealName }">
                    实名认证 <strong>{{ hasRealName ? '已通过' : '未通过' }}</strong>
                  </div>
                </div>
              </section>

              <!-- 奖项列表(只读) -->
              <section class="us-section">
                <div class="us-section-title">
                  <span style="display: contents" v-html="renderIcon('mingcute:medal-fill', 16)" />
                  <span>获奖记录</span>
                </div>
                <div v-if="prizes.length === 0" class="us-empty-inline">
                  暂无奖项记录
                </div>
                <div v-else flex="~ col gap-2">
                  <div
                    v-for="(p, i) in prizes" :key="i"
                    class="prize-row"
                  >
                    <span style="display: contents" v-html="renderIcon('mingcute:medal-fill', 18)" />
                    <div flex="~ col gap-0.5" flex-1 min-w-0>
                      <div flex="~ items-center gap-2 wrap">
                        <strong text="$bew-text-1">{{ p.prize?.name || p.prize?.contest || '未命名赛事' }}</strong>
                        <span v-if="p.prize?.year" class="us-tag">{{ p.prize.year }}</span>
                        <span v-if="p.prize?.prize" class="us-tag us-tag-theme">{{ p.prize.prize }}</span>
                      </div>
                      <div text="xs $bew-text-3" flex="~ gap-3 wrap">
                        <span v-if="p.prize?.contest">{{ p.prize.contest }}</span>
                        <span v-if="p.prize?.event">{{ p.prize.event }}</span>
                        <span v-if="p.prize?.score != null">分数 {{ p.prize.score }}</span>
                        <span v-if="p.prize?.rank != null">排名 {{ p.prize.rank }}</span>
                        <span v-if="p.prize?.affiliation">{{ p.prize.affiliation }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </template>
          </div>

          <!-- ============================================================ -->
          <!-- 偏好设置 tab -->
          <!-- ============================================================ -->
          <div v-else-if="activeTab === 'preferences'" key="preferences" class="us-tab-panel">
            <Loading v-if="prefLoading" />
            <div v-else-if="prefError" class="us-empty">
              <span style="display: contents" v-html="renderIcon('mingcute:warning-line', 32)" />
              <p mt-2>
                {{ prefError }}
              </p>
            </div>
            <template v-else>
              <section class="us-section">
                <div class="us-section-title">
                  <span style="display: contents" v-html="renderIcon('mingcute:settings-3-line', 16)" />
                  <span>偏好</span>
                </div>
                <p text="xs $bew-text-3" mb-3>
                  以下选项端点未完全确认,保存可能不生效,仅供参考。
                </p>
                <div flex="~ col gap-1">
                  <label
                    v-for="f in PREF_FIELDS" :key="f.key"
                    class="pref-row"
                  >
                    <div flex="~ col">
                      <span text="$bew-text-1" style="font-weight: 600">{{ f.label }}</span>
                      <span text="xs $bew-text-3">{{ f.desc }}</span>
                    </div>
                    <button
                      type="button"
                      class="switch btn-press"
                      :class="{ 'switch--on': !!prefs[f.key] }"
                      :aria-pressed="!!prefs[f.key]"
                      @click="prefs[f.key] = !prefs[f.key]; onPrefToggle()"
                    >
                      <span class="switch-thumb" />
                    </button>
                  </label>
                </div>
              </section>

              <div flex="~ justify-end">
                <button
                  class="us-btn us-btn-primary btn-press"
                  :disabled="savingPrefs || !prefChanged"
                  @click="savePreferences"
                >
                  <span v-if="savingPrefs">保存中...</span>
                  <span v-else>保存偏好</span>
                </button>
              </div>
            </template>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-container {
  position: relative;
}

.us-card {
  background: var(--bew-content);
  border-radius: var(--bew-radius);
  padding: 24px;
  border: 1px solid var(--bew-border-color);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
}

.us-main-card {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--bew-top-bar-height) - 48px);
  min-height: 320px;
  overflow: hidden;
  padding-top: 16px;
}

/* ---------- Tab bar ---------- */
.us-tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border-bottom: 1px solid var(--bew-border-color);
  overflow-x: auto;
  flex-wrap: wrap;
  padding: 0 8px;
  margin-bottom: 20px;
  flex-shrink: 0;
}
.us-tab {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--bew-text-2);
  font-size: var(--bew-base-font-size);
  font-weight: 500;
  transition:
    color var(--bew-dur-fast),
    border-color var(--bew-dur-fast);
}
.us-tab:hover {
  color: var(--bew-text-1);
}
.us-tab--active {
  color: var(--bew-text-1);
  border-bottom-color: var(--bew-theme-color);
  font-weight: 600;
}

/* ---------- Tab content scroll area ---------- */
.us-tab-scroll {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 24px 24px;
}
.us-tab-panel {
  width: 100%;
}

/* ---------- Section ---------- */
.us-section {
  margin-bottom: 28px;
}
.us-section:last-child {
  margin-bottom: 0;
}
.us-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--bew-border-color);
  font-weight: 700;
  color: var(--bew-text-1);
  font-size: var(--bew-base-font-size);
}

/* ---------- Inputs ---------- */
.us-input {
  width: 100%;
  padding: 9px 12px;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  color: var(--bew-text-1);
  font-size: var(--bew-base-font-size);
  outline: none;
  transition:
    border-color var(--bew-dur-fast),
    box-shadow var(--bew-dur-fast);
}
.us-input::placeholder {
  color: var(--bew-text-4);
}
.us-input:focus {
  border-color: var(--bew-theme-color);
  box-shadow: 0 0 0 2px var(--bew-theme-color-20);
}
.captcha-input {
  width: 110px;
}
.captcha-img {
  height: 38px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--bew-border-color);
}

.us-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  color: var(--bew-text-1);
  font-size: var(--bew-base-font-size);
  line-height: 1.6;
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition:
    border-color var(--bew-dur-fast),
    box-shadow var(--bew-dur-fast);
}
.us-textarea::placeholder {
  color: var(--bew-text-4);
}
.us-textarea:focus {
  border-color: var(--bew-theme-color);
  box-shadow: 0 0 0 2px var(--bew-theme-color-20);
}

/* ---------- Buttons ---------- */
.us-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  cursor: pointer;
  font-size: var(--bew-base-font-size);
  font-weight: 500;
  transition:
    filter var(--bew-dur-fast),
    background var(--bew-dur-fast);
}
.us-btn:hover {
  background: var(--bew-fill-2);
}
.us-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.us-btn-primary {
  background: var(--bew-theme-color);
  color: #fff;
  border-color: var(--bew-theme-color);
}
.us-btn-primary:hover {
  background: var(--bew-theme-color);
  filter: brightness(1.08);
}

.us-file-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bew-fill-1);
  border: 1px dashed var(--bew-border-color);
  border-radius: var(--bew-radius);
  cursor: pointer;
  color: var(--bew-text-1);
  font-size: 0.9em;
  transition:
    border-color var(--bew-dur-fast),
    background var(--bew-dur-fast);
}
.us-file-label:hover {
  border-color: var(--bew-theme-color);
  background: var(--bew-fill-2);
}

/* ---------- Avatar preview ---------- */
.avatar-preview {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--bew-border-color);
  box-shadow: var(--bew-shadow-1);
  background: var(--bew-fill-2);
}

.us-code {
  background: var(--bew-fill-2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  word-break: break-all;
}

/* ---------- Chips / tags ---------- */
.us-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: 999px;
  font-size: 0.85em;
  color: var(--bew-text-2);
}
.us-chip strong {
  color: var(--bew-text-1);
}
.us-chip-ok strong {
  color: var(--bew-success-color);
}
.us-tag {
  display: inline-block;
  padding: 1px 8px;
  background: var(--bew-fill-2);
  border-radius: 4px;
  font-size: 0.78em;
  color: var(--bew-text-3);
}
.us-tag-theme {
  background: var(--bew-theme-color-20);
  color: var(--bew-theme-color);
  font-weight: 600;
}

/* ---------- Prize list ---------- */
.prize-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
}

/* ---------- Preferences ---------- */
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--bew-border-color);
  cursor: pointer;
}
.pref-row:last-child {
  border-bottom: none;
}
.switch {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: var(--bew-fill-2);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: background var(--bew-dur-fast);
}
.switch--on {
  background: var(--bew-theme-color);
}
.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--bew-shadow-1);
  transition: transform var(--bew-dur-fast);
}
.switch--on .switch-thumb {
  transform: translateX(20px);
}

/* ---------- Empty / error states ---------- */
.us-empty {
  text-align: center;
  color: var(--bew-text-2);
  padding: 48px 0;
}
.us-empty-inline {
  color: var(--bew-text-3);
  padding: 16px;
  text-align: center;
}

/* ---------- Toast ---------- */
.toast-wrap {
  position: fixed;
  top: calc(var(--bew-top-bar-height) + 16px);
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--bew-radius);
  border: 1px solid var(--bew-border-color);
  background: var(--bew-content);
  color: var(--bew-text-1);
  box-shadow: var(--bew-shadow-1);
  font-size: 0.9em;
  max-width: 360px;
}
.toast-success {
  border-left: 3px solid var(--bew-success-color);
}
.toast-error {
  border-left: 3px solid var(--bew-error-color);
}
.toast-info {
  border-left: 3px solid var(--bew-theme-color);
}
</style>
