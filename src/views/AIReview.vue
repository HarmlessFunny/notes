<template>
    <div class="container">
        <div v-if="!configured" class="unconfigured-hint">
            <el-icon :size="48" color="var(--el-text-color-placeholder)"><ChatDotRound /></el-icon>
            <h3>AI 功能未配置</h3>
            <p>请点击右上角 <el-icon><Setting /></el-icon> 按钮设置 API 配置</p>
        </div>
        <template v-else>
        <div class="message-list">
            <template v-for="(message, index) in chatMessages" :key="index">
                <div v-if="message.role !== 'system'" :class="['message-item', message.role]">
                    <div class="message-content">
                        <template v-if="typeof message.content === 'string'">
                            <MarkdownRenderer class="message-text" :content="message.content" />
                        </template>
                        <template v-else>
                            <template v-for="(part, pi) in message.content" :key="pi">
                                <MarkdownRenderer v-if="part.type === 'text'" class="message-text" :content="part.text" />
                                <el-image v-else-if="part.type === 'image_url'" :src="part.image_url.url" class="chat-image" :preview-src-list="[part.image_url.url]" preview-teleported />
                            </template>
                        </template>
                        <div v-if="message.role === 'user'" class="message-actions">
                            <el-icon class="action-btn delete-btn" title="删除该对话及之后" @click.stop="truncateMessages(index)">
                                <Delete />
                            </el-icon>
                        </div>
                        <div v-if="message.role === 'assistant' && !sending" class="message-actions">
                            <el-icon class="action-btn" title="重新生成" @click.stop="retryMessage(index)">
                                <Refresh />
                            </el-icon>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <div class="input-area">
            <div v-if="selectedImages.length" class="image-preview-list">
                <div v-for="(img, idx) in selectedImages" :key="idx" class="image-preview-item">
                    <el-image :src="img.preview" class="image-preview-thumb" :preview-src-list="[img.preview]" preview-teleported />
                    <el-icon class="remove-image-btn" @click="removeImage(idx)"><Close /></el-icon>
                </div>
            </div>
            <div class="input-row">
                <el-button v-if="visionEnabled" :icon="Picture" circle @click="triggerUpload" :disabled="sending || uploading" />
                <input v-if="visionEnabled" ref="fileInputRef" type="file" multiple accept="image/*" class="hidden-input" @change="onFileChange" />
                <el-input v-model="inputMessage" :rows="1" placeholder="输入您的问题..." class="message-input"
                    @keydown.enter="sendMessage" />
                <el-button type="primary" class="send-btn" :icon="Top" @click="sendMessage" :loading="sending"
                    :disabled="(!inputMessage.trim() && !selectedImages.length) || sending || uploading">
                    {{ uploading ? '上传中...' : '发送' }}
                </el-button>
            </div>
        </div>
        </template>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AIReview' })
import { ref, computed, onMounted, onActivated } from 'vue'
import { Top, Delete, Picture, Close, Refresh, ChatDotRound, Setting } from '@element-plus/icons-vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useAIReview } from '@/hooks/useAIReview'
import { useCacheStore } from '@/stores/cache'

const store = useCacheStore()
const visionEnabled = computed(() => store.visionEnabled)
const configured = computed(() => !!store.aiConfig.apiKey && !!store.aiConfig.baseUrl && !!store.aiConfig.modelName)

const {
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
} = useAIReview()

const fileInputRef = ref<HTMLInputElement>()

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
    loadChat()
})
onActivated(loadChat)
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
    padding: 20px 20px 80px;
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
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
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
        padding: 12px 12px 70px;
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
