import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'

export type Locale = 'zh-CN' | 'en-US'

export const LOCALES: { value: Locale; labelKey: string }[] = [
    { value: 'zh-CN', labelKey: 'settings.languageZh' },
    { value: 'en-US', labelKey: 'settings.languageEn' },
]

export const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: {
        'zh-CN': zhCN,
        'en-US': enUS,
    },
})

// 当前生效语言，用于 X-Lang 请求头
export function currentLang(): string {
    const locale = i18n.global.locale.value as string
    return locale.startsWith('en') ? 'en' : 'zh'
}

export function setLocale(locale: Locale) {
    i18n.global.locale.value = locale
    document.documentElement.lang = locale
}

export function detectSystemLocale(): Locale {
    const lang = (navigator.language || 'zh-CN').toLowerCase()
    return lang.startsWith('en') ? 'en-US' : 'zh-CN'
}
