import type { Ref } from 'vue'

// 消息列表自动滚动：rAF 节流合并每 SSE 增量触发的滚动，避免每 chunk 强制重排
export function useAutoScroll<T extends HTMLElement>(elRef: Ref<T | null | undefined>, threshold = 120) {
    let rafId = 0

    function isNearBottom() {
        const el = elRef.value
        if (!el) return true
        return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    }

    function scrollToBottom(smooth = false) {
        const el = elRef.value
        if (!el) return
        if (smooth) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
        } else {
            el.scrollTop = el.scrollHeight
        }
    }

    function scrollToBottomIfNear() {
        if (isNearBottom()) scrollToBottom()
    }

    // force=true 始终滚到底（发送中跟随），否则仅在接近底部时跟随
    function requestScroll(force: boolean) {
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
            rafId = 0
            if (force) scrollToBottom()
            else scrollToBottomIfNear()
        })
    }

    return { isNearBottom, scrollToBottom, scrollToBottomIfNear, requestScroll }
}