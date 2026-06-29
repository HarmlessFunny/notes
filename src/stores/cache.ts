import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'
import axios from 'axios'

export const useCacheStore = defineStore('cache', () => {
    const openSubjects: Ref<string[]> = ref([])
    const checkedNotes: Ref<string[]> = ref([])
    const aiAvailable: Ref<boolean> = ref(false)
    const aiStatusLoaded: Ref<boolean> = ref(false)

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
        loadAiStatus,
    }
})
