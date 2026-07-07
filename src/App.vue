<template>
  <div id="app">
    <!-- 导航栏 -->
    <div class="navbar-wrapper">
      <el-menu mode="horizontal" :default-active="$route.name as string" class="navbar" @select="handleMenuSelect">
        <el-menu-item index="publish">
          <el-icon>
            <Edit />
          </el-icon>
          <span>发布笔记</span>
        </el-menu-item>
        <el-menu-item index="view">
          <el-icon>
            <Notebook />
          </el-icon>
          <span>查看笔记</span>
        </el-menu-item>
        <el-menu-item v-if="cacheStore.aiAvailable" index="aiReview">
          <el-icon>
            <ChatDotRound />
          </el-icon>
          <span>AI 对话</span>
        </el-menu-item>
      </el-menu>
      <div class="navbar-actions">
        <el-tooltip content="AI 设置" placement="bottom">
          <el-button class="action-icon-btn" :icon="Setting" text @click="showSettings = true" />
        </el-tooltip>
        <el-switch v-model="cacheStore.darkMode" :active-action-icon="Moon" :inactive-action-icon="Sunny" />
      </div>
    </div>

    <!-- 路由出口 -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['AIReview']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    <el-backtop :right="100" :bottom="100" />
    <SettingsDialog v-model:visible="showSettings" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'App' })
import { ref, onMounted } from 'vue'
import { Edit, Notebook, ChatDotRound, Moon, Sunny, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useNotesStore } from '@/stores/notes'
import { useCacheStore } from '@/stores/cache'
import SettingsDialog from '@/components/SettingsDialog.vue'

const notesStore = useNotesStore()
const cacheStore = useCacheStore()
const showSettings = ref(false)

const router = useRouter()

// 启动时检查 AI 是否可用（决定是否展示 AI 对话菜单）
onMounted(() => {
  cacheStore.loadAiStatus()
})

function handleMenuSelect(index: string) {
  switch (index) {
    case 'publish':
      router.push('/publish')
      break
    case 'view':
      router.push('/view/notes/all')
      break
    case 'aiReview':
      router.push('/ai')
      break
    default:
      router.push('/publish')
  }
}
</script>

<style scoped>
#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--el-bg-color-page);
}

.navbar-wrapper * {
  user-select: none;
}

.navbar-wrapper {
  position: sticky;
  top: 0;
  z-index: 1000;
}

.navbar {
  margin: 0;
  border-radius: 0;
  background-color: var(--el-bg-color) !important;
  border-bottom: 1px solid var(--el-border-color-light);
}

.navbar-actions {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.action-icon-btn {
  font-size: 18px;
  color: var(--el-text-color-secondary);
}

.main-content {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .navbar :deep(.el-menu-item) {
    padding: 0 10px;
    font-size: 13px;
  }

  .navbar :deep(.el-menu-item .el-icon) {
    margin-right: 4px;
  }
}

@media (max-width: 480px) {
  .navbar :deep(.el-menu-item) {
    padding: 0 6px;
    font-size: 12px;
    margin: 0 6px;
  }

  .navbar :deep(.el-menu-item span) {
    display: none;
  }

  .navbar :deep(.el-menu-item .el-icon) {
    margin-right: 0;
    font-size: 18px;
  }

  .navbar {
    display: flex;
    /* justify-content: center; */
  }
}
</style>
