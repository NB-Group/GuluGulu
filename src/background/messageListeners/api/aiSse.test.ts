import { describe, expect, it } from 'vitest'
import { sseJsonToPortMessage } from './ai'

// 用真实中转返回的 Anthropic SSE 帧(2026-08-25 用户抓包)验证归一化:
// message_start/ping/content_block_start 忽略;text_delta → chunk;thinking_delta → reasoning;
// message_stop → done;error 事件 → error。OpenAI 侧回归:choices[0].delta.content / [DONE]。
describe('sseJsonToPortMessage (anthropic)', () => {
  const f = (j: any) => sseJsonToPortMessage(j, false, 'anthropic')

  it('message_start 忽略', () => {
    const j = JSON.parse('{"type": "message_start", "message": {"id": "msg_x", "content": []}}')
    expect(f(j)).toBeNull()
  })
  it('ping 忽略', () => {
    expect(f({ type: 'ping' })).toBeNull()
  })
  it('content_block_start 忽略', () => {
    expect(f({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })).toBeNull()
  })
  it('text_delta → chunk(真实帧:"#")', () => {
    const j = JSON.parse('{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "#"}}')
    expect(f(j)).toEqual({ chunk: '#' })
  })
  it('thinking_delta → reasoning', () => {
    expect(f({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '嗯' } })).toEqual({ reasoning: '嗯' })
  })
  it('message_stop → done', () => {
    expect(f({ type: 'message_stop' })).toEqual({ done: true })
  })
  it('error 事件 → error 文本', () => {
    expect(f({ type: 'error', error: { message: 'overloaded' } })).toEqual({ error: 'overloaded' })
  })
})

describe('sseJsonToPortMessage (openai 回归)', () => {
  it('chat delta.content → chunk', () => {
    expect(sseJsonToPortMessage({ choices: [{ delta: { content: 'he' } }] }, false, 'openai')).toEqual({ chunk: 'he' })
  })
  it('fim choices[0].text → chunk', () => {
    expect(sseJsonToPortMessage({ choices: [{ text: 'llo' }] }, true, 'openai')).toEqual({ chunk: 'llo' })
  })
  it('reasoning_content → reasoning', () => {
    expect(sseJsonToPortMessage({ choices: [{ delta: { reasoning_content: '想' } }] }, false, 'openai')).toEqual({ reasoning: '想' })
  })
  it('无有效字段 → null', () => {
    expect(sseJsonToPortMessage({ choices: [{ delta: {} }] }, false, 'openai')).toBeNull()
  })
})
