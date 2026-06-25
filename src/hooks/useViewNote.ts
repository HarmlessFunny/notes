import { ref, computed, watch, type Ref } from 'vue'
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

  const seeDetail = (id: string) => {
    router.push(`/view/detail/${id}`)
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
    notes.value.filter(note => note.subject === subject)

  const isSubjectChecked = (subject: string) => {
    const list = subjectNotes(subject)
    return list.length > 0 && list.every(note => checkedNotes.value.includes(note.id))
  }

  const isSubjectIndeterminate = (subject: string) => {
    const list = subjectNotes(subject)
    if (list.length === 0) return false
    const checkedCount = list.filter(note => checkedNotes.value.includes(note.id)).length
    return checkedCount > 0 && checkedCount < list.length
  }

  const handleSubjectCheck = (subject: string, checked: boolean) => {
    const ids = subjectNotes(subject).map(note => note.id)
    if (checked) {
      checkedNotes.value = Array.from(new Set([...checkedNotes.value, ...ids]))
    } else {
      checkedNotes.value = checkedNotes.value.filter(id => !ids.includes(id))
    }
  }

  const handleNoteCheck = (noteId: string, checked: boolean) => {
    if (checked) {
      if (!checkedNotes.value.includes(noteId)) {
        checkedNotes.value = [...checkedNotes.value, noteId]
      }
    } else {
      checkedNotes.value = checkedNotes.value.filter(id => id !== noteId)
    }
  }

  const deleteChecked = async () => {
    if (checkedNotes.value.length === 0) return false
    const ok = await notesStore.deleteNote([...checkedNotes.value])
    if (ok) checkedNotes.value = []
    return ok
  }

  return {
    notes,
    selectedDate,
    time,
    humanDate,
    handleDateChange,
    seeDetail,
    isSubjectChecked,
    isSubjectIndeterminate,
    handleSubjectCheck,
    handleNoteCheck,
    deleteChecked
  }
}
