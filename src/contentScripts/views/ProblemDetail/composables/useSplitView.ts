import { onUnmounted, ref } from 'vue'

/**
 * 可拖拽分屏比例:IDE 分屏视图的竖向分隔条拖拽。
 * 从 ProblemDetail 抽出。拖拽期间在 document 上挂 mousemove/mouseup,
 * 组件卸载时兜底移除监听(防泄漏)。
 */
export function useSplitView() {
  const splitRatio = ref(40)
  const isDragging = ref(false)
  let cleanupResize: (() => void) | null = null

  function startResize(e: MouseEvent) {
    isDragging.value = true
    const container = (e.target as HTMLElement).parentElement!
    const startPct = splitRatio.value
    const startX = e.clientX
    const totalW = container.offsetWidth
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      splitRatio.value = Math.max(25, Math.min(65, startPct + (dx / totalW) * 100))
    }
    const onUp = () => {
      isDragging.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      cleanupResize = null
    }
    cleanupResize = () => {
      isDragging.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  onUnmounted(() => cleanupResize?.())

  return { splitRatio, isDragging, startResize }
}
