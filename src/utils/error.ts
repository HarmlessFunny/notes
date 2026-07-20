export function handleApiError(error: any, fallbackMessage: string): void {
    const message = error?.response?.data?.message || error?.message || fallbackMessage
    ElNotification({
        title: '失败',
        message,
        type: 'error'
    })
}

export function handleApiSuccess(message: string): void {
    ElNotification({
        title: '成功',
        message,
        type: 'success'
    })
}

export function handleApiWarning(message: string): void {
    ElNotification({
        title: '警告',
        message,
        type: 'warning'
    })
}

export function handleApiInfo(message: string): void {
    ElNotification({
        title: '提示',
        message,
        type: 'info'
    })
}