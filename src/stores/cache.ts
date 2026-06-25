import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'

export const useCacheStore = defineStore('cache', () => {
    const openSubjects: Ref<string[]> = ref([])
    const checkedNotes: Ref<string[]> = ref([])

    return {
        openSubjects,
        checkedNotes,
    }
})
