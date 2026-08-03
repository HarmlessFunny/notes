<template>
  <el-dialog v-model="visible" :title="$t('update.found')" width="420px" align-center append-to-body :close-on-click-modal="false">
    <p class="update-tip">{{ $t('update.body', { version: info?.latestVersion }) }}</p>
    <template #footer>
      <el-button @click="visible = false">{{ $t(cancelText) }}</el-button>
      <el-button type="primary" plain @click="openMirror">{{ $t('update.mirror') }}</el-button>
      <el-button type="primary" @click="openDownload">{{ $t('update.download') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: 'UpdateDialog' })
import { computed } from 'vue'
import type { UpdateInfo } from '@/utils/update'
import { openDownloadUrl } from '@/utils/update'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    info: UpdateInfo | null
    cancelText?: string
  }>(),
  { cancelText: 'update.later' }
)
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

function openDownload() {
  if (!props.info) return
  visible.value = false
  openDownloadUrl(props.info.downloadUrl)
}

function openMirror() {
  if (!props.info) return
  visible.value = false
  openDownloadUrl(props.info.mirrorUrl)
}
</script>

<style scoped>
.update-tip {
  margin: 0;
  color: var(--el-text-color-regular);
}
</style>
