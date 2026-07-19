import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import axios from 'axios'
import type { NoteFormData, UploadFile, AiConfig, ThemeMode } from '@/types'
import { loadAiConfig, saveAiConfig as saveAiConfigToStorage, getAiConfigHeaders, AI_CONFIG_KEY } from '@/types'

const THEME_KEY = 'notes-theme-mode'

export const useCacheStore = defineStore('cache', () => {
    const openSubjects: Ref<string[]> = ref([])
    const checkedNotes: Ref<string[]> = ref([])
    const aiAvailable: Ref<boolean> = ref(false)
    const visionEnabled: Ref<boolean> = ref(true)
    const aiStatusLoaded: Ref<boolean> = ref(false)
    const themeMode = ref<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode) || 'system')

    const aiConfig = ref<AiConfig>(loadAiConfig())

    // 发布笔记表单数据（跨路由持久化）
    const publishFormData = ref<NoteFormData>({ title: '', subject: '', content: '' })
    const publishFileList = ref<UploadFile[]>([])
    const publishPreviewIndex = ref(0)
    const publishShowPreview = ref(false)
    const publishSubmitting = ref(false)

    function resetPublishForm() {
        publishFormData.value = { title: '', subject: '', content: '' }
        publishFileList.value.forEach(item => {
            if (item.url) URL.revokeObjectURL(item.url)
        })
        publishFileList.value = []
        publishPreviewIndex.value = 0
        publishShowPreview.value = false
        publishSubmitting.value = false
    }

    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function applyTheme(mode: ThemeMode) {
        const isDark = mode === 'dark' || (mode === 'system' && darkModeMediaQuery.matches)
        const root = document.documentElement
        root.classList.add('no-transition')
        root.classList.toggle('dark', isDark)
        requestAnimationFrame(() => root.classList.remove('no-transition'))
    }

    watch(themeMode, (val) => {
        localStorage.setItem(THEME_KEY, val)
        applyTheme(val)
    }, { immediate: true })

    const darkModeHandler = () => {
        if (themeMode.value === 'system') applyTheme('system')
    }
    darkModeMediaQuery.addEventListener('change', darkModeHandler)
    window.addEventListener('beforeunload', () => {
        darkModeMediaQuery.removeEventListener('change', darkModeHandler)
    })

    function updateAiConfig(config: AiConfig) {
        aiConfig.value = config
        saveAiConfigToStorage(config)
        visionEnabled.value = config.visionEnabled
    }

    async function loadAiStatus() {
        if (aiStatusLoaded.value) return
        try {
            const headers = getAiConfigHeaders(aiConfig.value)
            const res = await axios.get('/api/ai/status', { headers })
            aiAvailable.value = res.data?.ai_available ?? false
            visionEnabled.value = res.data?.vision_enabled ?? true
        } catch {
            aiAvailable.value = !!aiConfig.value.apiKey
        } finally {
            aiStatusLoaded.value = true
        }
    }

    async function testAiConfig(config: AiConfig): Promise<boolean> {
        try {
            const headers = getAiConfigHeaders(config)
            const res = await axios.get('/api/ai/status', { headers })
            return res.data?.ai_available ?? false
        } catch {
            return false
        }
    }

    return {
        openSubjects,
        checkedNotes,
        aiAvailable,
        visionEnabled,
        aiStatusLoaded,
        themeMode,
        aiConfig,
        loadAiStatus,
        updateAiConfig,
        testAiConfig,
        publishFormData,
        publishFileList,
        publishPreviewIndex,
        publishShowPreview,
        publishSubmitting,
        resetPublishForm,
    }
})
