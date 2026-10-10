import { openDatabase } from '../db/sqlite'
import { refreshTokenIfOnline } from '../services/authService'
import { syncPendingReports } from '../services/syncService'
import { cleanupDraftReports } from '../services/cleanupService'
import { getLastUserSession } from '../db/dao/userDao'

function currentRoute() {
  const pages = getCurrentPages()
  if (!pages?.length) return ''
  return `/${pages[0].route}`
}

async function ensureEntryRoute() {
  const route = currentRoute()
  if (!route) {
    setTimeout(() => {
      ensureEntryRoute()
    }, 50)
    return
  }
  const session = await getLastUserSession().catch(() => null)
  const hasSession = !!(session && session.token)
  if (hasSession && route !== '/pages/report/list') {
    uni.reLaunch({ url: '/pages/report/list' })
    return
  }
  if (!hasSession && route !== '/pages/login/login') {
    uni.reLaunch({ url: '/pages/login/login' })
  }
}

export async function initApp() {
  await openDatabase()
  await refreshTokenIfOnline()
  await cleanupDraftReports()
  await ensureEntryRoute()

  uni.onNetworkStatusChange(async (res) => {
    if (res.isConnected) {
      await refreshTokenIfOnline()
      await syncPendingReports()
    }
  })
}
