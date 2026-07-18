<template>
  <el-card class="form-card" shadow="hover" @keydown.ctrl.s.prevent="handleSubmit" @keydown.meta.s.prevent="handleSubmit">
    <template #header>
      <span class="card-title">{{ title }}</span>
    </template>

    <el-form :model="formData" label-width="80px">
      <el-form-item label="标题" required>
        <el-input v-model="formData.title" placeholder="输入笔记标题" clearable />
      </el-form-item>

      <el-form-item label="科目" required>
        <el-select v-model="formData.subject" placeholder="选择科目" filterable clearable allow-create default-first-option>
          <el-option v-for="subject in subjectsList" :key="subject" :label="subject" :value="subject" />
        </el-select>
      </el-form-item>

      <el-form-item label="笔记内容">
        <div class="editor-body split">
          <el-input v-model="formData.content" placeholder="输入笔记内容（可选）" type="textarea" :rows="1" show-word-limit
            maxlength="50000" autosize class="editor-input" />
          <div class="preview-area">
            <MarkdownRenderer v-if="formData.content" :content="formData.content" />
          </div>
        </div>
      </el-form-item>

      <el-form-item label="选择图片">
        <el-upload :auto-upload="false" :on-change="handleFileChange" :on-remove="handleFileRemove"
          :on-preview="handleFilePreview" :file-list="fileList" accept="image/*" multiple list-type="picture-card">
          <el-icon>
            <Plus />
          </el-icon>
        </el-upload>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleSubmit" :disabled="!canSubmit" :loading="submitting"
          :icon="Paperclip">
          {{ submitButtonText }}
        </el-button>
        <el-button v-if="showCancelButton" @click="handleCancel">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>

  <el-image-viewer v-if="showPreview" :url-list="fileList.map(item => item.url || '')" show-progress
    :initial-index="previewIndex" @close="closePreview" />
</template>

<script setup lang="ts">
defineOptions({ name: 'NoteForm' })
import { onMounted, watch, computed, ref } from 'vue'
import { Plus, Paperclip } from '@element-plus/icons-vue'
import type { NoteFormData, UploadFile } from '@/types'
import { useNotesStore } from '@/stores/notes'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const notesStore = useNotesStore()
const subjectsList = computed(() => notesStore.subjectsList)

interface Props {
  title?: string
  submitButtonText?: string
  showCancelButton?: boolean
  initialData?: Partial<NoteFormData>
  initialImages?: string[]
  loading?: boolean
  // 外部传入的 hook，用于共享状态
  usePublishNote?: ReturnType<typeof import('@/hooks/usePublishNote').usePublishNote> | null
}

interface Emits {
  (e: 'submit', formData: NoteFormData, fileList: UploadFile[]): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  title: '发布新笔记',
  submitButtonText: '发布笔记',
  showCancelButton: false,
  loading: false,
  usePublishNote: null
})

const emit = defineEmits<Emits>()

// 使用外部 hook 或创建内部 hook
const hook = props.usePublishNote

// 表单数据
const formData = hook?.formData ?? ref<NoteFormData>({
  title: '',
  subject: '',
  content: ''
})

const canSubmit = hook?.canSubmit ?? computed(() => {
  const hasTitle = !!formData.value.title.trim()
  const hasSubject = !!formData.value.subject.trim()
  return hasTitle && hasSubject
})

const fileList = hook?.fileList ?? ref<UploadFile[]>([])
const previewIndex = hook?.previewIndex ?? ref(0)
const showPreview = hook?.showPreview ?? ref(false)
const submitting = hook?.submitting ?? ref(false)

const handleFileChange = hook?.handleFileChange ?? ((file: UploadFile, newFileList: UploadFile[]) => {
  fileList.value = newFileList
  if (file.raw && !file.url) {
    file.url = URL.createObjectURL(file.raw)
  }
})

const handleFileRemove = hook?.handleFileRemove ?? ((file: UploadFile, newFileList: UploadFile[]) => {
  fileList.value = newFileList
  if (file.url) URL.revokeObjectURL(file.url)
})

const handleFilePreview = hook?.handleFilePreview ?? ((file: UploadFile) => {
  previewIndex.value = fileList.value.indexOf(file)
  showPreview.value = true
})

const clearFiles = hook?.clearFiles ?? (() => {
  fileList.value.forEach((item: UploadFile) => {
    if (item.url) URL.revokeObjectURL(item.url)
  })
  fileList.value = []
})

const closePreview = hook?.closePreview ?? (() => {
  showPreview.value = false
})

const resetForm = hook?.resetForm ?? (() => {
  formData.value = { title: '', subject: '', content: '' }
})

const initForm = () => {
  if (props.initialData) {
    Object.assign(formData.value, props.initialData)
  }
  if (props.initialImages) {
    clearFiles()
    props.initialImages.forEach((img: string) => {
      fileList.value.push({
        uid: Date.now() + Math.floor(Math.random() * 10000),
        name: img,
        url: `${(window as any).__API_BASE__ || ''}/uploads/images/${img}`,
        status: 'success'
      })
    })
  }
}

const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', formData.value, fileList.value)
}

const handleCancel = () => {
  emit('cancel')
  resetForm()
  clearFiles()
}

onMounted(() => {
  initForm()
  if (!hook) {
    fileList.value.forEach(item => {
      if (item.raw) {
        if (item.url) URL.revokeObjectURL(item.url)
        item.url = URL.createObjectURL(item.raw)
      }
    })
  }
})

watch(() => [props.initialData, props.initialImages], () => initForm(), { deep: true })

defineExpose({ resetForm, clearFiles })
</script>

<style scoped>
.card-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

:deep(.el-upload-list__item-thumbnail) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.editor-body.split {
  display: flex;
  gap: 12px;
  min-height: 200px;
  width: 100%;
}

.editor-body.split .editor-input {
  width: calc(50% - 6px);
  min-width: 0;
}

.editor-body.split .preview-area {
  width: calc(50% - 6px);
  min-width: 0;
}

.editor-body :deep(.el-textarea__inner) {
  min-height: 200px !important;
}

.preview-area {
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  overflow-y: auto;
  max-height: 600px;
  background: var(--el-bg-color-page);
}

.preview-area :deep(.markdown-body) {
  background-color: transparent !important;
}

@media (max-width: 768px) {
  :deep(.el-form-item) {
    flex-wrap: wrap;
  }

  :deep(.el-form-item__label) {
    width: auto !important;
    padding-bottom: 4px;
  }

  :deep(.el-form-item__content) {
    margin-left: 0 !important;
    width: 100%;
  }

  .editor-body.split {
    flex-direction: column;
  }

  .editor-body.split .editor-input,
  .editor-body.split .preview-area {
    width: 100%;
  }

  .editor-body.split .preview-area {
    max-height: 400px;
  }
}

@media (max-width: 480px) {
  .card-title {
    font-size: 17px;
  }

  :deep(.el-upload--picture-card) {
    width: 80px;
    height: 80px;
  }

  :deep(.el-upload-list--picture-card .el-upload-list__item) {
    width: 80px;
    height: 80px;
  }

  :deep(.el-upload-list--picture-card) {
    grid-template-columns: repeat(auto-fill, 80px);
  }

}
</style>
