import { ref, watch, type ComputedRef, type Ref } from 'vue'
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'

/**
 * 竞赛模式(?contestId=):拉取竞赛题目列表 + 题目切换器展开态。
 * 从 ProblemDetail 抽出。setup 时若已处竞赛模式即拉一次;contestId 变化(SPA 切竞赛)重拉。
 */
export function useContestMode(contestId: Ref<string> | ComputedRef<string>) {
  const { navigateTo } = useGuluApp()
  const contestProblems = ref<Array<{ no: string, pid: string, title: string, score: number }>>([])
  const showProblemSwitcher = ref(false)
  const showTags = ref(false)

  async function fetchContestProblems() {
    if (!contestId.value)
      return
    try {
      const res = await fetch(`https://www.luogu.com.cn/contest/${contestId.value}`, { credentials: 'same-origin' })
      const html = await res.text()
      const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
      if (m?.[1]) {
        const ctx = JSON.parse(m[1])
        const cd = ctx?.data || ctx?.currentData || {}
        const all = cd?.contestProblems || []
        contestProblems.value = all.map((p: any) => ({
          no: p.no || '',
          pid: p.problem?.pid || p.pid || '',
          title: p.problem?.name || p.title || '',
          score: p.score || 0,
        }))
      }
    }
    catch (e) { console.warn('[GuluGulu]', e) }
  }

  function switchToProblem(pid: string) {
    if (pid)
      navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}?contestId=${contestId.value}`)
  }

  if (contestId.value)
    fetchContestProblems()
  watch(contestId, (newId) => {
    if (newId)
      fetchContestProblems()
  })

  return { contestProblems, showProblemSwitcher, showTags, switchToProblem }
}
