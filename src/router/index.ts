import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useNotesStore } from '@/stores/notes'

// 导入组件
import PublishNote from '@/views/PublishNote.vue'
import ViewNote from '@/views/ViewNote.vue'
import NoteDetail from '@/views/NoteDetail.vue'
import AIReview from '@/views/AIReview.vue'
import SettingsLayout from '@/views/settings/SettingsLayout.vue'
import SettingsBase from '@/views/settings/SettingsBase.vue'
import SettingsAi from '@/views/settings/SettingsAi.vue'
import { useCacheStore } from '@/stores/cache.ts'
import { handleApiError } from '@/utils/error.ts'
import { i18n } from '@/locales'

const routes: RouteRecordRaw[] = [
  {
    path: '/publish',
    name: 'publish',
    component: PublishNote,
    meta: {
      title: 'titles.publish'
    }
  },
  {
    path: '/view/notes/:time',
    name: 'view',
    component: ViewNote,
    meta: {
      title: 'titles.view'
    }
  },
  {
    path: '/view/detail/:title',
    name: 'viewDetail',
    component: NoteDetail,
    meta: {
      title: 'titles.detail'
    }
  },
  {
    path: '/ai',
    name: 'aiReview',
    component: AIReview,
    meta: {
      title: 'titles.ai'
    }
  },
  {
    path: '/settings',
    redirect: '/settings/base'
  },
  {
    path: '/settings/base',
    component: SettingsLayout,
    meta: {
      title: 'titles.settings'
    },
    children: [
      {
        path: '',
        name: 'settingsBase',
        component: SettingsBase
      }
    ]
  },
  {
    path: '/settings/ai',
    component: SettingsLayout,
    meta: {
      title: 'titles.settings'
    },
    children: [
      {
        path: '',
        name: 'settingsAi',
        component: SettingsAi
      }
    ]
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
  if (to.meta.title) {
    document.title = i18n.global.t(to.meta.title as string)
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
        handleApiError(error, i18n.global.t('notes.toast.loadFailed'))
      }
    }
  }

  return true
})

export default router