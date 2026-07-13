/**
 * Luogu difficulty & CCF level colors — follow official Luogu color scheme exactly.
 * Reference: https://www.luogu.com.cn/problem/list
 */
export const DIFFICULTY_LABEL: Record<number, string> = {
  0: '暂无评定',
  1: '入门',
  2: '普及−',
  3: '普及/提高−',
  4: '普及+/提高',
  5: '提高+/省选−',
  6: '省选/NOI−',
  7: 'NOI',
  8: 'NOI+',
}

export const DIFFICULTY_COLOR: Record<number, string> = {
  0: '#909399',
  1: '#FE4D61',
  2: '#F39B18',
  3: '#FFBF1C',
  4: '#54C320',
  5: '#1AC1C1',
  6: '#3797DA',
  7: '#9A3FCE',
  8: '#162369',
}
// CCF level — Luogu displays as "X 级" (not problem difficulty labels)
export function ccfLabel(lv: number): string {
  if (!lv || lv <= 0)
    return '暂无'
  return `${lv} 级`
}
// CCF level color follows the user's name color on Luogu, not problem difficulty colors
const CCF_COLORS: Record<number, string> = {
  0: '#909399',
  1: '#bfbfbf',
  2: '#bfbfbf',
  3: '#52c41a',
  4: '#52c41a',
  5: '#52c41a',
  6: '#3498db',
  7: '#3498db',
  8: '#f39c12',
  9: '#f39c12',
  10: '#f39c12',
}
export function ccfColor(lv: number): string {
  return CCF_COLORS[lv] || '#909399'
}
export function diffLabel(d: number): string {
  return DIFFICULTY_LABEL[d] || '暂无评定'
}
export function diffColor(d: number): string {
  return DIFFICULTY_COLOR[d] || '#909399'
}
