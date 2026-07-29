/**
 * 「已浏览题目」追踪 —— 单例 composable。
 *
 * 数据源(取并集,任意一个即视为「看过」):
 *  - `gulu:viewed`:JSON `{ pid: ts }`,ProblemDetail 挂载时写入(纯浏览即记录)
 *  - `gulu:code:*`:有本地代码草稿的题(useCodePersistence 写),必然看过
 *
 * 模块级单例:所有调用方共享同一个响应式 Set;任一处 markViewed → 全部消费者刷新。
 * 题单/题库列表用它给「看过的题」加背景色(受 settings.highlightViewedProblems 控制)。
 */
import emitter from '~/utils/mitt'

const KEY = 'gulu:viewed'
const CODE_PREFIX = 'gulu:code:'

const viewed = ref<Set<string>>(new Set())
let inited = false

function readAll(): Set<string> {
  const s = new Set<string>()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object')
        for (const k of Object.keys(obj)) s.add(k)
    }
  }
  catch { /* ignore */ }
  // 有代码草稿的题也算看过
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CODE_PREFIX))
        s.add(k.slice(CODE_PREFIX.length))
    }
  }
  catch { /* ignore */ }
  return s
}

function refresh() {
  viewed.value = readAll()
}

function init() {
  if (inited)
    return
  inited = true
  refresh()
  emitter.on('viewed:changed', refresh)
  // 跨标签页/同页其它实例写入 → storage 事件
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null)
      refresh()
  })
}

/** 在题单/题库列表里使用:返回响应式 viewed Set + isViewed 判定。 */
export function useViewedProblems() {
  init()
  return {
    viewed,
    isViewed: (pid: string) => viewed.value.has(pid),
  }
}

/** 标记某 pid 已浏览(ProblemDetail 挂载时调用)。幂等:已记录则不重写。 */
export function markViewed(pid: string) {
  if (!pid)
    return
  init()
  try {
    const raw = localStorage.getItem(KEY)
    const obj = raw ? (JSON.parse(raw) || {}) : {}
    if (obj[pid])
      return // 已记录,跳过
    obj[pid] = Date.now()
    localStorage.setItem(KEY, JSON.stringify(obj))
  }
  catch { /* ignore */ }
  refresh()
  emitter.emit('viewed:changed')
}
