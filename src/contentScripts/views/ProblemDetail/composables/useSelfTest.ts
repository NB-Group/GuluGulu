import { onUnmounted, ref, type ComputedRef, type Ref } from 'vue'
import { ideExecLabel, isLoggedIn as checkLuoguLogin, parseIdeExecute } from '~/utils/luogu-api'

/**
 * IDE 自测(运行用户代码 + 实时 WS 取结果)。从 ProblemDetail 抽出:
 * 持有输入/输出/判定等响应式状态,管理 WebSocket 生命周期(组件卸载自动 cleanupWs),
 * 向外暴露 runTest / resetTest。
 *
 * onCompileError:CE 时把编译器报错文本回传宿主(用于编辑器报错行高亮)。
 */
export function useSelfTest(opts: {
  code: Ref<string>
  langId: Ref<number> | ComputedRef<number>
  enableO2: Ref<boolean>
  onCompileError: (msg: string) => void
}) {
  const testInput = ref('')
  const testExpectedOutput = ref('')
  const testActualOutput = ref('')
  const testRunning = ref(false)
  const testVerdict = ref('')
  const showTestPanel = ref(true)

  let activeWs: WebSocket | null = null
  let activeWsTimeout: ReturnType<typeof setTimeout> | null = null

  function cleanupWs() {
    if (activeWsTimeout) { clearTimeout(activeWsTimeout); activeWsTimeout = null }
    if (activeWs) {
      try { activeWs.close() }
      catch (e) { console.warn('[GuluGulu]', e) }; activeWs = null
    }
  }

  async function runTest() {
    if (!opts.code.value.trim()) { testVerdict.value = '无代码'; return }
    if (!checkLuoguLogin()) { testVerdict.value = '请先登录'; return }
    if (testRunning.value)
      return
    testRunning.value = true; testVerdict.value = ''; testActualOutput.value = '编译运行中…'
    cleanupWs()
    const csrf = (window as any).__guly_user?.csrfToken || ''
    let resolved = false
    activeWs = new WebSocket('wss://ws.luogu.com.cn/ws')
    const ws = activeWs
    activeWsTimeout = setTimeout(() => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '超时'; testActualOutput.value = '评测超时，请重试' } }, 25000)
    ws.onopen = () => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', 'https://www.luogu.com.cn/api/ide_submit')
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
      xhr.setRequestHeader('X-CSRF-TOKEN', csrf)
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
      xhr.withCredentials = true
      xhr.onload = () => {
        if (resolved)
          return
        try {
          const j = JSON.parse(xhr.responseText)
          const rid = String(j?.data?.rid ?? '')
          if (rid) { ws.send(JSON.stringify({ type: 'join_channel', channel: 'ide.track', channel_param: rid })) }
          else { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = j?.errorMessage || 'IDE 提交失败' }
        }
        catch { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = 'IDE 返回异常' }
      }
      xhr.onerror = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = '请求失败，请检查网络连接或洛谷状态' } }
      const body = new URLSearchParams({ lang: String(opts.langId.value), code: opts.code.value, input: testInput.value, o2: opts.enableO2.value ? '1' : '0', 'csrf-token': csrf })
      xhr.send(body.toString())
    }
    ws.onmessage = (event) => {
      if (resolved)
        return
      try {
        const msg = JSON.parse(event.data)
        console.debug('[GuluGulu] ide ws msg', msg)
        if (msg._ws_type === 'server_broadcast' && msg.type === 'execute') {
          resolved = true; cleanupWs(); testRunning.value = false
          console.debug('[GuluGulu] ide execute', msg)
          const ideRes = parseIdeExecute(msg.execute || {}, msg, testExpectedOutput.value.trim())
          testVerdict.value = ideExecLabel(ideRes)
          testActualOutput.value = ideRes.output
          if (ideRes.verdict === 'CE' && ideRes.message)
            opts.onCompileError(ideRes.message)
        }
        else if (msg._ws_type === 'server_broadcast' && msg.desc) {
          resolved = true; cleanupWs(); testRunning.value = false
          testVerdict.value = 'CE · 编译错误'
          testActualOutput.value = String(msg.desc)
          opts.onCompileError(String(msg.desc))
        }
      }
      catch (e) { console.warn('[GuluGulu]', e) }
    }
    ws.onerror = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '错误'; testActualOutput.value = 'WebSocket 连接失败' } }
    ws.onclose = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '错误'; testActualOutput.value = 'WebSocket 连接关闭' } }
  }

  // 切题(SPA 导航)时清空自测状态、关掉进行中的 WS
  function resetTest() {
    testVerdict.value = ''
    testActualOutput.value = ''
    cleanupWs()
  }

  onUnmounted(cleanupWs)

  return {
    testInput, testExpectedOutput, testActualOutput, testRunning, testVerdict, showTestPanel,
    runTest, resetTest,
  }
}
