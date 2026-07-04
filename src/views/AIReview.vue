<template>
    <div class="container">
        <el-card class="ai-card" shadow="hover">
            <div class="chat-container">
                <div class="message-list">
                    <template v-for="(message, index) in chatMessages" :key="index">
                        <div v-if="message.role !== 'system'" :class="['message-item', message.role]">
                            <div class="message-content">
                                <MarkdownRenderer class="message-text" :content="message.content" />
                                <div v-if="message.role === 'user'" class="message-actions">
                                    <el-icon class="delete-btn" title="删除该对话及之后" @click.stop="truncateMessages(index)">
                                        <Delete />
                                    </el-icon>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </el-card>

        <div class="input-area">
            <el-input v-model="inputMessage" :rows="3" placeholder="输入您的问题..." class="message-input"
                @keydown.enter="sendMessage" />
            <el-button type="primary" class="send-btn" :icon="Top" @click="sendMessage" :loading="sending"
                :disabled="!inputMessage.trim()">
                发送
            </el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AIReview' })
import { onMounted, onActivated } from 'vue'
import { Top, Delete } from '@element-plus/icons-vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useAIReview } from '@/hooks/useAIReview'

const {
    chatMessages,
    inputMessage,
    sending,
    loadChat,
    sendMessage,
    truncateMessages,
} = useAIReview()

onMounted(loadChat)
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
}

.ai-card {
    margin: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    border: none;
    box-shadow: none;
}

.ai-card :deep(.el-card__body) {
    padding: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}

.message-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px 20px 120px;
    display: flex;
    flex-direction: column;
    gap: 20px;
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
}

.message-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 100%;
}

.message-text {
    padding: 12px 16px;
    background: var(--el-bg-color-page);
    border-radius: 12px 12px 12px 0;
    line-height: 1.6;
    word-break: break-word;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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

.delete-btn {
    font-size: 14px;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
}

.delete-btn:hover {
    color: var(--el-color-danger);
}

.message-text :deep(img) {
    max-height: 300px;
    width: auto;
    object-fit: contain;
}

.input-area {
    padding: 16px 20px;
    display: flex;
    gap: 12px;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--el-bg-color);
    border-top: 1px solid var(--el-border-color-light);
}

.message-input {
    flex: 1;
}

.send-btn {
    align-self: flex-end;
    padding: 0 24px;
}

@media (max-width: 768px) {
    .input-area {
        padding: 12px 16px;
    }
}

@media (max-width: 480px) {
    .message-list {
        padding: 12px 12px 110px;
        gap: 14px;
    }

    .message-text {
        padding: 10px 12px;
        font-size: 14px;
    }

    .input-area {
        padding: 10px 12px;
        gap: 8px;
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
