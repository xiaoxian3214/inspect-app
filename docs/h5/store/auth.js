/**
 * 认证状态管理
 */
import { defineStore } from 'pinia'
import { login as loginApi, dingtalkLogin as dingtalkLoginApi, logout as logoutApi, getCurrentUser } from '../api/auth.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 用户信息
    user: null,
    // 访问令牌
    accessToken: null,
    // 刷新令牌
    refreshToken: null,
    // 是否已登录
    isLoggedIn: false
  }),

  getters: {
    // 获取用户名
    username: (state) => state.user?.realName || state.user?.userName || state.user?.username || '',
    // 获取用户真实姓名
    realName: (state) => state.user?.realName || state.user?.userName || state.user?.username || '',
    // 获取用户角色
    roles: (state) => state.user?.roles || [],
    // 获取用户权限
    permissions: (state) => state.user?.permissions || []
  },

  actions: {
    applyAuthResponse(response) {
      const normalizedUserName = response.userName || response.username || ''
      const accessToken = response.accessToken || response.token || ''

      // 保存用户信息
      this.user = {
        userId: response.userId || response.employeeNo || '',
        userName: normalizedUserName,
        username: normalizedUserName,
        realName: response.realName || normalizedUserName,
        employeeNo: response.employeeNo,
        roles: response.roles || [],
        permissions: response.permissions || [],
        department: response.department,
        email: response.email,
        phone: response.phone,
        userType: response.userType
      }

      // 保存 token
      this.accessToken = accessToken
      this.refreshToken = response.refreshToken
      this.isLoggedIn = true

      // 持久化到 localStorage
      localStorage.setItem('access_token', accessToken)
      localStorage.setItem('refresh_token', response.refreshToken || '')
      localStorage.setItem('user_info', JSON.stringify(this.user))
    },

    /**
     * 登录
     */
    async login(loginData) {
      try {
        const response = await loginApi(loginData)
        this.applyAuthResponse(response)
        return response

      } catch (error) {
        this.logout()
        throw error
      }
    },

    /**
     * 钉钉免登录
     */
    async dingtalkLogin(authCode) {
      try {
        const response = await dingtalkLoginApi(authCode)
        this.applyAuthResponse(response)
        return response
      } catch (error) {
        this.logout()
        throw error
      }
    },

    /**
     * 登出
     */
    async logout() {
      try {
        await logoutApi()
      } catch (error) {
        console.error('Logout error:', error)
      } finally {
        // 清除状态
        this.user = null
        this.accessToken = null
        this.refreshToken = null
        this.isLoggedIn = false

        // 清除 localStorage
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_info')
      }
    },

    /**
     * 从本地存储恢复登录状态
     */
    restoreSession() {
      const token = localStorage.getItem('access_token')
      const userInfo = localStorage.getItem('user_info')

      if (token && userInfo) {
        try {
          const restoredUser = JSON.parse(userInfo)
          if (restoredUser && !restoredUser.username && restoredUser.userName) {
            restoredUser.username = restoredUser.userName
          }
          if (restoredUser && !restoredUser.userName && restoredUser.username) {
            restoredUser.userName = restoredUser.username
          }
          if (restoredUser && !restoredUser.realName) {
            restoredUser.realName = restoredUser.userName || restoredUser.username || ''
          }
          this.accessToken = token
          this.refreshToken = localStorage.getItem('refresh_token') || null
          this.user = restoredUser
          this.isLoggedIn = true
          return true
        } catch (error) {
          console.error('Failed to restore session:', error)
          this.logout()
          return false
        }
      }

      return false
    },

    /**
     * 检查是否有特定权限
     */
    hasPermission(permission) {
      return this.permissions.includes(permission)
    },

    /**
     * 检查是否有特定角色
     */
    hasRole(role) {
      return this.roles.includes(role)
    }
  }
})
