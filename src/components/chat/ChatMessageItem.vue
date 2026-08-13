<template>
    <div :class="['message-item', message.role]">
        <div class="message-content">
            <template v-if="typeof message.content === 'string'">
                <ChatThinkingBlock v-if="message.thinking && showThinking" :thinking="message.thinking" :auto-expand="autoExpand" />
                <ChatToolList v-if="message.tools?.length && showThinking" :tools="message.tools" />
                <MarkdownRenderer class="message-text" :content="message.content" :streaming="streaming" />
            </template>
            <template v-else>
                <template v-for="(part, pi) in message.content" :key="pi">
                    <MarkdownRenderer v-if="part.type === 'text'" class="message-text" :content="part.text" :streaming="streaming" />
                    <el-image v-else-if="part.type === 'image_url'" :src="resolveImageUrl(part.image_url.url)" class="chat-image"
                        :preview-src-list="[resolveImageUrl(part.image_url.url)]" preview-teleported />
                </template>
            </template>
            <div v-if="message.role === 'user'" class="message-actions">
                <el-icon class="action-btn" :title="t('ai.copy')" @click.stop="copyMessage">
                    <CopyDocument />
                </el-icon>
                <el-icon class="action-btn delete-btn" :title="t('ai.deleteFromHere')" @click.stop="emit('truncate', index)">
                    <Delete />
                </el-icon>
            </div>
            <div v-if="message.role === 'assistant' && !sending" class="message-actions">
                <el-icon class="action-btn" :title="t('ai.copy')" @click.stop="copyMessage">
                    <CopyDocument />
                </el-icon>
                <el-icon class="action-btn" :title="t('ai.regenerate')" @click.stop="emit('retry', index)">
                    <Refresh />
                </el-icon>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { CopyDocument, Delete, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import ChatThinkingBlock from '@/components/chat/ChatThinkingBlock.vue'
import ChatToolList from '@/components/chat/ChatToolList.vue'
import { resolveImageUrl } from '@/utils/mediaUrl'
import type { ChatMsg } from '@/hooks/useAIReview'

const props = defineProps<{
    message: ChatMsg
    index: number
    sending: boolean
    showThinking: boolean
    streaming: boolean
    autoExpand: boolean
}>()

const emit = defineEmits<{
    truncate: [index: number]
    retry: [index: number]
}>()

const { t } = useI18n()

async function copyMessage() {
    let text = ''
    if (typeof props.message.content === 'string') {
        text = props.message.content
    } else {
        text = props.message.content
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
</script>

<style scoped>
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

@media (max-width: 480px) {
    .message-text {
        padding: 8px 12px;
        font-size: 14px;
    }

    .message-content {
        max-width: 90%;
    }
}
</style>