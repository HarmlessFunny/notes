<template>
    <div class="container">
        <div v-if="!configured" class="unconfigured-hint">
            <el-icon :size="48" color="var(--el-text-color-placeholder)"><ChatDotRound /></el-icon>
            <h3>{{ $t('ai.unconfiguredTitle') }}</h3>
            <p>{{ $t('ai.unconfiguredHintPrefix') }} <el-icon><Setting /></el-icon> {{ $t('ai.unconfiguredHintSuffix') }}</p>
        </div>
        <template v-else>
            <div class="chat-layout">
                <!-- 桌面端会话侧栏 -->
                <aside v-if="ready && !narrow" class="session-sidebar" :class="{ collapsed: !sidebarOpen }">
                    <div v-if="sidebarOpen" class="sidebar-inner">
                        <SessionList :sessions="sessions" :active-id="activeSessionId" :disabled="sending"
                            @switch="handleSwitchSession" @create="handleCreateSession" @rename="handleRenameSession"
                            @delete="handleDeleteSession" />
                        <div class="sidebar-collapse-btn" @click="sidebarOpen = false">
                            <el-icon :size="14">
                                <DArrowLeft />
                            </el-icon>
                        </div>
                    </div>
                    <div v-else class="sidebar-expand" @click="sidebarOpen = true">
                        <el-icon :size="16">
                            <DArrowRight />
                        </el-icon>
                    </div>
                </aside>

                <div class="chat-main">
                    <div class="chat-header">
                        <template v-if="narrow">
                            <el-button class="header-btn" :icon="ChatLineSquare" text circle :disabled="!ready"
                                @click="drawerVisible = true" />
                        </template>
                        <span class="current-session-title">{{ currentSessionTitle }}</span>
                        <el-button v-if="narrow" class="header-btn" :icon="Plus" text circle :loading="sending"
                            :disabled="!ready || sending" :title="$t('ai.session.newChat')" @click="handleCreateSession" />
                    </div>

                    <div ref="messageListRef" class="message-list">
                        <template v-for="(message, index) in chatMessages" :key="index">
                            <div v-if="message.role !== 'system'" :class="['message-item', message.role]">
                                <div class="message-content">
                                    <template v-if="typeof message.content === 'string'">
                                        <div v-if="message.thinking && showThinking" class="thinking-block">
                                            <div class="thinking-header" @click="toggleThinking(message)">
                                                <el-icon :size="12"><Cpu /></el-icon>
                                                <span>{{ $t('ai.thinking') }}</span>
                                                <el-icon :size="12" class="thinking-toggle-icon">
                                                    <ArrowDown v-if="isThinkingExpanded(message)" />
                                                    <ArrowRight v-else />
                                                </el-icon>
                                            </div>
                                            <div v-show="isThinkingExpanded(message)" class="thinking-body">{{ message.thinking }}</div>
                                        </div>
                                        <div v-if="message.tools?.length && showThinking" class="tool-list">
                                            <div v-for="tool in message.tools" :key="`${tool.round}-${tool.name}`" class="tool-card" :class="{ failed: !tool.success }">
                                                <el-icon :size="13"><Cpu /></el-icon>
                                                <span class="tool-name">{{ toolNames[tool.name] ?? tool.name }}</span>
                                                <span class="tool-args" :title="JSON.stringify(tool.arguments)">{{ formatArgs(tool) }}</span>
                                                <span v-if="!tool.success || !isMutationTool(tool.name)" class="tool-summary">{{ tool.summary }}</span>
                                                <span class="tool-status" :class="tool.success ? 'ok' : 'bad'">{{ tool.success ? '✓' : '✗' }}</span>
                                            </div>
                                        </div>
                                        <MarkdownRenderer class="message-text" :content="message.content" />
                                    </template>
                                    <template v-else>
                                        <template v-for="(part, pi) in message.content" :key="pi">
                                            <MarkdownRenderer v-if="part.type === 'text'" class="message-text" :content="part.text" />
                                            <el-image v-else-if="part.type === 'image_url'" :src="part.image_url.url" class="chat-image" :preview-src-list="[part.image_url.url]" preview-teleported />
                                        </template>
                                    </template>
                                    <div v-if="message.role === 'user'" class="message-actions">
                                        <el-icon class="action-btn" :title="$t('ai.copy')" @click.stop="copyMessage(message)">
                                            <CopyDocument />
                                        </el-icon>
                                        <el-icon class="action-btn delete-btn" :title="$t('ai.deleteFromHere')" @click.stop="truncateMessages(index)">
                                            <Delete />
                                        </el-icon>
                                    </div>
                                    <div v-if="message.role === 'assistant' && !sending" class="message-actions">
                                        <el-icon class="action-btn" :title="$t('ai.copy')" @click.stop="copyMessage(message)">
                                            <CopyDocument />
                                        </el-icon>
                                        <el-icon class="action-btn" :title="$t('ai.regenerate')" @click.stop="retryMessage(index)">
                                            <Refresh />
                                        </el-icon>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>

                    <div ref="inputAreaRef" class="input-area">
                        <div v-if="selectedImages.length" class="image-preview-list">
                            <div v-for="(img, idx) in selectedImages" :key="idx" class="image-preview-item">
                                <el-image :src="img.preview" class="image-preview-thumb" :preview-src-list="[img.preview]" preview-teleported />
                                <el-icon class="remove-image-btn" @click="removeImage(idx)"><Close /></el-icon>
                            </div>
                        </div>
                        <div class="input-row">
                            <el-button v-if="visionEnabled" :icon="Picture" circle @click="triggerUpload" :disabled="sending || uploading" />
                            <input v-if="visionEnabled" ref="fileInputRef" type="file" multiple accept="image/*" class="hidden-input" @change="onFileChange" />
                            <el-input v-model="inputMessage" type="textarea" :autosize="{ minRows: 1, maxRows: 6 }"
                                resize="none" :placeholder="inputPlaceholder" class="message-input"
                                @keydown="onInputKeydown" />
                            <el-button type="primary" class="send-btn" :icon="Top" @click="sendMessage" :loading="sending"
                                :disabled="(!inputMessage.trim() && !selectedImages.length) || sending || uploading">
                                {{ uploading ? $t('ai.uploading') : $t('ai.send') }}
                            </el-button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 移动端会话抽屉 -->
            <el-drawer v-model="drawerVisible" :title="$t('ai.session.sessions')" direction="ltr" size="min(300px, 80vw)">
                <SessionList :sessions="sessions" :active-id="activeSessionId" :disabled="sending"
                    @create="handleDrawerCreate" @switch="handleDrawerSwitch" @rename="handleDrawerRename"
                    @delete="handleDrawerDelete" />
            </el-drawer>
        </template>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AIReview' })
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, onActivated } from 'vue'
import { Top, Delete, Picture, Close, Refresh, ChatLineSquare, Setting, Cpu, ArrowDown, ArrowRight, CopyDocument, Plus, DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import SessionList from '@/components/SessionList.vue'
import { useAIReview } from '@/hooks/useAIReview'
import type { ChatMsg } from '@/hooks/useAIReview'
import type { ToolCallInfo } from '@/utils/stream'
import { useCacheStore } from '@/stores/cache'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const store = useCacheStore()
const visionEnabled = computed(() => store.visionEnabled)
const configured = computed(() => !!store.aiConfig.apiKey && !!store.aiConfig.baseUrl && !!store.aiConfig.modelName)
const showThinking = computed(() => store.aiConfig.showThinking)

const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
const inputPlaceholder = computed(() => isCoarsePointer
    ? t('ai.inputPlaceholderMobile')
    : t('ai.inputPlaceholderDesktop'))

const narrowMediaQuery = window.matchMedia('(max-width: 768px)')
const narrow = ref(narrowMediaQuery.matches)
function onNarrowChange() {
    narrow.value = narrowMediaQuery.matches
}

const drawerVisible = ref(false)
const sidebarOpen = ref(true)

const expandedThinking = reactive(new Set<ChatMsg>())
function toggleThinking(msg: ChatMsg) {
    if (expandedThinking.has(msg)) {
        expandedThinking.delete(msg)
    } else {
        expandedThinking.add(msg)
    }
}

function isThinkingExpanded(msg: ChatMsg) {
    return expandedThinking.has(msg)
        || (sending.value && msg === chatMessages.value[chatMessages.value.length - 1])
}

const toolNames = computed<Record<string, string>>(() => ({
    fetch_note_by_title: t('ai.tool.name.fetchNoteByTitle'),
    fetch_all_notes: t('ai.tool.name.fetchAllNotes'),
    fetch_notes_by_day: t('ai.tool.name.fetchNotesByDay'),
    search_notes: t('ai.tool.name.searchNotes'),
    add_note: t('ai.tool.name.addNote'),
    delete_notes: t('ai.tool.name.deleteNotes'),
    update_note: t('ai.tool.name.updateNote'),
}))

const MUTATION_TOOLS = new Set(['add_note', 'delete_notes', 'update_note'])
function isMutationTool(name: string) {
    return MUTATION_TOOLS.has(name)
}

function formatArgs(tool: ToolCallInfo): string {
    const args = tool.arguments as Record<string, unknown>
    const arg = (key: string): string => String(args[key] ?? '')

    switch (tool.name) {
        case 'fetch_note_by_title':
            return `${t('ai.tool.arg.title')}: ${arg('title')}`
        case 'fetch_all_notes':
            return ''
        case 'fetch_notes_by_day': {
            const ts = Number(arg('someday'))
            if (Number.isFinite(ts) && ts > 0) {
                const d = new Date(ts)
                const pad = (n: number) => String(n).padStart(2, '0')
                return `${t('ai.tool.arg.date')}: ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
            }
            return `${t('ai.tool.arg.timestamp')}: ${arg('someday')}`
        }
        case 'search_notes':
            return `${t('ai.tool.arg.keyword')}: ${arg('keyword')}`
        case 'add_note': {
            const parts = [`${t('ai.tool.arg.title')}: ${arg('title')}`]
            if (arg('subject')) parts.push(`${t('ai.tool.arg.subject')}: ${arg('subject')}`)
            return parts.join(' · ')
        }
        case 'delete_notes':
            return `${t('ai.tool.arg.title')}: ${arg('title')}`
        case 'update_note':
            return `${t('ai.tool.arg.old')}: ${arg('old_title')} → ${t('ai.tool.arg.new')}: ${arg('new_title')}`
        default:
            return JSON.stringify(args)
    }
}

async function copyMessage(message: ChatMsg) {
    let text = ''
    if (typeof message.content === 'string') {
        text = message.content
    } else {
        text = message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map(part => part.text)
            .join('\n')
    }
    if (!text) return
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
    }
    ElMessage.success(t('ai.copied'))
}

const {
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
    deleteSession,
    renameSession,
    sendMessage,
    truncateMessages,
    retryMessage,
    addImages,
    removeImage,
} = useAIReview()

const currentSessionTitle = computed(() => {
    const s = sessions.value.find(x => x.id === activeSessionId.value)
    return s?.title || t('ai.session.defaultTitle')
})

async function handleCreateSession() {
    if (chatMessages.value.length === 0) {
        ElMessage.info(t('ai.session.alreadyNew'))
        return
    }
    const session = await createSession()
    if (!session) {
        ElMessage.error(t('ai.session.createFailed'))
        return
    }
    if (drawerVisible.value) drawerVisible.value = false
    await nextTick()
    scrollToBottom()
}

function handleSwitchSession(id: string) {
    switchSession(id)
}

async function handleRenameSession(id: string, title: string) {
    const ok = await renameSession(id, title)
    if (ok) ElMessage.success(t('ai.session.renameSuccess'))
}

async function handleDeleteSession(id: string) {
    const ok = await deleteSession(id)
    if (ok) ElMessage.success(t('ai.session.deleteSuccess'))
}

function handleDrawerCreate() {
    handleCreateSession()
}

function handleDrawerSwitch(id: string) {
    drawerVisible.value = false
    switchSession(id)
}

function handleDrawerRename(id: string, title: string) {
    handleRenameSession(id, title)
}

function handleDrawerDelete(id: string) {
    handleDeleteSession(id)
}

function onInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !isCoarsePointer) {
        e.preventDefault()
        sendMessage()
    }
}

const fileInputRef = ref<HTMLInputElement>()
const messageListRef = ref<HTMLDivElement>()
const inputAreaRef = ref<HTMLDivElement>()
let resizeObserver: ResizeObserver | null = null

function onInputAreaResize() {
    scrollToBottomIfNear()
}

function isNearBottom() {
    const el = messageListRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

function scrollToBottomIfNear() {
    if (isNearBottom()) scrollToBottom()
}

function scrollToBottom(smooth = false) {
    const el = messageListRef.value
    if (!el) return
    if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
        el.scrollTop = el.scrollHeight
    }
}

function triggerUpload() {
    fileInputRef.value?.click()
}

function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files?.length) {
        addImages(input.files)
        input.value = ''
    }
}

onMounted(() => {
    store.loadAiStatus()
    narrowMediaQuery.addEventListener('change', onNarrowChange)
    if (inputAreaRef.value) {
        resizeObserver = new ResizeObserver(onInputAreaResize)
        resizeObserver.observe(inputAreaRef.value)
    }
})
onUnmounted(() => {
    resizeObserver?.disconnect()
    narrowMediaQuery.removeEventListener('change', onNarrowChange)
})

async function handleActivated() {
    await ensureReady()
    await nextTick()
    scrollToBottom(true)
    window.setTimeout(() => scrollToBottom(), 400)
}
onActivated(handleActivated)

watch(chatMessages, () => {
    if (sending.value) {
        scrollToBottom()
    } else {
        scrollToBottomIfNear()
    }
}, { deep: true })
</script>

<style scoped>
.container {
    margin: 0;
    padding: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    font-family: var(--el-font-family);
    overflow: hidden;
    min-height: 0;
}

.chat-layout {
    flex: 1;
    display: flex;
    min-height: 0;
}

.session-sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color-light);
    transition: width 0.2s ease;
    overflow: hidden;
}

.session-sidebar.collapsed {
    width: 36px;
}

.sidebar-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    position: relative;
}

.sidebar-collapse-btn {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    width: 20px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--el-text-color-placeholder);
    border-radius: 6px 0 0 6px;
}

.sidebar-collapse-btn:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
}

.sidebar-expand {
    width: 36px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--el-text-color-placeholder);
}

.sidebar-expand:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
}

.chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}

.chat-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 16px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--el-border-color-light);
    background: var(--el-bg-color);
    flex-shrink: 0;
}

.current-session-title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    color: var(--el-text-color-primary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}

.header-btn {
    font-size: 16px;
}

.unconfigured-hint {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--el-text-color-placeholder);
}

.unconfigured-hint h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
}

.unconfigured-hint p {
    margin: 0;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.message-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.message-item {
    display: flex;
    flex-direction: column;
}

.message-item.user {
    align-items: flex-end;
}

.message-item:not(.user) {
    align-items: flex-start;
}

.message-item.user .message-content {
    align-items: flex-end;
}

.message-item.user .message-text {
    background: var(--el-color-primary);
    color: white;
    border-radius: 12px 12px 0 12px;
}

.message-item:not(.user) .message-text {
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-light);
}

.message-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 75%;
}

.message-text {
    padding: 10px 14px;
    border-radius: 12px 12px 12px 0;
    line-height: 1.6;
    word-break: break-word;
}

.thinking-block {
    background: var(--el-fill-color-light);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 13px;
}

.thinking-header {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    user-select: none;
}

.thinking-header:hover {
    color: var(--el-color-primary);
}

.thinking-toggle-icon {
    margin-left: auto;
}

.thinking-body {
    color: var(--el-text-color-secondary);
    font-style: italic;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
    padding: 4px 0 2px;
    font-size: 13px;
    line-height: 1.6;
}

.tool-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.tool-card {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    padding: 4px 8px;
    color: var(--el-text-color-secondary);
}

.tool-card.failed {
    border-color: var(--el-color-danger-light-5);
    background: var(--el-color-danger-light-9);
}

.tool-name {
    font-weight: 600;
    color: var(--el-text-color-primary);
    flex-shrink: 0;
}

.tool-args {
    font-family: monospace;
    color: var(--el-text-color-secondary);
    word-break: break-all;
}

.tool-summary {
    word-break: break-all;
    flex: 1;
    min-width: 0;
}

.tool-status {
    flex-shrink: 0;
    margin-left: auto;
    font-weight: 600;
}

.tool-status.ok {
    color: var(--el-color-success);
}

.tool-status.bad {
    color: var(--el-color-danger);
}

.message-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 2px;
    opacity: 0;
    transition: opacity 0.2s;
}

.message-content:hover .message-actions {
    opacity: 1;
}

.action-btn {
    font-size: 14px;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
}

.action-btn:hover {
    color: var(--el-color-primary);
}

.action-btn.delete-btn:hover {
    color: var(--el-color-danger);
}

.message-text :deep(img) {
    max-height: 300px;
    width: auto;
    object-fit: contain;
}

.chat-image {
    max-width: 300px;
    max-height: 300px;
    border-radius: 8px;
    margin-top: 4px;
    cursor: zoom-in;
    overflow: hidden;
}

.chat-image :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    max-height: 300px;
}

.input-area {
    padding: 12px 20px;
    flex-shrink: 0;
    background: var(--el-bg-color);
    border-top: 1px solid var(--el-border-color-light);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.input-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.image-preview-list {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.image-preview-item {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--el-border-color-light);
    flex-shrink: 0;
}

.image-preview-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.remove-image-btn {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 12px;
    color: white;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    padding: 2px;
    cursor: pointer;
}

.message-input {
    flex: 1;
}

.send-btn {
    padding: 0 20px;
}

.hidden-input {
    display: none;
}

@media (max-width: 768px) {
    .input-area {
        padding: 12px 16px;
    }

    .message-content {
        max-width: 85%;
    }
}

@media (max-width: 480px) {
    .message-list {
        padding: 12px;
        gap: 12px;
    }

    .message-text {
        padding: 8px 12px;
        font-size: 14px;
    }

    .message-content {
        max-width: 90%;
    }

    .input-area {
        padding: 10px 12px;
    }

    .input-actions {
        gap: 6px;
    }

    .send-btn {
        padding: 0 14px;
        font-size: 13px;
    }

    .send-btn .el-icon {
        margin-right: 0;
    }

    .send-btn span {
        display: none;
    }
}
</style>
