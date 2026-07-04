<template>
  <div class="container">
    <NoteForm ref="noteFormRef" title="发布新笔记" submit-button-text="发布笔记" :use-publish-note="publishNoteHook"
      @submit="handleFormSubmit" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'PublishNote' })
import { ref } from 'vue'
import NoteForm from '@/components/NoteForm.vue'
import type { FormData, UploadFile } from '@/types'
import { usePublishNote } from '@/hooks/usePublishNote'

const publishNoteHook = usePublishNote()
const noteFormRef = ref<InstanceType<typeof NoteForm> | null>(null)

const handleFormSubmit = async (_formData: FormData, _fileList: UploadFile[]) => {
  const success = await publishNoteHook.submitForm()
  if (success && noteFormRef.value) {
    noteFormRef.value.resetForm?.()
    noteFormRef.value.clearFiles?.()
  }
}
</script>

<style scoped>
.container {
  padding: 30px 10px;
  font-family: var(--el-font-family);
}

.page-title {
  text-align: center;
  color: var(--el-text-color-primary);
  margin-bottom: 30px;
  font-size: 32px;
  font-weight: 600;
}

.status-container {
  margin-top: 20px;
}

@media (max-width: 480px) {
  .container {
    padding: 15px 8px;
  }
}
</style>
