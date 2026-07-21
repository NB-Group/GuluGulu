import { describe, expect, it } from 'vitest'
import { derivedRecordStatus, summarizeVerdict } from './luogu-api'

// 合成 record 形状(对齐 pollRecordVerdict 读的 data.record.detail.* —— 盖章那条路证明此形状真实)
function mkRecord(opts: { status?: number, compileResult?: any, cases?: number[] }) {
  const { status = 2, compileResult, cases = [] } = opts
  const sub = cases.length
    ? [{ id: 0, score: 0, fullScore: 100, status: cases.every(c => c === 12) ? 12 : 0, testCases: cases.map((st, i) => ({ id: i, status: st, time: 10, memory: 1024 })) }]
    : undefined
  return {
    id: 1,
    status,
    score: status === 12 ? 100 : 0,
    time: 10,
    memory: 1024,
    detail: {
      compileResult,
      judgeResult: sub ? { finishedCaseCount: cases.length, subtasks: sub } : undefined,
    },
  }
}

describe('derivedRecordStatus', () => {
  it('CE: compileResult.success=false → 10', () => {
    expect(derivedRecordStatus(mkRecord({ compileResult: { success: false, message: 'err' } }))).toBe(10)
  })
  it('CE: compileResult 有 message 无 judge(success 缺失)→ 10', () => {
    expect(derivedRecordStatus(mkRecord({ compileResult: { message: 'err' } }))).toBe(10)
  })
  it('AC: 全部 case status=12 → 12', () => {
    expect(derivedRecordStatus(mkRecord({ status: 2, cases: [12, 12, 12] }))).toBe(12)
  })
  it('WA: 首个失败 case status=5 → 5', () => {
    expect(derivedRecordStatus(mkRecord({ cases: [12, 5, 12] }))).toBe(5)
  })
  it('TLE: case status=7 → 7', () => {
    expect(derivedRecordStatus(mkRecord({ cases: [12, 7] }))).toBe(7)
  })
  it('MLE: case status=8 → 8', () => {
    expect(derivedRecordStatus(mkRecord({ cases: [8] }))).toBe(8)
  })
  it('RE: case status=9 → 9', () => {
    expect(derivedRecordStatus(mkRecord({ cases: [9] }))).toBe(9)
  })
  it('pending: 有 case status=0 → undefined(继续轮询)', () => {
    expect(derivedRecordStatus(mkRecord({ cases: [12, 0] }))).toBeUndefined()
  })
  it('无 detail → undefined', () => {
    expect(derivedRecordStatus({ status: 2 })).toBeUndefined()
  })
})

describe('summarizeVerdict', () => {
  const S = (r: any) => summarizeVerdict(1, r, 0, undefined, undefined).verdict
  it('CE', () => {
    expect(S(mkRecord({ compileResult: { success: false, message: 'err' } }))).toBe('CE')
  })
  it('AC', () => {
    expect(S(mkRecord({ cases: [12, 12] }))).toBe('AC')
  })
  it('TLE(无 limit,从 case status 推)', () => {
    expect(S(mkRecord({ cases: [7] }))).toBe('TLE')
  })
  it('MLE(无 limit,从 case status 推)', () => {
    expect(S(mkRecord({ cases: [8] }))).toBe('MLE')
  })
  it('RE(从 case status 推)', () => {
    expect(S(mkRecord({ cases: [9] }))).toBe('RE')
  })
  it('WA(默认)', () => {
    expect(S(mkRecord({ cases: [5] }))).toBe('WA')
  })
})
