import { ref, type Ref } from 'vue'

/**
 * 题解列表:懒加载(切到「题解」标签页时触发)。
 * 直接 fetch 题解页 HTML(题解数据在 HTML 的 lentille-context 里,与独立 Solution.vue
 * 同路径;?_contentOnly=1 的 JSON 不含 solutions),正则取出后读 cd.solutions.result。
 * 洛谷题解需登录:未登录返回 401 → solutionsNeedLogin。
 */
export function useSolutions(problemId: Ref<string>) {
  const solutions = ref<Array<{ id: number, title: string, author: any, time: number, votes: number }>>([])
  const solutionsLoading = ref(false)
  const solutionsNeedLogin = ref(false)

  async function loadSolutions() {
    if (solutionsLoading.value)
      return
    solutionsLoading.value = true
    solutionsNeedLogin.value = false
    try {
      const res = await fetch(`${location.origin}/problem/solution/${problemId.value}`, { credentials: 'same-origin' })
      if (res.status === 401) {
        solutionsNeedLogin.value = true
      }
      else {
        const html = await res.text()
        const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
        if (m?.[1]) {
          const ctx = JSON.parse(m[1])
          const cd = ctx?.data || ctx?.currentData || {}
          const list = cd.solutions?.result || cd.solutions || []
          solutions.value = (Array.isArray(list) ? list : []).map((s: any) => ({
            id: s.id || s.sid || 0,
            title: s.title || '',
            author: s.author || {},
            time: s.time || 0,
            votes: s.votes || s.thumbUp || 0,
          }))
        }
      }
    }
    catch (e) { console.warn('[GuluGulu]', e) }
    solutionsLoading.value = false
  }

  return { solutions, solutionsLoading, solutionsNeedLogin, loadSolutions }
}
