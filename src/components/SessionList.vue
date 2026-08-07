<template>
    <div class="session-panel">
        <div class="session-header">
            <span class="session-header-label">{{ $t('ai.session.sessions') }}</span>
            <el-button type="primary" size="small" :icon="Plus" :disabled="disabled" @click="$emit('create')">
                {{ $t('ai.session.newChat') }}
            </el-button>
        </div>
        <div class="session-list">
            <el-empty v-if="sessions.length === 0" :description="$t('ai.session.empty')" :image-size="56" />
            <div v-for="s in sessions" :key="s.id" class="session-item" :class="{ active: s.id === activeId }" @click="select(s)">
                <el-input v-if="editingId === s.id" ref="renameInputRef" v-model="editingTitle" size="small"
                    :placeholder="$t('ai.session.renamePlaceholder')" class="rename-input" @click.stop
                    @keyup.enter="confirmRename" @keyup.esc="cancelRename" @blur="confirmRename" />
                <template v-else>
                    <span class="session-title">{{ s.title || $t('ai.session.defaultTitle') }}</span>
                    <div class="session-actions" @click.stop>
                        <el-icon :title="$t('ai.session.rename')" class="session-icon" @click="startRename(s)">
                            <EditPen />
                        </el-icon>
                        <el-icon :title="$t('ai.session.delete')" class="session-icon danger" @click="remove(s)">
                            <Delete />
                        </el-icon>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SessionList' })
import { ref, nextTick } from 'vue'
import { Plus, EditPen, Delete } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { AiSession } from '@/types'

const props = defineProps<{
    sessions: AiSession[]
    activeId: string | null
    disabled?: boolean
}>()

const emit = defineEmits<{
    (e: 'create'): void
    (e: 'switch', id: string): void
    (e: 'rename', id: string, title: string): void
    (e: 'delete', id: string): void
}>()

const { t } = useI18n()

const editingId = ref<string | null>(null)
const editingTitle = ref('')
const renameInputRef = ref<{ focus: () => void } | null>(null)

function select(s: AiSession) {
    if (editingId.value === s.id) return
    if (props.disabled) return
    emit('switch', s.id)
}

function startRename(s: AiSession) {
    if (props.disabled) return
    editingId.value = s.id
    editingTitle.value = s.title
    nextTick(() => renameInputRef.value?.focus())
}

function cancelRename() {
    editingId.value = null
    editingTitle.value = ''
}

function confirmRename() {
    const id = editingId.value
    if (!id) return
    const title = editingTitle.value.trim()
    editingId.value = null
    editingTitle.value = ''
    if (title) emit('rename', id, title)
}

async function remove(s: AiSession) {
    if (props.disabled) return
    try {
        const ok = await ElMessageBox.confirm(t('ai.session.deleteConfirm'), t('common.warning'), {
            confirmButtonText: t('common.confirm'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
        }).then(() => true).catch(() => false)
        if (!ok) return
    } catch {
        return
    }
    emit('delete', s.id)
}
</script>

<style scoped>
.session-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
    flex-shrink: 0;
}

.session-header-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
}

.session-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
}

.session-item {
    display: flex;
    align-items: center;
    padding: 0 8px;
    height: 38px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.15s;
}

.session-item:hover {
    background-color: var(--el-fill-color-light);
}

.session-item.active {
    background-color: var(--el-color-primary-light-9);
}

.session-item.active .session-title {
    color: var(--el-color-primary);
    font-weight: 600;
}

.session-title {
    flex: 1;
    font-size: 14px;
    color: var(--el-text-color-regular);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
}

.session-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
    flex-shrink: 0;
}

.session-item:hover .session-actions,
.session-item.active .session-actions {
    opacity: 1;
}

.session-icon {
    font-size: 15px;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
}

.session-icon:hover {
    color: var(--el-color-primary);
    background-color: var(--el-fill-color);
}

.session-icon.danger:hover {
    color: var(--el-color-danger);
}

.rename-input {
    flex: 1;
}

.rename-input :deep(.el-input__wrapper) {
    padding: 0 6px;
}
</style>