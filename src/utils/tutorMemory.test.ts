import { describe, expect, it } from 'vitest'

import { renderMemorySection, upsertMemoryEntry } from './tutorMemory'

// 纯函数单测(不碰 localStorage):去重幂等 / cap 淘汰最旧 / 渲染分组与截断。
describe('upsertMemoryEntry', () => {
  it('新条目获得 id/ts 并追加', () => {
    const list = upsertMemoryEntry([], { kind: 'weak-point', text: '总搞混边界' }, 50, 1000)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'weak-point', text: '总搞混边界', ts: 1000 })
    expect(list[0].id).toBeTruthy()
  })

  it('同 kind+text 去重:只刷新 ts 不重复', () => {
    let list = upsertMemoryEntry([], { kind: 'style', text: '喜欢被反问' }, 50, 1000)
    list = upsertMemoryEntry(list, { kind: 'style', text: '喜欢被反问' }, 50, 2000)
    expect(list).toHaveLength(1)
    expect(list[0].ts).toBe(2000)
  })

  it('同 text 不同 kind 不算重复', () => {
    let list = upsertMemoryEntry([], { kind: 'style', text: 'DP' }, 50, 1000)
    list = upsertMemoryEntry(list, { kind: 'weak-point', text: 'DP' }, 50, 2000)
    expect(list).toHaveLength(2)
  })

  it('超 cap 淘汰 ts 最旧的一条', () => {
    let list: ReturnType<typeof upsertMemoryEntry> = []
    for (let i = 0; i < 5; i++)
      list = upsertMemoryEntry(list, { kind: 'fact', text: `记忆${i}` }, 5, 1000 + i)
    expect(list).toHaveLength(5)
    list = upsertMemoryEntry(list, { kind: 'fact', text: '新记忆' }, 5, 9999)
    expect(list).toHaveLength(5)
    expect(list.find(e => e.text === '记忆0')).toBeUndefined() // 最旧的被淘汰
    expect(list.find(e => e.text === '新记忆')).toBeDefined()
  })

  it('去重路径不受 cap 影响(不误淘汰)', () => {
    let list: ReturnType<typeof upsertMemoryEntry> = []
    for (let i = 0; i < 5; i++)
      list = upsertMemoryEntry(list, { kind: 'fact', text: `记忆${i}` }, 5, 1000 + i)
    const before = list.length
    list = upsertMemoryEntry(list, { kind: 'fact', text: '记忆0' }, 5, 9999)
    expect(list).toHaveLength(before)
  })
})

describe('renderMemorySection', () => {
  it('空列表 → (暂无)', () => {
    expect(renderMemorySection([])).toBe('(暂无)')
  })

  it('按 kind 分组,组内新→旧', () => {
    const out = renderMemorySection([
      { id: 'a', kind: 'fact', text: '旧事实', ts: 1000 },
      { id: 'b', kind: 'weak-point', text: '边界', ts: 2000 },
      { id: 'c', kind: 'fact', text: '新事实', ts: 3000 },
    ])
    const weakIdx = out.indexOf('[易错点]')
    const factIdx = out.indexOf('[其它]')
    expect(weakIdx).toBeGreaterThanOrEqual(0)
    expect(factIdx).toBeGreaterThan(weakIdx)
    expect(out.indexOf('新事实')).toBeLessThan(out.indexOf('旧事实'))
  })

  it('超长截断并标注', () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      ({ id: `e${i}`, kind: 'fact' as const, text: `x`.repeat(40), ts: i }))
    const out = renderMemorySection(entries, 500)
    expect(out.length).toBeLessThanOrEqual(520)
    expect(out).toContain('更早的略')
  })

  it('带 pid 的条目渲染出题号', () => {
    const out = renderMemorySection([{ id: 'a', kind: 'progress', text: '已 AC', ts: 0, pid: 'P1001' }])
    expect(out).toContain('P1001')
  })
})
