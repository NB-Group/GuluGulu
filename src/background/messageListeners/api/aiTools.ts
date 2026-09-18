/**
 * 流式 tool_calls 解析(协议 v3)。
 *
 * ⚠️ 本模块不得 import webextension-polyfill —— vitest 是 node 环境,
 * aiSse.test.ts 因 import ./ai → polyfill 而 import 即炸是既有问题,
 * 新测试文件要能独立跑绿就必须保持本文件零浏览器依赖。
 *
 * 两种流格式都归一为 CompletedToolCall(原始参数字符串 argsJson,可能被截断):
 *  - OpenAI: choices[0].delta.tool_calls[] 按 index 槽位,function.arguments 是
 *    字符串分片,逐帧拼接;finish_reason==='tool_calls' 只是就绪信号,flush 仍在流末。
 *  - Anthropic: content_block_start{type:'tool_use'} 武装槽位(index=块下标),
 *    content_block_delta{type:'input_json_delta'} 拼 partial_json,
 *    content_block_stop 完成。text/thinking 块不武装。
 */
export interface CompletedToolCall { id: string, name: string, argsJson: string }

interface Slot { id: string, name: string, argsJson: string, done: boolean }

export class SseToolCallTracker {
  private slots = new Map<number, Slot>()
  private order: number[] = []

  constructor(private apiFormat: string) {}

  /** 每条 SSE data JSON 喂一次(与 sseJsonToPortMessage 并行调用,不替代它)。 */
  feed(j: any) {
    if (this.apiFormat === 'anthropic') {
      const t = j?.type
      if (t === 'content_block_start' && j?.content_block?.type === 'tool_use') {
        const idx = Number(j.index) || 0
        this.slots.set(idx, { id: String(j.content_block.id || `tu_${idx}`), name: String(j.content_block.name || ''), argsJson: '', done: false })
        this.order.push(idx)
      }
      else if (t === 'content_block_delta' && j?.delta?.type === 'input_json_delta') {
        const idx = Number(j.index) || 0
        this.slots.get(idx)!.argsJson += String(j.delta.partial_json || '')
      }
      else if (t === 'content_block_stop') {
        const idx = Number(j.index)
        const s = this.slots.get(idx)
        if (s)
          s.done = true
      }
      return
    }
    // OpenAI 兼容
    const tcs = j?.choices?.[0]?.delta?.tool_calls
    if (!Array.isArray(tcs))
      return
    for (const tc of tcs) {
      const idx = Number(tc?.index) || 0
      let s = this.slots.get(idx)
      if (!s) {
        s = { id: '', name: '', argsJson: '', done: false }
        this.slots.set(idx, s)
        this.order.push(idx)
      }
      if (tc?.id)
        s.id = String(tc.id)
      if (tc?.function?.name)
        s.name = String(tc.function.name)
      if (typeof tc?.function?.arguments === 'string')
        s.argsJson += tc.function.arguments
    }
  }

  /**
   * 流结束([DONE]/message_stop/body 结束)时取走已完成的调用。
   * 语义 = 排空:OpenAI 未等到显式结束信号的槽位也一并排出(带已拼到的分片),
   * 二次 flush 返回空。
   */
  flush(): CompletedToolCall[] {
    const out: CompletedToolCall[] = []
    for (const idx of this.order) {
      const s = this.slots.get(idx)
      if (s && s.name)
        out.push({ id: s.id || `call_${idx}`, name: s.name, argsJson: s.argsJson })
    }
    this.slots.clear()
    this.order = []
    return out
  }
}
