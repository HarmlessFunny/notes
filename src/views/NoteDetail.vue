<template>
    <div v-if="note" class="container">
        <template v-if="!showEditForm">
            <div class="header-section">
                <div class="title-row">
                    <el-button text @click="router.back()" :icon="ArrowLeft" class="back-button">
                        返回
                    </el-button>
                    <el-breadcrumb separator="/">
                        <el-breadcrumb-item>{{ note.subject }}</el-breadcrumb-item>
                        <el-breadcrumb-item>{{ note.title }}</el-breadcrumb-item>
                    </el-breadcrumb>
                </div>
                <div class="header-row">
                    <div class="buttons">
                        <el-button type="warning" @click="handleExportZip" :icon="Document">
                            导出笔记
                        </el-button>
                        <el-button type="primary" @click="showEditForm = true" :icon="Edit">
                            编辑笔记
                        </el-button>
                        <el-button type="danger" @click="deleteCurrentNote" :icon="Delete">
                            删除笔记
                        </el-button>
                    </div>
                </div>
            </div>
            <div>
                <MarkdownRenderer v-if="note.content" class="page-content" :content="note.content" />
            </div>
            <div v-if="note.imgs.length > 0" class="image-container" ref="imagesRef">
                <div v-for="(img, index) in note.imgs" :key="img" class="image-item" :style="itemStyles[index]">
                    <el-image :src="`${baseUrl}/uploads/images/${img}`" alt="Note Image" :initial-index="index"
                        @click="showPreview = true; previewIndex = index" @load="onImageLoaded(index, $event)" />
                </div>
            </div>
        </template>
        <NoteForm v-else title="编辑笔记" submit-button-text="保存修改" show-cancel-button :loading="editSubmitting" :initial-data="{
            title: note!.title,
            subject: note!.subject,
            content: note!.content,
        }" :initial-images="note!.imgs" @submit="handleEditSubmit" @cancel="showEditForm = false" />
    </div>
    <div v-else class="container">
        <el-empty description="笔记不存在，正在跳转..." />
    </div>
    <el-image-viewer v-if="showPreview" :url-list="note!.imgs.map(item => `${baseUrl}/uploads/images/${item}`)" show-progress
        hide-on-click-modal :max-scale="7" :min-scale="0.2" :initial-index="previewIndex" @close="showPreview = false"
        :infinite="false" />
</template>

<script setup lang="ts">
defineOptions({ name: 'NoteDetail' })
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Edit, Delete, ArrowLeft, Document } from '@element-plus/icons-vue'
import NoteForm from '@/components/NoteForm.vue'
import { useNoteDetail } from '@/hooks/useNoteDetail'
import { useWaterfallLayout } from '@/hooks/useWaterfallLayout'
import { exportNoteToZip } from '@/utils/export'

const router = useRouter()
const route = useRoute()

// 图片基础路径（生产环境 Flask 同源服务，直接用相对路径）
const baseUrl = ''

const {
    note,
    showPreview,
    previewIndex,
    showEditForm,
    editSubmitting,
    getNote,
    handleEditSubmit,
    deleteCurrentNote,
} = useNoteDetail()

const imagesRef = ref<HTMLElement | null>(null)

const imagesList = computed(() => note.value?.imgs ?? [])

const { itemStyles, onImageLoaded, resetLayout } = useWaterfallLayout(imagesRef, imagesList)

// 根据路由参数拉取笔记
watch(() => route.params.title, async (newTitle) => {
    if (newTitle) {
        resetLayout()
        await getNote(decodeURIComponent(newTitle as string))
    }
}, { immediate: true })

async function handleExportZip() {
    if (!note.value) return
    await exportNoteToZip(note.value.title)
}
</script>

<style scoped>
.container {
    padding: 40px 20px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.8;
    color: var(--el-text-color-primary);
}

.title-row {
    display: flex;
    align-items: center;
    padding-bottom: 15px;
    border-bottom: 3px solid var(--el-color-primary);
    gap: 12px;
}

.back-button {
    flex-shrink: 0;
    font-size: 1rem !important;
    font-weight: normal !important;
    color: var(--el-color-primary) !important;
}

.back-button :deep(.el-icon) {
    font-size: 1rem !important;
}

.header-section :deep(.el-breadcrumb) {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--el-text-color-primary);
    word-break: break-all;
}

.header-section :deep(.el-breadcrumb__inner) {
    color: var(--el-text-color-primary);
    font-weight: 700;
}

.header-section :deep(.el-breadcrumb__inner):hover {
    color: var(--el-text-color-primary);
    font-weight: 700;
}

.page-content {
    font-size: 1.1rem;
    color: var(--el-text-color-primary);
    margin-bottom: 40px;
    padding: 25px;
    background-color: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    word-break: break-word;
}

.image-container {
    position: relative;
    margin-top: 30px;
    min-height: 100px;
}

.image-item {
    overflow: hidden;
    border-radius: 8px;
    cursor: zoom-in;
    transition: all 0.3s ease;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    background-color: var(--el-fill-color);
}

.image-item:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.image-item :deep(.el-image) {
    width: 100%;
    height: auto;
    display: block;
}

.image-item :deep(.el-image img) {
    width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
}

@media (max-width: 768px) {
    .container {
        padding: 20px 15px;
    }

    .header-section :deep(.el-breadcrumb) {
        font-size: 1.3rem;
    }

    .page-content {
        font-size: 1rem;
        padding: 20px;
    }

    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .buttons .el-button {
        font-size: 13px;
        padding: 7px 12px;
        flex: 1;
        min-width: 100px;
    }
}

@media (max-width: 480px) {
    .container {
        padding: 12px 10px;
    }

    .header-section {
        gap: 10px;
        margin-bottom: 20px;
    }

    .header-row {
        flex-direction: column;
        align-items: flex-start;
    }

    .buttons {
        width: 100%;
        gap: 6px;
    }

    .buttons .el-button {
        flex: 1;
        justify-content: center;
        font-size: 12px;
        padding: 7px 8px;
    }

    .page-content {
        font-size: 0.95rem;
        padding: 14px;
        margin-bottom: 24px;
    }

    .title-row {
        padding-bottom: 10px;
    }

    .back-button {
        font-size: 0.85rem !important;
    }

    .header-section :deep(.el-breadcrumb) {
        font-size: 1.1rem;
    }
}

.header-section {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-bottom: 30px;
}

.header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
}

.buttons {
    display: flex;
    gap: 10px;
}

.buttons .el-button {
    margin: auto;
}

.dark .title-row {
    border-bottom-color: var(--el-border-color);
}
</style>
