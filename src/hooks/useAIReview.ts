import { handleApiError } from '@/utils/error'
import { ref, onUnmounted, onDeactivated } from 'vue'
import { createAbortableStream } from '@/utils/stream'
import { useCacheStore } from '@/stores/cache'
import { getAiConfigHeaders } from '@/types'
import type { ContentPart } from '@/types'
import i18n from '@/i18n'

export interface ChatMsg {
    role: 'user' | 'assistant' | 'system'
    content: string | ContentPart[]
}

type SelectedImage =
    | { file: File; preview: string }
    | { url: string; preview: string }

function buildSystemMessage() {
    const prompt = i18n.global.t('ai.systemPrompt') + `${Date.now()}`
    return { role: 'system', content: prompt }
}

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
        } catch { console.warn(i18n.global.t('aiReview.loadChatFailed')) }
    }

    async function saveChat() {
        try {
            await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatMessages.value })
            })
        } catch { console.warn(i18n.global.t('aiReview.saveChatFailed')) }
    }

    function abortChat() {
        currentStream?.abort()
        currentStream = null
    }

    onUnmounted(() => {
        abortChat()
        clearImages()
    })
    onDeactivated(() => {
        abortChat()
        clearImages()
    })

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
                buildSystemMessage(),
                ...chatMessages.value.slice(0, -1)
            ]
        }, {
            onContent: (content) => {
                chatMessages.value[aiIndex]!.content += content
            },
            onError: (error) => {
                chatMessages.value[aiIndex]!.content = i18n.global.t('aiReview.error', { msg: error.message })
            },
        }, getHeaders())

        currentStream = { abort }

        try {
            await promise
            await saveChat()
        } catch (error: any) {
            if (error?.name === 'AbortError') return
            handleApiError(error, i18n.global.t('aiReview.requestFailed'))
            chatMessages.value[aiIndex]!.content = i18n.global.t('aiReview.networkError')
        } finally {
            sending.value = false
            currentStream = null
        }
    }

    async function retryMessage(index: number) {
        if (sending.value) return
        sending.value = true
        try {
            chatMessages.value.splice(index)
            await saveChat()

            const aiIndex = chatMessages.value.length
            chatMessages.value.push({ role: 'assistant', content: '' })

            const { promise, abort } = createAbortableStream('/api/ai', {
                messages: [
                    buildSystemMessage(),
                    ...chatMessages.value.slice(0, -1)
                ]
            }, {
                onContent: (content) => {
                    chatMessages.value[aiIndex]!.content += content
                },
                onError: (error) => {
                    chatMessages.value[aiIndex]!.content = i18n.global.t('aiReview.error', { msg: error.message })
                },
            }, getHeaders())

            currentStream = { abort }

            try {
                await promise
                await saveChat()
            } catch (error: any) {
                if (error?.name === 'AbortError') return
                handleApiError(error, i18n.global.t('aiReview.requestFailed'))
                chatMessages.value[aiIndex]!.content = i18n.global.t('aiReview.networkError')
            } finally {
                currentStream = null
            }
        } catch (error: any) {
            handleApiError(error, i18n.global.t('aiReview.retryFailed'))
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