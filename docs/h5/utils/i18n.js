import { computed, ref } from 'vue'
import en from '../locales/en.js'
import vi from '../locales/vi.js'

const STORAGE_KEY = 'app_locale'
const LEGACY_LANGUAGE_KEY = 'language'
const LEGACY_LANG_KEY = 'lang'
const SUPPORTED_LOCALES = ['zh', 'en', 'vi']
const locale = ref(getInitialLocale())

const messages = {
  zh: {},
  en,
  vi
}

function getInitialLocale() {
  const saved = getStoredLocale()
  if (SUPPORTED_LOCALES.includes(saved)) return saved

  const systemLang = getSystemLocale()
  if (systemLang.startsWith('vi')) return 'vi'
  if (systemLang.startsWith('en')) return 'en'
  return 'zh'
}

function getStoredLocale() {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      return (
        uni.getStorageSync(STORAGE_KEY) ||
        uni.getStorageSync(LEGACY_LANGUAGE_KEY) ||
        uni.getStorageSync(LEGACY_LANG_KEY)
      )
    }
    if (typeof localStorage !== 'undefined') {
      return (
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_LANGUAGE_KEY) ||
        localStorage.getItem(LEGACY_LANG_KEY)
      )
    }
  } catch (error) {
    console.warn('[i18n] read locale failed:', error)
  }
  return ''
}

function getSystemLocale() {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function') {
      const lang = uni.getSystemInfoSync()?.language || ''
      return String(lang).toLowerCase()
    }
  } catch (error) {
    console.warn('[i18n] read system locale failed:', error)
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return String(navigator.language).toLowerCase()
  }
  return 'zh'
}

function setStoredLocale(next) {
  try {
    if (typeof uni !== 'undefined' && typeof uni.setStorageSync === 'function') {
      uni.setStorageSync(STORAGE_KEY, next)
      uni.setStorageSync(LEGACY_LANGUAGE_KEY, next)
      uni.setStorageSync(LEGACY_LANG_KEY, next)
      return
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next)
      localStorage.setItem(LEGACY_LANGUAGE_KEY, next)
      localStorage.setItem(LEGACY_LANG_KEY, next)
    }
  } catch (error) {
    console.warn('[i18n] save locale failed:', error)
  }
}

function interpolate(text, params = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

export function t(key, params = {}) {
  const base = String(key || '')
  if (!base) return ''
  if (locale.value === 'zh') return interpolate(base, params)
  const translated = messages[locale.value]?.[base] || base
  return interpolate(translated, params)
}

export function setLocale(next) {
  if (!SUPPORTED_LOCALES.includes(next)) return
  locale.value = next
  setStoredLocale(next)
}

export function getLocale() {
  return locale.value
}

export function useI18n() {
  return {
    locale: computed(() => locale.value),
    supportedLocales: SUPPORTED_LOCALES,
    t,
    setLocale
  }
}
