<template>
    <div class="thinking-block">
        <div class="thinking-header" @click="toggle">
            <el-icon :size="12"><Cpu /></el-icon>
            <span>{{ t('ai.thinking') }}</span>
            <el-icon :size="12" class="thinking-toggle-icon">
                <ArrowDown v-if="isExpanded" />
                <ArrowRight v-else />
            </el-icon>
        </div>
        <div v-show="isExpanded" class="thinking-body">{{ thinking }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Cpu, ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
    thinking: string
    autoExpand?: boolean
}>()

const { t } = useI18n()

const expanded = ref(false)
function toggle() {
    expanded.value = !expanded.value
}

const isExpanded = computed(() => expanded.value || (props.autoExpand && !!props.thinking))
</script>

<style scoped>
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
</style>