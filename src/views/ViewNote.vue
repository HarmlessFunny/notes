<template>
  <div class="container">
    <el-card class="notes-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ humanDate }}</span>
          <el-date-picker v-model="selectedDate" type="date" :placeholder="$t('notes.pickDate')" :format="dateFormat" value-format="x"
            @change="handleDateChange(selectedDate)" />
        </div>
      </template>

      <div class="notes-toolbar">
        <el-input ref="searchInputRef" v-model="searchQuery" :placeholder="$t('notes.searchPlaceholder')" clearable class="search-input"
          :prefix-icon="Search" />
        <div class="toolbar-actions">
          <el-button type="success" @click="handleImport" :icon="Upload">{{ $t('notes.import') }}</el-button>
          <template v-if="selectedDate === null && checkedNotes.length > 0">
            <el-button type="warning" @click="handleExportChecked" :icon="Download" :loading="exportLoading" :disabled="exportLoading">{{ $t('notes.export') }}</el-button>
            <el-button type="danger" @click="deleteChecked" :icon="Delete">{{ $t('notes.delete') }}</el-button>
          </template>
        </div>
      </div>

      <!-- 搜索无结果提示 -->
      <el-empty v-if="searchQuery && displayNotes.length === 0" :description="$t('notes.noMatch')" />
      <el-empty v-else-if="displayNotes.length === 0" :description="$t('notes.empty')" />

      <el-collapse v-model="openSubjects" v-if="displayNotes.length > 0">
        <el-collapse-item v-for="subject in filteredSubjects" :title="subject" :key="subject" :name="subject">
          <template #title>
            <div style="display: flex; align-items: center;">
              <el-checkbox v-if="selectedDate === null" :model-value="isSubjectChecked(subject)"
                :indeterminate="isSubjectIndeterminate(subject)" @change="handleSubjectCheck(subject, $event)"
                @click.stop />
              <span style="margin-left: 8px; flex: 1; cursor: pointer;">{{ subject }}</span>
            </div>
          </template>
          <template v-for="note in displayNotes" :key="note.title">
            <div v-if="note.subject === subject" class="note-item" @click="seeDetail(note.title)">
              <el-checkbox v-if="selectedDate === null" :model-value="checkedNotes.includes(note.title)"
                @change="handleNoteCheck(note.title, $event)" @click.stop />
              <span class="note-link">{{ note.title }}</span>
            </div>
          </template>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ViewNote' })
import { Search, Download, Upload, Delete } from '@element-plus/icons-vue'
import { useViewNote } from '@/hooks/useViewNote'
import { useCacheStore } from '@/stores/cache'
import { useNotesStore } from '@/stores/notes'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { exportNotesToZip } from '@/utils/export'
import { importNotesFromZip } from '@/utils/import'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

const dateFormat = computed(() => (locale.value === 'zh-CN' ? 'YYYY年MM月DD日' : 'YYYY-MM-DD'))

const cacheStore = useCacheStore()
const notesStore = useNotesStore()
const { openSubjects, checkedNotes } = storeToRefs(cacheStore)

const {
  searchQuery,
  displayNotes,
  filteredSubjects,
  selectedDate,
  humanDate,
  handleDateChange,
  seeDetail,
  isSubjectChecked,
  isSubjectIndeterminate,
  handleSubjectCheck,
  handleNoteCheck,
  deleteChecked
} = useViewNote()

const searchInputRef = ref<{ focus: () => void } | null>(null)
const exportLoading = ref(false)

async function handleImport() {
  const ok = await importNotesFromZip()
  if (ok) {
    await notesStore.flashAllNotes()
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

async function handleExportChecked() {
  exportLoading.value = true
  try {
    await exportNotesToZip([...checkedNotes.value])
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => document.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown))
</script>

<style scoped>
.container {
  padding: 15px 10px;
  font-family: var(--el-font-family);
}

.notes-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.notes-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.search-input {
  width: 220px;
}

.note-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.note-item:hover {
  background-color: var(--el-fill-color-light);
}

.note-link {
  color: var(--el-text-color-regular);
  font-size: 15px;
  margin-left: 8px;
  transition: color 0.2s;
}

.note-item:hover .note-link {
  color: var(--el-color-primary);
}

@media (max-width: 768px) {
  .notes-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    width: 100%;
  }

  .card-header .el-date-picker {
    width: 100%;
  }

  .toolbar-actions {
    margin-left: 0;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 15px 8px;
  }

  .card-title {
    font-size: 17px;
  }
}
</style>