import { ref, type Ref } from 'vue'

/**
 * 题解列表:懒加载(切到「题解」标签页时触发)。同源拉取题目题解页,
 * 从内嵌 lentille-context 解析 solutions.result。
 * 从 ProblemDetail 抽出。
 */
export function useSolutions(problemId: Ref<string>) {
  const solutions = ref<Array<{ id: number, title: string, author: any, time: number, votes: number }>>([])
  const solutionsLoading = ref(false)

  async function loadSolutions() {
    if (solutionsLoading.value)
      return
    solutionsLoading.value = true
    try {
      const res = await fetch(`https://www.luogu.com.cn/problem/solution/${problemId.value}`, { credentials: 'same-origin' })
      const html = await res.text()
      const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
      if (m?.[1]) {
        const ctx = JSON.parse(m[1])
        const list = ctx?.data?.solutions?.result || ctx?.currentData?.solutions?.result || []
        solutions.value = list.map((s: any) => {
          return {
            id: s.id || 0,
            title: s.title || '',
            author: s.author || {},
            time: s.time || 0,
            votes: s.votes || s.thumbUp || 0,
          }
        })
      }
    }
    catch (e) { console.warn('[GuluGulu]', e) }
    solutionsLoading.value = false
  }

  return { solutions, solutionsLoading, loadSolutions }
}
