import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import type { LightNote } from '@/types'
import { useCacheStore } from '@/stores/cache'
import { useNotesStore } from '@/stores/notes'
import { handleApiError } from '@/utils/error'

export function useViewNote() {
  const router = useRouter()
  const route = useRoute()
  const cacheStore = useCacheStore()
  const notesStore = useNotesStore()
  const { checkedNotes } = storeToRefs(cacheStore)

  // ===== 视图（原 useView）=====
  const notes: Ref<LightNote[]> = ref([])
  // null = 所有笔记；number = 具体日期的时间戳（毫秒）
  const selectedDate = ref<number | null>(null)
  const time = route.params.time as string

  // ===== 搜索 =====
  const searchQuery = ref('')
  const searchResults = ref<LightNote[]>([])
  const searching = ref(false)
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  const displayNotes = computed(() => {
    if (searchQuery.value.trim()) {
      // 防抖期间且无旧结果时回退到全部笔记，避免闪烁"暂无笔记"
      if (searching.value && searchResults.value.length === 0) return notes.value
      return searchResults.value
    }
    return notes.value
  })

  const filteredSubjects = computed(() => {
    const subjectsSet = new Set<string>()
    displayNotes.value.forEach(note => {
      if (note.subject) subjectsSet.add(note.subject)
    })
    return Array.from(subjectsSet)
  })

  watch(searchQuery, (newQuery) => {
    if (searchTimer) clearTimeout(searchTimer)
    const query = newQuery.trim()
    if (!query) {
      searchResults.value = []
      searching.value = false
      return
    }
    searching.value = true
    searchTimer = setTimeout(async () => {
      searchResults.value = await notesStore.searchNotes(query)
      searching.value = false
    }, 300)
  })

  onUnmounted(() => {
    if (searchTimer) clearTimeout(searchTimer)
  })

  const humanDate = computed(() => {
    if (selectedDate.value === null) return '所有笔记'
    return new Date(selectedDate.value).toLocaleDateString()
  })

  const loadByTime = async (t: string) => {
    if (t === 'all' || t == null || t === '') {
      notes.value = notesStore.allNotes
      selectedDate.value = null
    } else if (t === 'today') {
      notes.value = await notesStore.getFilteredNotes(Date.now().toString())
      selectedDate.value = Date.now()
    } else {
      notes.value = await notesStore.getFilteredNotes(t)
      selectedDate.value = Number(t)
    }
  }

  const handleDateChange = (date: number | null) => {
    // 只做路由跳转，数据加载完全交给路由 watcher
    // 避免同一次操作触发两次相同的 API 请求
    if (date === null || date === 0 || date == null) {
      router.replace('/view/notes/all')
      return
    }
    const d1 = new Date(date)
    const d2 = new Date(Date.now())
    if (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    ) {
      router.replace('/view/notes/today')
    } else {
      router.replace(`/view/notes/${date}`)
    }
  }

  const seeDetail = (title: string) => {
    router.push(`/view/detail/${encodeURIComponent(title)}`)
  }

  watch(
    () => route.params.time as string,
    async (newTime: string) => {
      try {
        await loadByTime(newTime)
      } catch (error) {
        handleApiError(error, '获取笔记列表失败')
      }
    },
    { immediate: true }
  )

  // 当 allNotes 变化（删除笔记后）刷新显示
  // allNotes 本身是 ref，整体替换时浅层 watch 即可捕获
  watch(() => notesStore.allNotes, (newNotes) => {
    const t = route.params.time as string
    if (t === 'all' || t == null || t === '') {
      notes.value = newNotes
    }
  })

  // ===== 多选删除（原 useDelete，内部共享 notes）=====
  const subjectNotes = (subject: string) =>
    displayNotes.value.filter(note => note.subject === subject)

  const isSubjectChecked = (subject: string) => {
    const list = subjectNotes(subject)
    return list.length > 0 && list.every(note => checkedNotes.value.includes(note.title))
  }

  const isSubjectIndeterminate = (subject: string) => {
    const list = subjectNotes(subject)
    if (list.length === 0) return false
    const checkedCount = list.filter(note => checkedNotes.value.includes(note.title)).length
    return checkedCount > 0 && checkedCount < list.length
  }

  const handleSubjectCheck = (subject: string, checked: boolean) => {
    const titles = subjectNotes(subject).map(note => note.title)
    if (checked) {
      checkedNotes.value = Array.from(new Set([...checkedNotes.value, ...titles]))
    } else {
      checkedNotes.value = checkedNotes.value.filter(t => !titles.includes(t))
    }
  }

  const handleNoteCheck = (noteTitle: string, checked: boolean) => {
    if (checked) {
      if (!checkedNotes.value.includes(noteTitle)) {
        checkedNotes.value = [...checkedNotes.value, noteTitle]
      }
    } else {
      checkedNotes.value = checkedNotes.value.filter(t => t !== noteTitle)
    }
  }

  const deleteChecked = async () => {
    if (checkedNotes.value.length === 0) return false
    const ok = await notesStore.deleteNotes([...checkedNotes.value])
    if (ok) {
      checkedNotes.value = []
      if (searchQuery.value.trim()) {
        if (searchTimer) clearTimeout(searchTimer)
        searchResults.value = await notesStore.searchNotes(searchQuery.value.trim())
        searching.value = false
      } else {
        await loadByTime(route.params.time as string)
      }
    }
    return ok
  }

  return {
    notes,
    selectedDate,
    time,
    humanDate,
    searchQuery,
    displayNotes,
    filteredSubjects,
    handleDateChange,
    seeDetail,
    isSubjectChecked,
    isSubjectIndeterminate,
    handleSubjectCheck,
    handleNoteCheck,
    deleteChecked
  }
}
