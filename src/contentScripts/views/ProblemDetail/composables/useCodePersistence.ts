import { watch, type ComputedRef, type Ref } from 'vue'

/**
 * 本地代码草稿(按 pid 存 localStorage)。洛谷只通过自家编辑器存服务端草稿,
 * 本扩展 IDE 从未回写 → 退出即丢。这里把编辑器镜像到 localStorage,草稿跨刷新/退出存活;
 * 载入时洛谷服务端草稿优先(见 ProblemDetail.loadRealData)。
 *
 * 自动监听 code/lang 变化,600ms 防抖落盘;flushLocalCode 供 pagehide/卸载/切题时立即落盘。
 */
export function useCodePersistence(opts: {
  code: Ref<string>
  lang: Ref<{ id: number }>
  problemId: Ref<string> | ComputedRef<string>
}) {
  function localCodeKey(pid: string) {
    return `gulu:code:${pid}`
  }

  function loadLocalCode(pid: string): { code: string, lang: number } | null {
    try {
      const raw = localStorage.getItem(localCodeKey(pid))
      if (!raw)
        return null
      const v = JSON.parse(raw)
      if (typeof v?.code === 'string')
        return { code: v.code, lang: typeof v.lang === 'number' ? v.lang : 28 }
    }
    catch (e) { console.warn('[GuluGulu]', e) }
    return null
  }

  let pendingSavePid: string | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function flushLocalCode() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    const pid = pendingSavePid
    pendingSavePid = null
    if (!pid)
      return
    try {
      localStorage.setItem(localCodeKey(pid), JSON.stringify({ code: opts.code.value, lang: opts.lang.value.id, ts: Date.now() }))
    }
    catch (e) { console.warn('[GuluGulu]', e) }
  }

  function scheduleLocalSave() {
    pendingSavePid = opts.problemId.value
    if (saveTimer)
      clearTimeout(saveTimer)
    saveTimer = setTimeout(flushLocalCode, 600)
  }

  watch(opts.code, scheduleLocalSave)
  watch(() => opts.lang.value.id, scheduleLocalSave)

  return { loadLocalCode, flushLocalCode }
}
