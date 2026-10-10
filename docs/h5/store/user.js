import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    userId: '',
    userName: '',
    token: '',
    role: '',
    loggedIn: false
  }),
  actions: {
    setSession(session) {
      this.userId = session.userId
      this.userName = session.userName
      this.token = session.token
      this.role = session.role
      this.loggedIn = true

      // 持久化到本地存储
      uni.setStorageSync('userSession', {
        userId: this.userId,
        userName: this.userName,
        token: this.token,
        role: this.role,
        loggedIn: this.loggedIn
      })
    },
    clear() {
      this.userId = ''
      this.userName = ''
      this.token = ''
      this.role = ''
      this.loggedIn = false

      // 清除本地存储
      uni.removeStorageSync('userSession')
    },
    // 从本地存储恢复会话
    restoreSession() {
      try {
        const session = uni.getStorageSync('userSession')
        if (session && session.loggedIn) {
          this.userId = session.userId
          this.userName = session.userName
          this.token = session.token
          this.role = session.role
          this.loggedIn = session.loggedIn
          return true
        }
      } catch (error) {
        console.error('恢复会话失败:', error)
      }
      return false
    }
  }
})
