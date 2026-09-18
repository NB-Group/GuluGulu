/**
 * 导师长期记忆(跨题的学生画像,Claude Code 式「模型自己维护」)。
 *
 * 存储:localStorage 单 JSON 数组,key `gulu:tutor-memory`(与 gulu:code:{pid} 并排,
 * 按浏览器 profile 隔离,不按 uid 分——本扩展其他 store 也是 per-browser)。
 * 写入方:① 模型在授课流中调 memory_write 工具(aiTutor.ts dispatch);
 *        ② 确定性事件(AC 进度,useProblemSubmit 落)。
 * 读取方:每轮授课注入 system prompt 的【学生档案】段(renderMemorySection)。
 *
 * 核心逻辑 upsertMemoryEntry 是纯函数(不碰 localStorage),单测直接测它。
 */
export type MemoryKind = 'weak-point' | 'style' | 'progress' | 'fact'

export interface MemoryEntry { id: string, kind: MemoryKind, text: string, ts: number, pid?: string }

const KEY = 'gulu:tutor-memory'
const CAP = 50

const KIND_LABELS: Record<MemoryKind, string> = {
  'weak-point': '易错点',
  'style': '偏好',
  'progress': '进度',
  'fact': '其它',
}

/**
 * 纯函数:插入或刷新一条记忆。
 * - 去重:同 kind+text 已存在 → 只刷新 ts(模型重试/重复调用幂等);
 * - 上限:超过 cap 淘汰最旧(ts 最小)的一条。
 */
export function upsertMemoryEntry(
  list: MemoryEntry[],
  entry: { kind: MemoryKind, text: string, pid?: string },
  cap = CAP,
  now = Date.now(),
): MemoryEntry[] {
  const idx = list.findIndex(e => e.kind === entry.kind && e.text === entry.text)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = { ...next[idx], ts: now, pid: entry.pid || next[idx].pid }
    return next
  }
  const appended = [...list, {
    id: `m_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: entry.kind,
    text: entry.text,
    ts: now,
    ...(entry.pid ? { pid: entry.pid } : {}),
  }]
  if (appended.length > cap) {
    let oldest = 0
    for (let i = 1; i < appended.length; i++) {
      if (appended[i].ts < appended[oldest].ts)
        oldest = i
    }
    appended.splice(oldest, 1)
  }
  return appended
}

export function loadTutorMemory(): MemoryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return Array.isArray(v) ? v.filter(e => e && typeof e.text === 'string') : []
  }
  catch { return [] }
}

export function addTutorMemory(kind: MemoryKind, text: string, pid?: string): MemoryEntry[] {
  const next = upsertMemoryEntry(loadTutorMemory(), { kind, text: text.trim().slice(0, 120), pid })
  try { localStorage.setItem(KEY, JSON.stringify(next)) }
  catch { /* ignore */ }
  return next
}

export function removeTutorMemory(id: string): MemoryEntry[] {
  const next = loadTutorMemory().filter(e => e.id !== id)
  try { localStorage.setItem(KEY, JSON.stringify(next)) }
  catch { /* ignore */ }
  return next
}

export function clearTutorMemory() {
  try { localStorage.removeItem(KEY) }
  catch { /* ignore */ }
}

/**
 * system prompt 注入用的【学生档案】段:按 kind 分组,组内新→旧;
 * 总长超 maxChars 截断(保头部,末尾标「…更早的略」)。空列表 → '(暂无)'。
 */
export function renderMemorySection(entries: MemoryEntry[], maxChars = 2000): string {
  if (!entries.length)
    return '(暂无)'
  const sorted = [...entries].sort((a, b) => b.ts - a.ts)
  const lines: string[] = []
  for (const kind of Object.keys(KIND_LABELS) as MemoryKind[]) {
    const group = sorted.filter(e => e.kind === kind)
    if (!group.length)
      continue
    lines.push(`[${KIND_LABELS[kind]}]`)
    for (const e of group) {
      const d = new Date(e.ts)
      const meta: string[] = []
      if (e.pid)
        meta.push(e.pid)
      meta.push(`${d.getMonth() + 1}月${d.getDate()}日`)
      lines.push(`- ${e.text}(${meta.join(', ')})`)
    }
  }
  let out = lines.join('\n')
  if (out.length > maxChars)
    out = `${out.slice(0, maxChars)}\n…(更早的略)`
  return out
}
