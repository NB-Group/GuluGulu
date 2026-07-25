/**
 * 题目难度配色 —— 以题库页面(views/ProblemList/ProblemList.vue)为唯一标准。
 * 注意:这是「题目难度」标签,不是咕值/用户名颜色/CCF 等级(后者各自独立,见 ccf*)。
 * Reference: https://www.luogu.com.cn/problem/list
 */
export const DIFFICULTY_LABEL: Record<number, string> = {
  0: '暂无评定',
  1: '入门',
  2: '普及−',
  3: '普及',
  4: '普及+/提高-',
  5: '提高',
  6: '提高+/省选−',
  7: '省选/NOI−',
  8: 'NOI/NOI+/CTS',
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
  if (!lv || lv <= 0) return '暂无'
  return `${lv} 级`
}
// CCF level color follows the user's name color on Luogu, not problem difficulty colors
const CCF_COLORS: Record<number, string> = {
  0: '#909399', 1: '#bfbfbf', 2: '#52c41a', 3: '#52c41a',
  4: '#3498db', 5: '#3498db', 6: '#f39c12', 7: '#e74c3c', 8: '#262626',
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
/** 把 hex 颜色 + alpha(0-1)拼成 8 位 hex(diffColor 返回的是 #RRGGBB) */
export function diffColorAlpha(d: number, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  const hh = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()
  return `${diffColor(d)}${hh}`
}
