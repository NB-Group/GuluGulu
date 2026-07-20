import { computed, ref, type Ref } from 'vue'
import type { LuoguLanguage } from '~/utils/luogu-api'
import { extractProblemData, fetchProblemData, LUOGU_LANGUAGES } from '~/utils/luogu-api'
import { parseProblemMarkdown } from '~/utils/markdown'

interface ProblemData {
  pid: string
  title: string
  difficulty: number
  difficultyLabel: string
  timeLimit: string
  memoryLimit: string
  tags: Array<{ id: number, name: string }>
  totalSubmit: number
  totalAccepted: number
  background: string
  description: string
  inputFormat: string
  outputFormat: string
  hint: string
  source: string
  samples: Array<{ input: string, output: string, explanation?: string }>
  provider: { uid: number, name: string, avatar: string, color: string } | null
}

const difficultyMap: Record<number, { label: string, color: string }> = {
  0: { label: '暂无评定', color: '#909399' },
  1: { label: '入门', color: '#bfbfbf' },
  2: { label: '普及−', color: '#52c41a' },
  3: { label: '普及/提高−', color: '#3498db' },
  4: { label: '普及+/提高', color: '#f39c12' },
  5: { label: '提高+/省选−', color: '#e74c3c' },
  6: { label: '省选/NOI−', color: '#9b59b6' },
  7: { label: 'NOI/NOI+/CTSC', color: '#262626' },
}

/**
 * 题目核心数据:拉取/归一化 lentille-context,派生难度色/通过率/渲染后的题面与提示。
 * 从 ProblemDetail 抽出。loadRealData 会把服务端/本地草稿写回 codeContent 与 selectedLang,
 * 故二者作为可写 ref 传入;loadLocalCode 来自 useCodePersistence。
 */
export function useProblemData(opts: {
  problemId: Ref<string>
  codeContent: Ref<string>
  selectedLang: Ref<LuoguLanguage>
  loadLocalCode: (pid: string) => { code: string, lang: number } | null
}) {
  const { problemId, codeContent, selectedLang, loadLocalCode } = opts

  const problem = ref<ProblemData>({
    pid: 'P1001',
    title: 'A+B Problem',
    difficulty: 1,
    difficultyLabel: '入门',
    timeLimit: '1.00s',
    memoryLimit: '125.00MB',
    tags: [],
    totalSubmit: 0,
    totalAccepted: 0,
    background: '',
    description: '加载中...',
    inputFormat: '',
    outputFormat: '',
    hint: '',
    source: '',
    samples: [],
    provider: null,
  })
  const loading = ref(true)
  const loadError = ref(false)
  const discussions = ref<Array<{ id: number, title: string, author: any, time: number, replyCount: number }>>([])

  // 洛谷标签 id→算法名 字典(题目数据常只给数字 id)。懒加载、同源拉取 _lfe/tags,会话内缓存。
  const tagMap = new Map<number, string>()
  let tagMapPromise: Promise<void> | null = null
  function ensureTagMap() {
    if (!tagMapPromise) {
      tagMapPromise = (async () => {
        try {
          const res = await fetch('https://www.luogu.com.cn/_lfe/tags', { credentials: 'same-origin' })
          const j = await res.json()
          for (const t of j?.tags || [])
            if (typeof t?.id === 'number' && typeof t.name === 'string')
              tagMap.set(t.id, t.name)
        }
        catch (e) { console.warn('[GuluGulu]', e) }
      })()
    }
    return tagMapPromise
  }

  let loadingPid: string | null = null // guard against concurrent loads
  async function loadRealData() {
    const pid = problemId.value
    if (loadingPid === pid)
      return // already loading this problem
    loadingPid = pid
    ensureTagMap() // 与题目数据并行预取标签字典
    try {
      let raw = extractProblemData()
      // If DOM data is stale (SPA navigation to a DIFFERENT problem), fetch via _contentOnly=1 API
      const extractedPid = raw?.data?.problem?.pid || raw?.currentData?.problem?.pid
      if ((!raw?.data?.problem && !raw?.currentData?.problem) || (extractedPid && extractedPid !== pid))
        raw = await fetchProblemData(pid)
      // Normalize: _contentOnly=1 uses currentData, HTML pages use data
      const rd: any = raw?.data || raw?.currentData || {}
      if (!rd.problem) {
        // Problem data couldn't be loaded (e.g. external-OJ pid Luogu doesn't
        // host, or not logged in). Show the error UI instead of silently leaving
        // the A+B (P1001) default problem object on screen.
        if (loadingPid === pid) {
          loadError.value = true
          loading.value = false
          loadingPid = null
        }
        return
      }

      const p = rd.problem
      const limits = p.limits || {}
      const timeMs = limits.time?.[0] || 1000
      const memKb = limits.memory?.[0] || 125000

      // Parse samples
      const samples: ProblemData['samples'] = []
      if (Array.isArray(rd.samples || p.samples)) {
        for (const s of (rd.samples || p.samples))
          samples.push({ input: s[0] || '', output: s[1] || '', explanation: s[2] || '' })
      }

      await ensureTagMap() // 标签字典就绪后再解析算法名
      problem.value = {
        pid: p.pid,
        title: p.name || p.title || '',
        difficulty: p.difficulty || 0,
        difficultyLabel: difficultyMap[p.difficulty || 0]?.label || '暂无评定',
        timeLimit: `${(timeMs / 1000).toFixed(2)}s`,
        memoryLimit: memKb >= 1024 ? `${(memKb / 1024).toFixed(0)}.00MB` : `${memKb}.00KB`,
        tags: Array.isArray(p.tags) ? p.tags.map((t: any) => (typeof t === 'number' ? { id: t, name: tagMap.get(t) || `标签 ${t}` } : t)) : [],
        totalSubmit: p.totalSubmit || 0,
        totalAccepted: p.totalAccepted || 0,
        background: p.contenu?.background || p.content?.background || '',
        description: [p.contenu?.description || p.content?.description || ''].join('\n\n'),
        inputFormat: p.contenu?.formatI || p.content?.formatI || '',
        outputFormat: p.contenu?.formatO || p.content?.formatO || '',
        hint: p.contenu?.hint || p.content?.hint || '',
        source: p.content?.source || '',
        samples,
        provider: p.provider || null,
      }

      // Extract discussions from the same lentille-context
      const discList = rd.discussions
      if (Array.isArray(discList)) {
        discussions.value = discList.map((d: any) => ({
          id: d.id || 0,
          title: d.title || '',
          author: d.author || {},
          time: d.time || 0,
          replyCount: d.replyCount || d.reply_count || 0,
        }))
      }

      // 代码恢复优先级:洛谷服务端草稿 → 本地草稿 → 空。不再填 A+B 模板:
      // 无关起始代码反而困惑,且本地草稿现已跨退出存活,编辑器不会重置。
      const savedCode: string = rd.lastCode || ''
      const savedLang: number | undefined = rd.lastLanguage
      const local = loadLocalCode(pid)
      codeContent.value = savedCode || local?.code || ''
      const restoreLang = savedLang || local?.lang
      if (restoreLang) {
        const found = LUOGU_LANGUAGES.find(l => l.id === restoreLang)
        if (found)
          selectedLang.value = found
      }

      if (loadingPid !== pid)
        return // stale result from SPA race
      document.title = `${problem.value.pid} ${problem.value.title} - GuluGulu`
      loading.value = false
      loadingPid = null
    }
    catch (e) {
      console.error('[GuluGulu] Failed to load problem data:', e)
      if (loadingPid === pid) { loadError.value = true; loading.value = false; loadingPid = null }
    }
  }

  const difficultyColor = computed(() => difficultyMap[problem.value.difficulty]?.color || '#909399')

  const passRate = computed(() => {
    if (problem.value.totalSubmit === 0)
      return 0
    return Math.round((problem.value.totalAccepted / problem.value.totalSubmit) * 100)
  })

  const renderedDescription = computed(() => {
    const parts: string[] = []
    if (problem.value.background)
      parts.push(problem.value.background)
    parts.push(problem.value.description)
    if (problem.value.inputFormat)
      parts.push(`## 输入格式\n\n${problem.value.inputFormat}`)
    if (problem.value.outputFormat)
      parts.push(`## 输出格式\n\n${problem.value.outputFormat}`)
    return parseProblemMarkdown(parts.join('\n\n'))
  })

  const renderedHint = computed(() => parseProblemMarkdown(problem.value.hint))

  return {
    problem, loading, loadError, discussions,
    difficultyColor, passRate, renderedDescription, renderedHint,
    loadRealData,
  }
}
