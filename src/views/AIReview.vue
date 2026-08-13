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
                        <template v-for="(message, index) in chatMessages" :key="message.id ?? index">
                            <ChatMessageItem v-if="message.role !== 'system'" :message="message" :index="index"
                                :sending="sending" :show-thinking="showThinking"
                                :streaming="index === chatMessages.length - 1 && sending"
                                :auto-expand="index === chatMessages.length - 1 && sending"
                                @truncate="truncateMessages" @retry="retryMessage" />
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
                            <el-button v-if="sending" class="stop-btn" :icon="VideoPause" circle :title="$t('ai.stop')"
                                @click="stopGenerating" />
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
                    @create="handleCreateSession" @switch="handleDrawerSwitch" @rename="handleRenameSession"
                    @delete="handleDeleteSession" />
            </el-drawer>
        </template>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AIReview' })
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Top, Picture, Close, ChatLineSquare, Setting, Plus, DArrowLeft, DArrowRight, VideoPause, ChatDotRound } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import SessionList from '@/components/SessionList.vue'
import ChatMessageItem from '@/components/chat/ChatMessageItem.vue'
import { useAutoScroll } from '@/composables/useAutoScroll'
import { useAIReview, isDraftId } from '@/hooks/useAIReview'
import { useCacheStore } from '@/stores/cache'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => route.params.sessionId as string | undefined)

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
    createDraftSession,
    deleteSession,
    renameSession,
    sendMessage,
    stopGenerating,
    truncateMessages,
    retryMessage,
    addImages,
    removeImage,
} = useAIReview()

const currentSessionTitle = computed(() => {
    const s = sessions.value.find(x => x.id === activeSessionId.value)
    return s?.title || t('ai.session.defaultTitle')
})

function handleCreateSession() {
    if (chatMessages.value.length === 0) {
        ElMessage.info(t('ai.session.alreadyNew'))
        return
    }
    createDraftSession()
    if (drawerVisible.value) drawerVisible.value = false
    router.replace('/ai')
    nextTick().then(() => scrollToBottom())
}

function handleSwitchSession(id: string) {
    if (sending.value) {
        ElMessage.info(t('ai.session.switchBusy'))
        return
    }
    router.push(`/ai/${id}`)
}

async function handleRenameSession(id: string, title: string) {
    const ok = await renameSession(id, title)
    if (ok) ElMessage.success(t('ai.session.renameSuccess'))
}

async function handleDeleteSession(id: string) {
    const ok = await deleteSession(id)
    if (ok) {
        ElMessage.success(t('ai.session.deleteSuccess'))
        if (activeSessionId.value) {
            router.replace(`/ai/${activeSessionId.value}`)
        }
    }
}

function handleDrawerSwitch(id: string) {
    if (sending.value) {
        ElMessage.info(t('ai.session.switchBusy'))
        return
    }
    drawerVisible.value = false
    router.push(`/ai/${id}`)
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
const { scrollToBottom, scrollToBottomIfNear, requestScroll } = useAutoScroll(messageListRef)
let resizeObserver: ResizeObserver | null = null

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
        resizeObserver = new ResizeObserver(scrollToBottomIfNear)
        resizeObserver.observe(inputAreaRef.value)
    }
})
onUnmounted(() => {
    resizeObserver?.disconnect()
    narrowMediaQuery.removeEventListener('change', onNarrowChange)
})

async function syncToRoute() {
    if (!route.path.startsWith('/ai')) return
    await ensureReady()
    const id = sessionId.value
    if (!id) {
        // 裸 /ai：跳转到当前/上次会话，草稿不写入路由
        if (activeSessionId.value && !isDraftId(activeSessionId.value)) {
            await switchSession(activeSessionId.value)
            router.replace(`/ai/${activeSessionId.value}`)
        }
        return
    }
    // /ai/:id 不存在（会话被删/过期）：跳转到第一个会话，没有则建草稿
    if (!sessions.value.some(s => s.id === id)) {
        if (sessions.value.length > 0) {
            const first = sessions.value[0]!.id
            await switchSession(first)
            router.replace(`/ai/${first}`)
        } else {
            createDraftSession()
            router.replace('/ai')
        }
        return
    }
    await switchSession(id)
}

watch(sessionId, syncToRoute)

async function handleActivated() {
    await syncToRoute()
    await nextTick()
    scrollToBottom(true)
    // markdown 异步解析撑高内容后再定位一次
    window.setTimeout(() => scrollToBottom(), 400)
}
onActivated(handleActivated)

watch(chatMessages, () => {
    requestScroll(sending.value)
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

.stop-btn {
    flex-shrink: 0;
}

.hidden-input {
    display: none;
}

@media (max-width: 768px) {
    .input-area {
        padding: 12px 16px;
    }
}

@media (max-width: 480px) {
    .message-list {
        padding: 12px;
        gap: 12px;
    }

    .input-area {
        padding: 10px 12px;
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