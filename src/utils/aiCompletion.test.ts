import { describe, it, expect, vi } from 'vitest'

// aiCompletion.ts 顶部 import webextension-polyfill,其在 jsdom 无 chrome 全局时会抛。
// 这里 mock 掉(vitest 会把 vi.mock 提升到 import 之前);stripCodeBlocks 本身是纯函数。
vi.mock('webextension-polyfill', () => ({ default: {} }))

import { stripCodeBlocks } from './aiCompletion'

describe('stripCodeBlocks', () => {
  it('removes fenced code blocks, keeps prose', () => {
    const s = '编译错误在第 3 行:\n```cpp\nint a = ;\n```\n少了一个表达式。'
    expect(stripCodeBlocks(s)).toBe('编译错误在第 3 行:\n少了一个表达式。')
  })
  it('removes inline code', () => {
    expect(stripCodeBlocks('用 `sort(a, a+n)` 排序')).toBe('用 排序')
  })
  it('keeps plain text untouched', () => {
    expect(stripCodeBlocks('这一步用双指针,右指针右移即可。')).toBe('这一步用双指针,右指针右移即可。')
  })
})
