// 图片相对路径修正：生产环境（Tauri 打包）下补 API 前缀，
// 开发环境走 vite 代理保持原样
export function resolveImageUrl(url: string): string {
    if (!import.meta.env.DEV && url.startsWith('/uploads/images/')) {
        return `${(window as any).__API_BASE__}${url}`
    }
    return url
}