<template>
  <div class="container">
    <el-card class="notes-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="card-header-left">
            <el-button type="danger" @click="deleteChecked" v-if="selectedDate === null && checkedNotes.length > 0">删除</el-button>
            <span class="card-title">笔记列表：{{ humanDate }}</span>
          </div>
          <div class="card-header-right">
            <el-input
              v-model="searchQuery"
              placeholder="搜索笔记标题/科目..."
              clearable
              class="search-input"
              :prefix-icon="Search"
            />
            <el-date-picker v-model="selectedDate" type="date" placeholder="选择日期" format="YYYY年MM月DD日"
              value-format="x" @change="handleDateChange(selectedDate)" />
          </div>
        </div>
      </template>

      <!-- 搜索无结果提示 -->
      <el-empty v-if="searchQuery && displayNotes.length === 0" description="没有找到匹配的笔记" />
      <el-empty v-else-if="displayNotes.length === 0" description="暂无笔记" />

      <el-collapse v-model="openSubjects" v-if="displayNotes.length > 0">
        <el-collapse-item v-for="subject in filteredSubjects" :title="subject" :key="subject" :name="subject">
          <template #title>
            <div style="display: flex; align-items: center;">
              <el-checkbox v-if="selectedDate === null" :model-value="isSubjectChecked(subject)"
                :indeterminate="isSubjectIndeterminate(subject)"
                @change="handleSubjectCheck(subject, $event)" style="margin-right: 8px;" @click.stop />
              <span style="flex: 1; cursor: pointer;">{{ subject }}</span>
            </div>
          </template>
          <template v-for="note in displayNotes" :key="note.title">
            <div v-if="note.subject === subject" style="display: flex; align-items: center;">
              <el-checkbox v-if="selectedDate === null" :model-value="checkedNotes.includes(note.title)"
                @change="handleNoteCheck(note.title, $event)" style="margin-right: 8px;" />
              <el-link type="primary" @click="seeDetail(note.title)">{{ note.title }}</el-link>
            </div>
          </template>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ViewNote' })
import { Search } from '@element-plus/icons-vue'
import { useViewNote } from '@/hooks/useViewNote'
import { useCacheStore } from '@/stores/cache'
import { storeToRefs } from 'pinia'

const cacheStore = useCacheStore()
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
</script>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px 10px;
  font-family: var(--el-font-family);
}

.notes-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.search-input {
  width: 220px;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .card-header-left,
  .card-header-right {
    width: 100%;
  }

  .search-input {
    width: 100%;
  }

  .card-header-right .el-date-picker {
    width: 100%;
  }

  .card-title {
    font-size: 17px;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 15px 8px;
  }

  .card-title {
    font-size: 15px;
  }

  .card-header-left .el-button {
    font-size: 12px;
    padding: 7px 12px;
  }
}
</style>