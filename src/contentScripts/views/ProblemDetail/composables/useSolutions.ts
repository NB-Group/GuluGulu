import { ref, type Ref } from 'vue'

/**
 * 题解列表:懒加载(切到「题解」标签页时触发)。
 * 用 _contentOnly=1 JSON 接口(同 fetchProblemData),比 regex 抠 HTML 稳。
 * 洛谷题解需登录:未登录返回 401 / currentData.errorCode → solutionsNeedLogin。
 * 从 ProblemDetail 抽出(R5),本次改 _contentOnly + 登录态识别。
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
      const res = await fetch(`https://www.luogu.com.cn/problem/solution/${problemId.value}?_contentOnly=1`, { credentials: 'same-origin' })
      if (res.status === 401) {
        solutionsNeedLogin.value = true
      }
      else {
        const j = await res.json()
        if (j?.currentData?.errorCode || j?.data?.errorCode) {
          solutionsNeedLogin.value = true
        }
        else {
          const list = j?.currentData?.solutions?.result || j?.data?.solutions?.result || []
          solutions.value = list.map((s: any) => ({
            id: s.id || 0,
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
