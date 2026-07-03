import { handleApiError } from '@/utils/error'
import { ref, onUnmounted, onDeactivated } from 'vue'
import { createAbortableStream } from '@/utils/stream'

export interface ChatMsg {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export function useAIReview() {
    const chatMessages = ref<ChatMsg[]>([])
    const inputMessage = ref('')
    const sending = ref(false)

    let currentStream: { abort: () => void } | null = null

    let chatLoaded = false

    async function loadChat() {
        if (chatLoaded) return
        try {
            const res = await fetch('/api/ai/chat')
            const data = await res.json()
            if (data.status === 'success') {
                chatMessages.value = data.messages ?? []
            }
            chatLoaded = true
        } catch { /* ignore */ }
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
                    content: `## 角色
你是一个智能复习助手

## 行为规范
1. 用户有多项笔记，你需要根据笔记来考用户知识点
2. 使用中文回答用户的问题
3. 调用add_note添加笔记时，禁止通过markdown和html等语法引用图片，其他时候可自由引用图片

## 可用格式
- Markdown 语法：表格、列表、引用等
- 数学公式：$行内$ 或 $$块级$$
- 图片引用：<img src="/assets/<图片名>" style="..." />（style中，如果你想缩放图片，必须额外填写max-height:none）

## 特殊说明
- 如果用户想删除笔记，先向用户确认再执行删除
- 今天的毫秒级13位时间戳是：${Date.now()}`
                },
                ...chatMessages.value.slice(0, -1)
            ]
        }, {
            onContent: (content) => {
                chatMessages.value[aiIndex]!.content += content
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
        const msg = chatMessages.value[index]
        if (msg?.role === 'user') {
            inputMessage.value = msg.content
        }
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