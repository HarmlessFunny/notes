<template>
  <el-dialog v-model="visible" title="发现新版本" width="420px" align-center append-to-body :close-on-click-modal="false">
    <p class="update-tip">新版本 {{ info?.latestVersion }} 已发布，是否前往下载？</p>
    <template #footer>
      <el-button @click="visible = false">{{ cancelText }}</el-button>
      <el-button type="primary" plain @click="openMirror">国内镜像</el-button>
      <el-button type="primary" @click="openDownload">前往下载</el-button>
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
  { cancelText: '稍后' }
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
