<script>
import { useAuthStore } from './store/auth.js'
import { useUserStore } from './store/user.js'

function installAlertToastBridge() {
  if (typeof globalThis === 'undefined') return

  const showToast = (message = '') => {
    const text = String(message ?? '')
    if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
      uni.showToast({
        title: text,
        icon: 'none',
        duration: 2200
      })
      return
    }

    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('[alert]', text)
    }
  }

  globalThis.showToast = showToast
  globalThis.alert = showToast
}

function disableSwipeBack() {
  if (typeof document === 'undefined') return
  const EDGE = 30
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    if (!t) return
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) {
      e.preventDefault()
    }
  }, { passive: false })

  const isAppPlus = typeof plus !== 'undefined'
  if (isAppPlus && typeof history !== 'undefined' && history.pushState) {
    history.pushState(null, '', location.href)
    window.addEventListener('popstate', () => {
      history.pushState(null, '', location.href)
    })
  }
}

export default {
  name: 'App',
  onLaunch() {
    installAlertToastBridge()
    disableSwipeBack()

    const authStore = useAuthStore()
    authStore.restoreSession()

    const userStore = useUserStore()
    userStore.restoreSession()
  }
}
</script>

<style>
page {
  background: #f5f7fa;
  font-size: 28rpx;
  color: #222;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overscroll-behavior-x: none;
}

html, body, #app {
  overscroll-behavior-x: none;
}

view,
text,
input,
button {
  box-sizing: border-box;
}

button {
  font-family: inherit;
  line-height: 1.2;
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  vertical-align: middle;
}

button::after {
  border: none;
}
</style>
