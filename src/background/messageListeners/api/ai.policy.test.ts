import { describe, expect, it } from 'vitest'

import { enforceAiPolicy } from './ai.policy'

describe('enforceAiPolicy', () => {
  it('blocks everything when isContest', () => {
    for (const msg of [
      { mode: 'fim', intensity: 'light', isContest: true },
      { mode: 'chat', intensity: 'guide', isContest: true },
      { mode: 'chat', intensity: 'ce', isContest: true },
      { mode: 'fim', intensity: 'step', isContest: true, trigger: 'comment' },
    ]) {
      const r = enforceAiPolicy(msg)
      expect(r.allowed).toBe(false)
      if (!r.allowed)
        expect(r.reason).toBe('contest')
    }
  })

  it('clamps fim light to single line', () => {
    const r = enforceAiPolicy({ mode: 'fim', intensity: 'light', maxTokens: 999 })
    expect(r.allowed).toBe(true)
    if (r.allowed) {
      expect(r.maxTokens).toBe(64)
      expect(r.stop).toEqual(['\n'])
      expect(r.mode).toBe('fim')
    }
  })

  it('blocks fim strong (no full code)', () => {
    const r = enforceAiPolicy({ mode: 'fim', intensity: 'strong' })
    expect(r.allowed).toBe(false)
    if (!r.allowed)
      expect(r.reason).toBe('no-full-code')
  })

  it('blocks chat strong (no full code)', () => {
    const r = enforceAiPolicy({ mode: 'chat', intensity: 'strong' })
    expect(r.allowed).toBe(false)
    if (!r.allowed)
      expect(r.reason).toBe('no-full-code')
  })

  it('allows fim step only with trigger=comment, caps length', () => {
    const noTrig = enforceAiPolicy({ mode: 'fim', intensity: 'step' })
    expect(noTrig.allowed).toBe(false)
    if (!noTrig.allowed)
      expect(noTrig.reason).toBe('need-comment')

    const ok = enforceAiPolicy({ mode: 'fim', intensity: 'step', trigger: 'comment' })
    expect(ok.allowed).toBe(true)
    if (ok.allowed) {
      expect(ok.maxTokens).toBe(160)
      expect(ok.stop).toEqual(['\n\n', '\n//', '\n#'])
    }
  })

  it('allows chat guide / ce', () => {
    const g = enforceAiPolicy({ mode: 'chat', intensity: 'guide', maxTokens: 512 })
    expect(g.allowed).toBe(true)
    const c = enforceAiPolicy({ mode: 'chat', intensity: 'ce', maxTokens: 384 })
    expect(c.allowed).toBe(true)
  })

  it('rejects unknown mode/intensity', () => {
    expect(enforceAiPolicy({ mode: 'chat', intensity: '???' }).allowed).toBe(false)
    expect(enforceAiPolicy({ mode: 'weird', intensity: 'light' }).allowed).toBe(false)
  })
})
