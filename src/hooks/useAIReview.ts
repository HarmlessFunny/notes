import { handleApiError } from '@/utils/error'
import { ref, onUnmounted, onDeactivated } from 'vue'
import { createAbortableStream } from '@/utils/stream'
import { useCacheStore } from '@/stores/cache'
import { getAiConfigHeaders } from '@/types'

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

export interface ChatMsg {
    role: 'user' | 'assistant' | 'system'
    content: string | ContentPart[]
}

type SelectedImage =
    | { file: File; preview: string }
    | { url: string; preview: string }

export function useAIReview() {
    const chatMessages = ref<ChatMsg[]>([])
    const inputMessage = ref('')
    const sending = ref(false)
    const selectedImages = ref<SelectedImage[]>([])
    const uploading = ref(false)

    let currentStream: { abort: () => void } | null = null

    let chatLoaded = false

    function getHeaders() {
        const store = useCacheStore()
        return getAiConfigHeaders(store.aiConfig)
    }

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

    function addImages(files: FileList | File[]) {
        for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/')) continue
            if (file.size > 20 * 1024 * 1024) continue
            const preview = URL.createObjectURL(file)
            selectedImages.value.push({ file, preview })
        }
    }

    function removeImage(index: number) {
        const img = selectedImages.value[index]
        if (img) {
            if ('file' in img) URL.revokeObjectURL(img.preview)
            selectedImages.value.splice(index, 1)
        }
    }

    function clearImages() {
        for (const img of selectedImages.value) {
            if ('file' in img) URL.revokeObjectURL(img.preview)
        }
        selectedImages.value = []
    }

    function addRestoredImageUrl(url: string) {
        selectedImages.value.push({ url, preview: url })
    }

    async function uploadImages(): Promise<string[]> {
        const fileImages = selectedImages.value.filter((img): img is { file: File; preview: string } => 'file' in img)
        const urlImages = selectedImages.value.filter((img): img is { url: string; preview: string } => 'url' in img)
        const urls: string[] = urlImages.map(img => img.url)

        if (fileImages.length === 0) return urls
        uploading.value = true
        try {
            const formData = new FormData()
            for (const img of fileImages) {
                formData.append('images', img.file)
            }
            const res = await fetch('/api/ai/upload', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.status === 'success') {
                urls.push(...(data.urls ?? []))
            }
            return urls
        } catch {
            return urls
        } finally {
            uploading.value = false
        }
    }

    async function sendMessage() {
        if ((!inputMessage.value.trim() && selectedImages.value.length === 0) || sending.value) return
        sending.value = true

        const imageUrls = await uploadImages()
        const text = inputMessage.value.trim()

        let content: string | ContentPart[]
        if (imageUrls.length > 0) {
            content = []
            if (text) {
                content.push({ type: 'text', text })
            }
            for (const url of imageUrls) {
                content.push({ type: 'image_url', image_url: { url } })
            }
        } else {
            content = text
        }

        chatMessages.value.push({ role: 'user', content })
        inputMessage.value = ''
        clearImages()

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
        }, getHeaders())

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

    async function retryMessage(index: number) {
        if (sending.value) return
        sending.value = true

        chatMessages.value.splice(index)
        await saveChat()

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
        }, getHeaders())

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
            clearImages()
            if (typeof msg.content === 'string') {
                inputMessage.value = msg.content
            } else {
                const texts: string[] = []
                for (const part of msg.content) {
                    if (part.type === 'text') {
                        texts.push(part.text)
                    } else if (part.type === 'image_url') {
                        addRestoredImageUrl(part.image_url.url)
                    }
                }
                inputMessage.value = texts.join('\n')
            }
        }
        chatMessages.value.splice(index)
        await saveChat()
    }

    return {
        chatMessages,
        inputMessage,
        sending,
        selectedImages,
        uploading,
        loadChat,
        sendMessage,
        truncateMessages,
        retryMessage,
        addImages,
        removeImage,
        addRestoredImageUrl,
    }
}