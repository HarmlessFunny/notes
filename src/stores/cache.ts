import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import axios from 'axios'
import type { FormData, UploadFile, AiConfig } from '@/types'
import { loadAiConfig, saveAiConfig as saveAiConfigToStorage, getAiConfigHeaders, AI_CONFIG_KEY } from '@/types'

const DARK_KEY = 'notes-dark-mode'

export const useCacheStore = defineStore('cache', () => {
    const openSubjects: Ref<string[]> = ref([])
    const checkedNotes: Ref<string[]> = ref([])
    const aiAvailable: Ref<boolean> = ref(false)
    const visionEnabled: Ref<boolean> = ref(true)
    const aiStatusLoaded: Ref<boolean> = ref(false)
    const darkMode = ref(localStorage.getItem(DARK_KEY) === 'true')

    const aiConfig = ref<AiConfig>(loadAiConfig())

    // 发布笔记表单数据（跨路由持久化）
    const publishFormData = ref<FormData>({ title: '', subject: '', content: '' })
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

    watch(darkMode, (val) => {
        localStorage.setItem(DARK_KEY, String(val))
        const root = document.documentElement
        root.classList.add('no-transition')
        root.classList.toggle('dark', val)
        requestAnimationFrame(() => root.classList.remove('no-transition'))
    }, { immediate: true })

    function toggleDarkMode() {
        darkMode.value = !darkMode.value
    }

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
            if (!aiAvailable.value && aiConfig.value.apiKey) {
                aiAvailable.value = true
            }
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
        darkMode,
        aiConfig,
        toggleDarkMode,
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
