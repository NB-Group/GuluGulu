// Luogu specific user info and types
export interface UserInfo {
  uid: number
  name: string
  avatar: string
  slogan: string
  ranking: number
  color: string
  ccfLevel: number
}

export interface NotificationItem {
  id: number
  type: string
  content: string
  time: number
  read: boolean
}
