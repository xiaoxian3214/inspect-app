import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { t } from './utils/i18n.js'
import AppButton from './components/AppButton.vue'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  app.component('AppButton', AppButton)
  app.config.globalProperties.$t = t
  return {
    app
  }
}
