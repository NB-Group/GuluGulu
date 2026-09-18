import { describe, expect, it } from 'vitest'

import { SseToolCallTracker } from './aiTools'

// OpenAI 分片拼接 / 双 index 并行;Anthropic tool_use 块序列;flush 排空语义。
describe('sseToolCallTracker (openai)', () => {
  const oai = (tc: any, finish?: string) =>
    ({ choices: [{ delta: { tool_calls: [tc] }, ...(finish ? { finish_reason: finish } : {}) }] })

  it('id+name 在首帧,arguments 分 3 帧拼接', () => {
    const t = new SseToolCallTracker('openai')
    t.feed(oai({ index: 0, id: 'call_1', function: { name: 'memory_write', arguments: '{"kind":"wea' } }))
    t.feed(oai({ index: 0, function: { arguments: 'k-point","text":"边界' } }))
    t.feed(oai({ index: 0, function: { arguments: '"}' } }))
    t.feed(oai({}, 'tool_calls'))
    const calls = t.flush()
    expect(calls).toEqual([{ id: 'call_1', name: 'memory_write', argsJson: '{"kind":"weak-point","text":"边界"}' }])
    expect(t.flush()).toEqual([]) // 排空语义
  })

  it('双 index 并行调用各自拼齐,按 index 顺序排出', () => {
    const t = new SseToolCallTracker('openai')
    t.feed(oai({ index: 0, id: 'a', function: { name: 'memory_read', arguments: '{}' } }))
    t.feed(oai({ index: 1, id: 'b', function: { name: 'memory_write', arguments: '{"k' } }))
    t.feed(oai({ index: 1, function: { arguments: 'ind":"fact"}' } }))
    const calls = t.flush()
    expect(calls.map(c => c.id)).toEqual(['a', 'b'])
    expect(calls[1].argsJson).toBe('{"kind":"fact"}')
  })

  it('finish_reason=tool_calls 空帧不炸(无 tool_calls 字段)', () => {
    const t = new SseToolCallTracker('openai')
    t.feed({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
    expect(t.flush()).toEqual([])
  })

  it('无 id 的槽位排出时兜底 id', () => {
    const t = new SseToolCallTracker('openai')
    t.feed(oai({ index: 0, function: { name: 'memory_read', arguments: '{}' } }))
    const calls = t.flush()
    expect(calls[0].id).toBe('call_0')
  })
})

describe('sseToolCallTracker (anthropic)', () => {
  it('start → input_json_delta ×2 → stop 完成一次调用', () => {
    const t = new SseToolCallTracker('anthropic')
    t.feed({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'memory_write' } })
    t.feed({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"kind":"fact",' } })
    t.feed({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"text":"x"}' } })
    t.feed({ type: 'content_block_stop', index: 1 })
    t.feed({ type: 'message_stop' })
    expect(t.flush()).toEqual([{ id: 'tu_1', name: 'memory_write', argsJson: '{"kind":"fact","text":"x"}' }])
  })

  it('thinking/text 块不武装 tracker', () => {
    const t = new SseToolCallTracker('anthropic')
    t.feed({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } })
    t.feed({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '嗯' } })
    t.feed({ type: 'content_block_stop', index: 0 })
    t.feed({ type: 'content_block_start', index: 1, content_block: { type: 'text' } })
    t.feed({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'hi' } })
    t.feed({ type: 'content_block_stop', index: 1 })
    t.feed({ type: 'message_stop' })
    expect(t.flush()).toEqual([])
  })

  it('并行 tool_use 块按块下标区分', () => {
    const t = new SseToolCallTracker('anthropic')
    t.feed({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'u0', name: 'memory_read' } })
    t.feed({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'u1', name: 'memory_write' } })
    t.feed({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } })
    t.feed({ type: 'content_block_stop', index: 0 })
    t.feed({ type: 'content_block_stop', index: 1 })
    t.feed({ type: 'message_stop' })
    const calls = t.flush()
    expect(calls.map(c => c.id)).toEqual(['u0', 'u1'])
    expect(calls[0].argsJson).toBe('')
    expect(calls[1].argsJson).toBe('{}')
  })
})
