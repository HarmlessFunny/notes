import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useNotesStore } from '@/stores/notes'
import i18n from '@/i18n'

// 导入组件
import PublishNote from '@/views/PublishNote.vue'
import ViewNote from '@/views/ViewNote.vue'
import NoteDetail from '@/views/NoteDetail.vue'
import AIReview from '@/views/AIReview.vue'
import { useCacheStore } from '@/stores/cache.ts'
import { handleApiError } from '@/utils/error.ts'

const routes: RouteRecordRaw[] = [
  {
    path: '/publish',
    name: 'publish',
    component: PublishNote,
    meta: {
      titleKey: 'route.publish'
    }
  },
  {
    path: '/view/notes/:time',
    name: 'view',
    component: ViewNote,
    meta: {
      titleKey: 'route.view'
    }
  },
  {
    path: '/view/detail/:title',
    name: 'viewDetail',
    component: NoteDetail,
    meta: {
      titleKey: 'route.viewDetail'
    }
  },
  {
    path: '/ai',
    name: 'aiReview',
    component: AIReview,
    meta: {
      titleKey: 'route.ai'
    }
  },
  // 404页面
  {
    path: '/:pathMatch(.*)*',
    redirect: '/view/notes/today'
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

// 全局前置路由守卫：处理页面标题和数据加载
router.beforeEach(async (to, from) => {
  // 设置页面标题
  const titleKey = to.meta.titleKey as string | undefined
  if (titleKey) {
    document.title = i18n.global.t(titleKey)
  }

  // 确保已加载 AI 状态（决定 AI 对话路由是否可访问）
  const cacheStore = useCacheStore()
  if (!cacheStore.aiStatusLoaded) {
    await cacheStore.loadAiStatus()
  }

  // AI 不可用时，拦截 /ai 路由
  if (to.name === 'aiReview' && !cacheStore.aiAvailable) {
    return { name: 'view' }
  }

  // 需要加载笔记数据的路由
  const routesNeedData = ['view', 'viewDetail', 'publish', 'aiReview']

  // 如果是需要数据的路由，并且数据还未加载，则先加载数据
  if (routesNeedData.includes(to.name as string)) {
    const notesStore = useNotesStore()
    if (notesStore.allNotes.length === 0) {
      try {
        await notesStore.flashAllNotes()
      } catch (error) {
        handleApiError(error, i18n.global.t('notes.refreshFailed'))
      }
    }
  }

  return true
})

export default router