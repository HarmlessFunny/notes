import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import axios from 'axios'

const DARK_KEY = 'notes-dark-mode'

export const useCacheStore = defineStore('cache', () => {
    const openSubjects: Ref<string[]> = ref([])
    const checkedNotes: Ref<string[]> = ref([])
    const aiAvailable: Ref<boolean> = ref(false)
    const aiStatusLoaded: Ref<boolean> = ref(false)
    const darkMode = ref(localStorage.getItem(DARK_KEY) === 'true')

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

    async function loadAiStatus() {
        if (aiStatusLoaded.value) return
        try {
            const res = await axios.get('/api/ai/status')
            aiAvailable.value = res.data?.ai_available ?? false
        } catch {
            aiAvailable.value = false
        } finally {
            aiStatusLoaded.value = true
        }
    }

    return {
        openSubjects,
        checkedNotes,
        aiAvailable,
        aiStatusLoaded,
        darkMode,
        toggleDarkMode,
        loadAiStatus,
    }
})
