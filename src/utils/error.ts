import i18n from '@/i18n'

function nt(key: string) {
    return i18n.global.t(key)
}

export function handleApiError(error: any, fallbackMessage: string): void {
    const message = error?.response?.data?.message || error?.message || fallbackMessage
    ElNotification({
        title: nt('notification.error'),
        message,
        type: 'error',
        position: 'top-right'
    })
}

export function handleApiSuccess(message: string): void {
    ElNotification({
        title: nt('notification.success'),
        message,
        type: 'success',
        position: 'top-right',
        duration: 1000
    })
}

export function handleApiWarning(message: string): void {
    ElNotification({
        title: nt('notification.warning'),
        message,
        type: 'warning',
        position: 'top-right',
        duration: 3000
    })
}

export function handleApiInfo(message: string): void {
    ElNotification({
        title: nt('notification.info'),
        message,
        type: 'info',
        position: 'top-right',
        duration: 2000
    })
}