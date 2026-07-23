<template>
  <div id="app">
    <!-- 导航栏 -->
    <div class="navbar-wrapper">
      <el-menu mode="horizontal" :default-active="routeNameForMenu" class="navbar" @select="handleMenuSelect">
        <el-menu-item index="publish">
          <el-icon>
            <Edit />
          </el-icon>
          <span>{{ $t('app.publish') }}</span>
        </el-menu-item>
        <el-menu-item index="view">
          <el-icon>
            <Notebook />
          </el-icon>
          <span>{{ $t('app.view') }}</span>
        </el-menu-item>
        <el-menu-item v-if="cacheStore.aiAvailable" index="aiReview">
          <el-icon>
            <ChatDotRound />
          </el-icon>
          <span>{{ $t('app.aiChat') }}</span>
        </el-menu-item>
      </el-menu>
      <div class="navbar-actions">
        <el-tooltip :content="$t('app.settings')" placement="bottom">
          <el-button class="action-icon-btn" :icon="Setting" text @click="showSettings = true" />
        </el-tooltip>
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
    <SettingsDialog v-model:visible="showSettings" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'App' })
import { ref, computed, onMounted, watch } from 'vue'
import { Edit, Notebook, ChatDotRound, Setting } from '@element-plus/icons-vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLocale } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import enLocale from 'element-plus/es/locale/lang/en'
import { useCacheStore } from '@/stores/cache'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { checkForUpdate } from '@/utils/updateChecker'
import type { UpdateInfo } from '@/utils/updateChecker'

const cacheStore = useCacheStore()
const { locale: elLocale } = useLocale()
const i18nLocale = useI18n()

watch(() => i18nLocale.locale.value, (lang) => {
  elLocale.value = (lang as string).startsWith('zh') ? zhCn : enLocale
}, { immediate: true })
const showSettings = ref(false)

const router = useRouter()
const route = useRoute()

const routeNameForMenu = computed(() => {
  const name = route.name as string
  if (name === 'viewDetail') return 'view'
  return name
})

onMounted(() => {
  cacheStore.loadAiStatus()
  if (!cacheStore.autoUpdate) return
  checkForUpdate().then((update: UpdateInfo | null) => {
    if (update) {
      ElMessageBox.alert(
        `${i18nLocale.t('update.latestVersion')}: ${update.latestVersion}`,
        i18nLocale.t('update.found'),
        {
          confirmButtonText: i18nLocale.t('update.download'),
          callback: async (action: string) => {
            if (action === 'confirm') {
              try {
                await openUrl(update.downloadUrl)
              } catch {
                const a = document.createElement('a')
                a.href = update.downloadUrl
                a.target = '_blank'
                a.rel = 'noopener noreferrer'
                a.click()
              }
            }
          },
        },
      )
    }
  })
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
  min-height: 0;
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
