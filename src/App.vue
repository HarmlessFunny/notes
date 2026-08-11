<template>
  <el-config-provider :locale="elLocale">
  <div id="app">
    <!-- 导航栏 -->
    <div class="navbar-wrapper" :class="{ 'navbar-hidden': navHidden }">
      <el-menu mode="horizontal" :default-active="activeMenuIndex" class="navbar" @select="handleMenuSelect">
        <el-menu-item index="publish">
          <el-icon>
            <Edit />
          </el-icon>
          <span>{{ $t('nav.publish') }}</span>
        </el-menu-item>
        <el-menu-item index="view">
          <el-icon>
            <Notebook />
          </el-icon>
          <span>{{ $t('nav.view') }}</span>
        </el-menu-item>
        <el-menu-item v-if="cacheStore.aiAvailable" index="aiReview">
          <el-icon>
            <ChatDotRound />
          </el-icon>
          <span>{{ $t('nav.aiChat') }}</span>
        </el-menu-item>
      </el-menu>
      <div class="navbar-actions">
        <el-tooltip :content="$t('nav.settings')" placement="bottom">
          <el-button class="action-icon-btn" :icon="Setting" text @click="handleOpenSettings" />
        </el-tooltip>
      </div>
    </div>

    <!-- 路由出口 -->
    <main class="main-content" :class="{ 'fill-navbar-space': navHidden && $route.name === 'aiReview' }">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['AIReview']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    <UpdateDialog v-model="showUpdate" :info="updateInfo" cancel-text="update.later" />
  </div>
  </el-config-provider>
</template>

<script setup lang="ts">
defineOptions({ name: 'App' })
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Edit, Notebook, ChatDotRound, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useCacheStore } from '@/stores/cache'
import UpdateDialog from '@/components/UpdateDialog.vue'
import { checkForUpdate, type UpdateInfo } from '@/utils/update'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const cacheStore = useCacheStore()
const showUpdate = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)

const elLocale = computed(() => (cacheStore.effectiveLocale === 'zh-CN' ? zhCn : en))

const router = useRouter()

// 导航栏选中项：笔记详情页归属“查看笔记”
const activeMenuIndex = computed(() => {
  const name = router.currentRoute.value.name as string
  return name === 'viewDetail' ? 'view' : name
})

const navHidden = ref(false)
let lastScrollY = 0
let suppressUntil = 0

function handleScroll(e: Event) {
  const target = e.target
  // 文本域内部滚动不应触发导航栏隐藏
  if (target instanceof HTMLTextAreaElement) return
  const y = target instanceof HTMLElement ? target.scrollTop : window.scrollY
  // 隐藏/显示导致的布局变化（AI 页 margin 过渡撑大消息列表）会触发 scrollTop 钳制，
  // 产生伪滚动事件，此时忽略方向判断，避免导航栏来回弹跳
  if (performance.now() < suppressUntil) {
    lastScrollY = y
    return
  }
  if (y > 100 && y > lastScrollY) {
    if (!navHidden.value) suppressUntil = performance.now() + 400
    navHidden.value = true
  } else if (y < lastScrollY || y <= 100) {
    if (navHidden.value) suppressUntil = performance.now() + 400
    navHidden.value = false
  }
  lastScrollY = y
}

// 启动时检查 AI 是否可用（决定是否展示 AI 对话菜单）
onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
  cacheStore.loadAiStatus()
  checkSilentUpdate()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll, { capture: true })
})

// 路由切换后恢复导航栏显示（避免带着隐藏状态进入新页面）
watch(() => router.currentRoute.value.name, () => {
  navHidden.value = false
  lastScrollY = 0
})

async function checkSilentUpdate() {
  const info = await checkForUpdate(false)
  if (!info) return
  updateInfo.value = info
  showUpdate.value = true
}

function handleOpenSettings() {
  router.push('/settings/base')
}

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
  height: 100vh;
  background-color: var(--el-bg-color-page);
}

.navbar-wrapper * {
  user-select: none;
}

.navbar-wrapper {
  position: sticky;
  top: 0;
  z-index: 1000;
  transition: transform 0.25s ease;
}

.navbar-wrapper.navbar-hidden {
  transform: translateY(-100%);
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
  transition: margin-top 0.25s ease;
}

/* 仅在 AI 对话页（窗口不滚动、页面内容直接占满）隐藏导航栏时，
     上移内容填补导航栏空出的空间；其他页面由滚动内容自然填充 */
.main-content.fill-navbar-space {
  margin-top: -60px;
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
