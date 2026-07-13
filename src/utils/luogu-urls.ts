export const LUOGU = 'https://www.luogu.com.cn'

export function openProblem(pid: string, inNewTab = true) {
  const url = `${LUOGU}/problem/${pid}`
  if (inNewTab)
    window.open(url, '_blank')
  else window.location.href = url
}

export function openUser(uid: number, inNewTab = true) {
  const url = `${LUOGU}/user/${uid}`
  if (inNewTab)
    window.open(url, '_blank')
  else window.location.href = url
}

export function openContest(id: number | string, inNewTab = true) {
  const url = `${LUOGU}/contest/${id}`
  if (inNewTab)
    window.open(url, '_blank')
  else window.location.href = url
}

export function openRecord(rid: number | string, inNewTab = true) {
  const url = `${LUOGU}/record/${rid}`
  if (inNewTab)
    window.open(url, '_blank')
  else window.location.href = url
}

export function openPost(id: number | string) {
  window.location.href = `${LUOGU}/discuss/${id}`
}

export function openBlog(id: number | string) {
  window.location.href = `${LUOGU}/blog/${id}`
}

export function goToDiscussList() {
  window.location.href = `${LUOGU}/discuss`
}

export function goToChat() {
  window.location.href = `${LUOGU}/chat`
}

export function goToHome() {
  window.location.href = LUOGU
}

export function goToRecordList() {
  window.location.href = `${LUOGU}/record/list`
}

export function goToTrainingList() {
  window.location.href = `${LUOGU}/training/list`
}

export function goToLogin() {
  window.location.href = `${LUOGU}/auth/login`
}
