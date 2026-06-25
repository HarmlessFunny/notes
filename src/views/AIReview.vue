<template>
    <div class="container">
        <el-card class="ai-card" shadow="hover">
            <template #header>
                <div class="card-header">
                    <span class="card-title">AI 复习</span>
                </div>
            </template>

            <div class="chat-container">
                <div ref="messageListRef" class="message-list">
                    <template v-for="(message, index) in chatMessages" :key="index">
                        <div v-if="message.role !== 'system'" :class="['message-item', message.role]">
                            <div class="avatar">
                                <el-avatar v-if="message.role === 'user'" icon="User" :size="40" />
                                <el-avatar v-else icon="Bot" :size="40" class="assistant-avatar" />
                            </div>
                            <div class="message-content">
                                <div class="message-name">
                                    {{ message.role === 'user' ? '我' : 'AI助手' }}
                                </div>
                                <MarkdownRenderer class="message-text" :content="message.content" />
                                <div class="message-actions">
                                    <el-icon class="delete-btn" title="删除该对话及之后" @click.stop="truncateMessages(index)">
                                        <Delete />
                                    </el-icon>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>

            <div class="input-area">
                <el-input v-model="inputMessage" :rows="3" placeholder="输入您的问题..." class="message-input"
                    @keydown.enter="sendMessage" />
                <el-button type="primary" class="send-btn" :icon="Top" @click="sendMessage" :loading="sending">
                    发送
                </el-button>
            </div>
        </el-card>
    </div>
</template>

<script setup lang="ts" name="AIReview">
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
    max-width: 1200px;
    margin: 0 auto;
    padding: 30px 10px;
    font-family: var(--el-font-family);
}

.ai-card {
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    position: relative;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
}

.card-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    white-space: nowrap;
}

.chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 500px;
}

.message-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.message-item {
    display: flex;
    gap: 12px;
}

.message-item.user {
    flex-direction: row-reverse;
}

.message-item.user .message-content {
    align-items: flex-end;
}

.message-item.user .message-text {
    background: var(--el-color-primary);
    color: white;
    border-radius: 12px 12px 0 12px;
}

.avatar {
    flex-shrink: 0;
}

.assistant-avatar {
    background: var(--el-color-primary);
}

.message-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 70%;
}

.message-name {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
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

.input-area {
    padding: 16px 20px;
    border-top: 1px solid var(--el-border-color-light);
    display: flex;
    gap: 12px;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--el-bg-color);
}

.message-input {
    flex: 1;
}

.send-btn {
    align-self: flex-end;
    padding: 0 24px;
}

@media (max-width: 768px) {
    .card-header {
        flex-direction: column;
        align-items: stretch;
    }

    .message-content {
        max-width: 85%;
    }

    .chat-container {
        height: 400px;
    }

    .input-area {
        padding: 12px 16px;
    }
}

@media (max-width: 480px) {
    .container {
        padding: 12px 6px;
    }

    .chat-container {
        height: calc(100vh - 220px);
        min-height: 300px;
    }

    .message-list {
        padding: 12px;
        gap: 14px;
    }

    .message-content {
        max-width: 90%;
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
