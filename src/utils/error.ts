import { i18n } from '@/locales'

const t = (key: string) => i18n.global.t(key)

export function handleApiError(error: any, fallbackMessage: string): void {
    const message = error?.response?.data?.message || error?.message || fallbackMessage
    ElNotification({
        title: t('common.error'),
        message,
        type: 'error'
    })
}

export function handleApiSuccess(message: string): void {
    ElNotification({
        title: t('common.success'),
        message,
        type: 'success'
    })
}

export function handleApiWarning(message: string): void {
    ElNotification({
        title: t('common.warning'),
        message,
        type: 'warning'
    })
}

export function handleApiInfo(message: string): void {
    ElNotification({
        title: t('common.info'),
        message,
        type: 'info'
    })
}