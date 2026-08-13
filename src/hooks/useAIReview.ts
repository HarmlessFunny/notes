import { ref } from 'vue'
import { createAbortableStream } from '@/utils/stream'
import type { ToolCallInfo } from '@/utils/stream'
import { useCacheStore } from '@/stores/cache'
import { getAiConfigHeaders } from '@/types'
import type { AiSession, ContentPart } from '@/types'
import { i18n } from '@/locales'
import { ElMessage } from 'element-plus'

const t = i18n.global.t

export interface ChatMsg {
    id?: string
    role: 'user' | 'assistant' | 'system'
    content: string | ContentPart[]
    thinking?: string
    tools?: ToolCallInfo[]
}

type SelectedImage =
    | { file: File; preview: string }
    | { url: string; preview: string }

const ACTIVE_SESSION_KEY = 'notes-ai-active-session'

function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    // 兼容不支持 randomUUID 的环境（部分浏览器/WebView）
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const DRAFT_PREFIX = 'draft-'

export function isDraftId(id: string | null | undefined): boolean {
    return !!id && id.startsWith(DRAFT_PREFIX)
}

function withId(msg: ChatMsg): ChatMsg {
    return msg.id ? msg : { ...msg, id: generateId() }
}

function buildSystemMessage() {
    const store = useCacheStore()
    const prompt = store.aiConfig.systemPrompt || i18n.global.t('settings.api.defaultPrompt')
    return { role: 'system', content: prompt.replaceAll('{timestamp}', String(Date.now())) }
}

function getHeaders() {
    const store = useCacheStore()
    return getAiConfigHeaders(store.aiConfig)
}

export function useAIReview() {
    const sessions = ref<AiSession[]>([])
    const activeSessionId = ref<string | null>(null)
    const chatMessages = ref<ChatMsg[]>([])
    const inputMessage = ref('')
    const sending = ref(false)
    const selectedImages = ref<SelectedImage[]>([])
    const uploading = ref(false)
    const ready = ref(false)

    let sessionsLoaded = false
    let activeMessagesLoaded = false
    let currentStream: { abort: () => void } | null = null

    function stopGenerating() {
        currentStream?.abort()
    }

    async function ensureReady() {
        if (sessionsLoaded) { ready.value = true; return }
        sessionsLoaded = true
        ready.value = true
        try {
            const res = await fetch('/api/ai/sessions')
            const data = await res.json()
            sessions.value = data.sessions ?? []
            if (sessions.value.length === 0) {
                createDraftSession()
                return
            }
            const lastId = localStorage.getItem(ACTIVE_SESSION_KEY)
            const restore = sessions.value.find(s => s.id === lastId) ?? sessions.value[0]!
            await switchSession(restore.id)
        } catch {
            ElMessage.error(t('ai.session.loadFailed'))
        }
    }

    async function switchSession(id: string): Promise<boolean> {
        if (id === activeSessionId.value && activeMessagesLoaded) return true
        if (sending.value) return false
        if (isDraftId(activeSessionId.value)) {
            sessions.value = sessions.value.filter(s => s.id !== activeSessionId.value)
        }
        activeSessionId.value = id
        localStorage.setItem(ACTIVE_SESSION_KEY, id)
        chatMessages.value = []
        activeMessagesLoaded = false
        try {
            const res = await fetch(`/api/ai/sessions/${encodeURIComponent(id)}`)
            const data = await res.json()
            if (data.status === 'success') {
                chatMessages.value = (data.messages ?? []).map(withId)
            }
            activeMessagesLoaded = true
        } catch {
            ElMessage.error(t('ai.session.loadMessagesFailed'))
        }
        return true
    }

    function createDraftSession(): AiSession {
        const draft: AiSession = {
            id: `${DRAFT_PREFIX}${generateId()}`,
            title: '',
            created_at: Date.now(),
            updated_at: Date.now(),
        }
        sessions.value.unshift(draft)
        activeSessionId.value = draft.id
        localStorage.removeItem(ACTIVE_SESSION_KEY)
        chatMessages.value = []
        activeMessagesLoaded = true
        return draft
    }

    async function createSession(clearMessages = true): Promise<AiSession | null> {
        if (sending.value) return null
        try {
            const res = await fetch('/api/ai/sessions', { method: 'POST' })
            const data = await res.json()
            const session: AiSession | undefined = (data.sessions ?? [])[0]
            if (session) {
                sessions.value.unshift(session)
                activeSessionId.value = session.id
                localStorage.setItem(ACTIVE_SESSION_KEY, session.id)
                if (clearMessages) {
                    chatMessages.value = []
                    activeMessagesLoaded = true
                }
                return session
            }
        } catch {
            ElMessage.error(t('ai.session.createFailed'))
        }
        return null
    }

    async function deleteSession(id: string): Promise<boolean> {
        if (sending.value) return false
        if (isDraftId(id)) {
            sessions.value = sessions.value.filter(s => s.id !== id)
            if (activeSessionId.value === id) {
                chatMessages.value = []
                activeMessagesLoaded = false
                if (sessions.value.length > 0) {
                    await switchSession(sessions.value[0]!.id)
                } else {
                    createDraftSession()
                }
            }
            return true
        }
        try {
            const res = await fetch(`/api/ai/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.status !== 'success') return false
        } catch {
            ElMessage.error(t('ai.session.deleteFailed'))
            return false
        }
        sessions.value = sessions.value.filter(s => s.id !== id)
        if (activeSessionId.value === id) {
            chatMessages.value = []
            activeMessagesLoaded = false
            if (sessions.value.length > 0) {
                await switchSession(sessions.value[0]!.id)
            } else {
                createDraftSession()
            }
        }
        return true
    }

    async function renameSession(id: string, title: string): Promise<boolean> {
        const trimmed = title.trim()
        if (!trimmed) return false
        if (isDraftId(id)) {
            const s = sessions.value.find(x => x.id === id)
            if (s) s.title = trimmed
            return true
        }
        try {
            const res = await fetch(`/api/ai/sessions/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: trimmed })
            })
            const data = await res.json()
            if (data.status !== 'success') return false
        } catch {
            ElMessage.error(t('ai.session.renameFailed'))
            return false
        }
        const s = sessions.value.find(x => x.id === id)
        if (s) s.title = trimmed
        return true
    }

    function extractTitleText(): string {
        const firstUser = chatMessages.value.find(m => m.role === 'user')
        let text = ''
        if (firstUser && typeof firstUser.content === 'string') {
            text = firstUser.content
        } else if (firstUser && Array.isArray(firstUser.content)) {
            const tp = (firstUser.content as ContentPart[]).find(p => p.type === 'text')
            if (tp && tp.type === 'text') text = tp.text
        }
        return text.trim()
    }

    // 职责 1：持久化消息到后端
    async function persistMessages(): Promise<boolean> {
        const id = activeSessionId.value
        if (!id || !activeMessagesLoaded) return false
        try {
            const res = await fetch(`/api/ai/sessions/${encodeURIComponent(id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatMessages.value })
            })
            const data = await res.json()
            if (data.status !== 'success') return false
            return true
        } catch {
            ElMessage.warning(t('ai.saveFailed'))
            return false
        }
    }

    // 职责 2：无标题会话自动命名（取首条用户消息）
    async function autoNameSession(s: AiSession): Promise<void> {
        if (s.title) return
        const text = extractTitleText()
        if (!text) return
        const title = text.length > 20 ? `${text.slice(0, 20)}…` : text
        await renameSession(s.id, title)
    }

    // 职责 3：活跃会话置顶
    function moveSessionToTop(id: string): void {
        const idx = sessions.value.findIndex(x => x.id === id)
        if (idx > 0) {
            const [moved] = sessions.value.splice(idx, 1)
            if (moved) sessions.value.unshift(moved)
        }
    }

    async function saveChat() {
        if (!await persistMessages()) return
        const s = sessions.value.find(x => x.id === activeSessionId.value)
        if (!s) return
        await autoNameSession(s)
        moveSessionToTop(s.id)
    }

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
            ElMessage.error(t('ai.uploadFailed'))
            return urls
        } finally {
            uploading.value = false
        }
    }

    async function runChat(): Promise<void> {
        const aiIndex = chatMessages.value.length
        chatMessages.value.push(withId({ role: 'assistant', content: '', thinking: '', tools: [] }))

        const { promise, abort } = createAbortableStream('/api/ai', {
            messages: [
                buildSystemMessage(),
                ...chatMessages.value.slice(0, -1)
            ]
        }, {
            onContent: (content) => {
                chatMessages.value[aiIndex]!.content += content
            },
            onThinking: (text) => {
                chatMessages.value[aiIndex]!.thinking = (chatMessages.value[aiIndex]!.thinking ?? '') + text
            },
            onTool: (info) => {
                chatMessages.value[aiIndex]!.tools ??= []
                chatMessages.value[aiIndex]!.tools!.push(info)
            },
            onError: (error) => {
                chatMessages.value[aiIndex]!.content = t('ai.errorPrefix', { msg: error.message })
            },
        }, getHeaders())

        currentStream = { abort }

        await promise
        sending.value = false
        currentStream = null
        await saveChat()
    }

    async function sendMessage() {
        if ((!inputMessage.value.trim() && selectedImages.value.length === 0) || sending.value) return

        const draftId = isDraftId(activeSessionId.value) ? activeSessionId.value : null
        if (draftId) {
            const session = await createSession(false)
            if (!session) return
            sessions.value = sessions.value.filter(s => s.id !== draftId)
        }

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

        chatMessages.value.push(withId({ role: 'user', content }))
        inputMessage.value = ''
        clearImages()
        await runChat()
    }

    async function retryMessage(index: number) {
        if (sending.value) return
        sending.value = true

        chatMessages.value.splice(index)
        await saveChat()
        await runChat()
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
        sessions,
        activeSessionId,
        chatMessages,
        inputMessage,
        sending,
        selectedImages,
        uploading,
        ready,
        ensureReady,
        switchSession,
        createSession,
        createDraftSession,
        deleteSession,
        renameSession,
        sendMessage,
        stopGenerating,
        truncateMessages,
        retryMessage,
        addImages,
        removeImage,
    }
}