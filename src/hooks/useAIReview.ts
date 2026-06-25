import { handleApiError } from '@/utils/error'
import { ref, watch, nextTick, onUnmounted, onDeactivated } from 'vue'
import { createAbortableStream } from '@/utils/stream'

export interface ChatMsg {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export function useAIReview() {
    const chatMessages = ref<ChatMsg[]>([])
    const inputMessage = ref('')
    const sending = ref(false)

    const messageListRef = ref<HTMLElement | null>(null)
    const streamTick = ref(0)
    let currentStream: { abort: () => void } | null = null

    let chatLoaded = false

    async function loadChat() {
        if (chatLoaded) {
            scrollToBottom()
            return
        }
        try {
            const res = await fetch('/api/ai/chat')
            const data = await res.json()
            if (data.status === 'success') {
                chatMessages.value = data.messages ?? []
            }
            chatLoaded = true
        } catch { /* ignore */ }
        scrollToBottom()
    }

    async function saveChat() {
        try {
            await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatMessages.value })
            })
        } catch { /* ignore */ }
    }

    watch([() => chatMessages.value.length, streamTick], scrollToBottom)

    function scrollToBottom() {
        nextTick(() => {
            if (messageListRef.value) {
                messageListRef.value.scrollTop = messageListRef.value.scrollHeight
            }
        })
    }

    function abortChat() {
        currentStream?.abort()
        currentStream = null
    }

    onUnmounted(abortChat)
    onDeactivated(abortChat)

    async function sendMessage() {
        if (!inputMessage.value.trim() || sending.value) return
        sending.value = true

        const userMsg = inputMessage.value.trim()
        chatMessages.value.push({ role: 'user', content: userMsg })
        inputMessage.value = ''

        const aiIndex = chatMessages.value.length
        chatMessages.value.push({ role: 'assistant', content: '' })

        const { promise, abort } = createAbortableStream('/api/ai', {
            messages: [
                {
                    role: 'system',
                    content: '你是一个智能复习助手，使用中文回答用户的问题。用户有多项笔记，你需要根据笔记来考用户知识点。使用$...$或$$...$$包裹数学公式。今天的毫秒级13位时间戳是：' + Date.now()
                },
                ...chatMessages.value.slice(0, -1)
            ]
        }, {
            onContent: (content) => {
                chatMessages.value[aiIndex]!.content += content
                streamTick.value++
            },
            onError: (error) => {
                chatMessages.value[aiIndex]!.content = `抱歉，出错了: ${error.message}`
            },
        })

        currentStream = { abort }

        try {
            await promise
            await saveChat()
        } catch (error: any) {
            if (error?.name === 'AbortError') return
            handleApiError(error, 'AI 请求失败')
            chatMessages.value[aiIndex]!.content = '抱歉，请求失败，请检查网络后重试。'
        } finally {
            sending.value = false
            currentStream = null
        }
    }

    async function truncateMessages(index: number) {
        chatMessages.value.splice(index)
        await saveChat()
    }

    return {
        chatMessages,
        inputMessage,
        sending,
        loadChat,
        sendMessage,
        truncateMessages,
    }
}