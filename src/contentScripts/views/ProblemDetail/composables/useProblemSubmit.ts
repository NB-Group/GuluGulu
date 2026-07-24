import { ref, type Ref } from 'vue'
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import type { LuoguLanguage } from '~/utils/luogu-api'
import { RECORD_STATUS_MAP, submitCode } from '~/utils/luogu-api'

/**
 * 题目提交:提交态 / 验证码 / 提交历史 / 我的提交记录。
 * 从 ProblemDetail 抽出。状态被 IDE 分屏视图与「提交代码」标签页两处模板共享,
 * 故只抽 composable(状态归此),模板仍在父组件内联。
 */
export function useProblemSubmit(opts: {
  code: Ref<string>
  isLoggedIn: Ref<boolean>
  problemId: Ref<string>
  inContestMode: Ref<boolean>
  contestId: Ref<string>
  lang: Ref<LuoguLanguage>
  enableO2: Ref<boolean>
}) {
  const { code, isLoggedIn, problemId, inContestMode, contestId, lang, enableO2 } = opts
  const { navigateTo } = useGuluApp()

  const submitting = ref(false)
  const submitError = ref('')
  const submitResult = ref('')
  const lastRid = ref<number | null>(null)
  const submitHistory = ref<Array<{ rid: number, pid: string, time: number }>>([])
  const captchaSrc = ref('')
  const captchaCode = ref('')

  // 我的提交记录(本题)
  const myRecordsVisible = ref(false)
  const myRecords = ref<any[]>([])
  const myRecordsLoading = ref(false)

  function recStatus(s: number) {
    return RECORD_STATUS_MAP[s] || { label: '?', color: '#909399' }
  }

  async function toggleMyRecords() {
    myRecordsVisible.value = true
    if (myRecords.value.length)
      return
    myRecordsLoading.value = true
    try {
      const uid = (window as any).__gulu_user?.uid
      const res = await fetch(`${location.origin}/record/list?pid=${problemId.value}&user=${uid}&_contentOnly=1`, { credentials: 'same-origin' })
      const j = await res.json()
      myRecords.value = j?.data?.records?.result || j?.currentData?.records?.result || []
    }
    catch (e) { console.warn('[GuluGulu]', e) }
    myRecordsLoading.value = false
  }

  function loadCaptcha() {
    captchaCode.value = ''
    captchaSrc.value = `${location.origin}/api/verify/captcha?_t=${Date.now()}`
  }

  async function handleSubmit() {
    if (!code.value.trim()) { submitError.value = '请输入代码'; return }
    if (!isLoggedIn.value) { submitError.value = '请先登录洛谷'; return }

    submitting.value = true
    submitError.value = ''
    submitResult.value = ''

    const result = await submitCode({
      pid: problemId.value,
      contestId: inContestMode.value ? contestId.value : undefined,
      code: code.value,
      lang: lang.value.id,
      enableO2: enableO2.value && lang.value.canO2,
      captcha: captchaCode.value || undefined,
    })

    submitting.value = false

    // --- Success ---
    if (result.status === 200 && result.rid) {
      captchaSrc.value = ''; captchaCode.value = ''
      lastRid.value = result.rid
      submitHistory.value.unshift({ rid: result.rid, pid: problemId.value, time: Date.now() })
      if (submitHistory.value.length > 5)
        submitHistory.value.pop()
      // Jump to the record page; the AC-stamp plays there once judging finishes.
      navigateTo(AppPage.Record, `${location.origin}/record/${result.rid}?from=submit`)
      return
    }

    // --- Captcha needed ---
    if (result.needCaptcha) {
      submitResult.value = ''
      submitError.value = '需要输入验证码才能提交'
      loadCaptcha()
      return
    }

    // --- Cloudflare / network errors ---
    if (result.status === 503 || result.status === 0) {
      submitError.value = result.errorMessage || '网络异常，请检查洛谷是否可访问'
      return
    }

    // --- Auth / permission errors ---
    if (result.status === 403) {
      submitError.value = result.errorMessage || '请先登录洛谷'
      return
    }

    // --- Unknown error ---
    submitError.value = result.errorMessage || `提交失败 (${result.status})`
  }

  // 切题时清空提交态(SPA 内 problemId 变化)
  function resetSubmit() {
    submitError.value = ''
    submitResult.value = ''
    captchaSrc.value = ''
    captchaCode.value = ''
    submitHistory.value = []
  }

  return {
    submitting, submitError, submitResult, lastRid, submitHistory,
    captchaSrc, captchaCode, loadCaptcha, handleSubmit, resetSubmit,
    myRecordsVisible, myRecords, myRecordsLoading, recStatus, toggleMyRecords,
  }
}
