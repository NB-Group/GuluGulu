/**
 * Luogu difficulty & CCF level colors — follow official Luogu color scheme exactly.
 * Reference: https://www.luogu.com.cn/problem/list
 */
export const DIFFICULTY_LABEL: Record<number, string> = {
  0: '暂无评定', 1: '入门', 2: '普及−', 3: '普及/提高−',
  4: '普及+/提高', 5: '提高+/省选−', 6: '省选/NOI−', 7: 'NOI', 8: 'NOI+',
}
export const DIFFICULTY_COLOR: Record<number, string> = {
  0: '#909399', 1: '#bfbfbf', 2: '#52c41a', 3: '#3498db',
  4: '#f39c12', 5: '#e74c3c', 6: '#9b59b6', 7: '#262626', 8: '#262626',
}
// CCF level uses same labels/colors as problem difficulty
export function ccfLabel(lv: number): string {
  return DIFFICULTY_LABEL[lv] || '暂无评定'
}
export function ccfColor(lv: number): string {
  return DIFFICULTY_COLOR[lv] || '#909399'
}
export function diffLabel(d: number): string {
  return DIFFICULTY_LABEL[d] || '暂无评定'
}
export function diffColor(d: number): string {
  return DIFFICULTY_COLOR[d] || '#909399'
}
