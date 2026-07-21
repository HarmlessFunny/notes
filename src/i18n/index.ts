import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.json'
import en from '../locales/en.json'

export const LOCALE_KEY = 'notes-locale'

export type LocaleType = 'zh-CN' | 'en'

export function getDefaultLocale(): LocaleType {
  const saved = localStorage.getItem(LOCALE_KEY) as LocaleType | null
  if (saved && ['zh-CN', 'en'].includes(saved)) return saved
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, en },
})

export function setLocale(lang: LocaleType) {
  i18n.global.locale.value = lang
  localStorage.setItem(LOCALE_KEY, lang)
}

export default i18n
