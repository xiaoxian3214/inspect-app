/**
 * 邀请相关 API
 */
import { post } from './request.js'

/**
 * 生成供应商注册链接
 * @returns {Promise<object>}
 */
export async function generateVendorInviteLink() {
  const response = await post('/api/invite/generate', {})

  if (response.success && response.data) {
    return response.data
  }

  throw new Error(response.message || '生成邀请链接失败')
}
