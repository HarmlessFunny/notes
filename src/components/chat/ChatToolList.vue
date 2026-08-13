<template>
    <div class="tool-list">
        <div v-for="tool in tools" :key="`${tool.round}-${tool.name}`" class="tool-card" :class="{ failed: !tool.success }">
            <el-icon :size="13"><Cpu /></el-icon>
            <span class="tool-name">{{ toolNames[tool.name] ?? tool.name }}</span>
            <span class="tool-args" :title="JSON.stringify(tool.arguments)">{{ formatArgs(tool) }}</span>
            <span v-if="!tool.success || !isMutationTool(tool.name)" class="tool-summary">{{ tool.summary }}</span>
            <span class="tool-status" :class="tool.success ? 'ok' : 'bad'">{{ tool.success ? '✓' : '✗' }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Cpu } from '@element-plus/icons-vue'
import { useChatTools } from '@/composables/useChatTools'
import type { ToolCallInfo } from '@/utils/stream'

defineProps<{
    tools: ToolCallInfo[]
}>()

const { toolNames, isMutationTool, formatArgs } = useChatTools()
</script>

<style scoped>
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
</style>