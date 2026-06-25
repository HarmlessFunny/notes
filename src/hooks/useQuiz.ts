import { ref } from 'vue'
import type { QuizData, GradeResponse, QuizQuestion, UserAnswer, QuizQuestionType } from '@/types'
import { useNotesStore } from '@/stores/notes'
import { handleApiWarning } from '@/utils/error'
import { streamFetch, type StreamCallback } from '@/utils/stream'

export function useQuiz() {
    const notesStore = useNotesStore()

    const quizLoading = ref(false)
    const grading = ref(false)
    const quizData = ref<QuizData | null>(null)
    const quizAnswers = ref<Record<number, string>>({})
    const blankAnswers = ref<Record<number, string[]>>({})
    const gradeResult = ref<GradeResponse | null>(null)
    const quizError = ref('')
    
    const streamChunk = ref('')
    const isStreaming = ref(false)

    function getQuestionTypeTag(type: QuizQuestionType): string {
        if (type === 'single_choice') return 'primary'
        if (type === 'fill_blank') return 'success'
        return 'warning'
    }

    function getQuestionTypeLabel(type: QuizQuestionType): string {
        if (type === 'single_choice') return '选择题'
        if (type === 'fill_blank') return '填空题'
        return '简答题'
    }

    function getBlankRange(q: QuizQuestion): number[] {
        const count = Math.max(1, q.blank_count || 1)
        return Array.from({ length: count }, (_, i) => i)
    }

    async function startQuiz(noteContent: string) {
        if (!noteContent) {
            quizError.value = '笔记没有正文内容，无法生成复习题'
            return
        }
        quizData.value = null
        quizAnswers.value = {}
        blankAnswers.value = {}
        gradeResult.value = null
        quizError.value = ''
        quizLoading.value = true
        isStreaming.value = true
        streamChunk.value = ''

        const callback: StreamCallback = {
            onContent: (content) => {
                streamChunk.value += content
            },
            onComplete: () => {
                isStreaming.value = false
            },
            onError: (error) => {
                isStreaming.value = false
                quizError.value = error.message
            },
        }

        const result = await streamFetch<QuizData>('/api/ai/quiz', { note_content: noteContent }, callback)
        quizLoading.value = false

        if (result.data) {
            quizData.value = result.data
            result.data.questions.forEach((q, idx) => {
                if (q.type === 'fill_blank') {
                    const count = Math.max(1, q.blank_count || 1)
                    blankAnswers.value[idx] = Array(count).fill('')
                    quizAnswers.value[idx] = ''
                } else {
                    quizAnswers.value[idx] = ''
                }
            })
        } else {
            quizError.value = result.error?.message || '未能生成复习题，请重试'
        }
    }

    async function submitAnswers(noteContent: string) {
        if (!noteContent || !quizData.value) return

        const answers: UserAnswer[] = quizData.value.questions.map((q, idx) => {
            if (q.type === 'single_choice') {
                const raw = quizAnswers.value[idx] || ''
                const num = Number(raw)
                const letter = Number.isInteger(num) && num >= 0 && num <= 3
                    ? String.fromCharCode(65 + num)
                    : raw
                return { question_index: idx, answer: letter }
            }
            if (q.type === 'fill_blank') {
                const arr = blankAnswers.value[idx] || []
                return { question_index: idx, answer: arr.map((s) => (s || '').trim()) }
            }
            return { question_index: idx, answer: (quizAnswers.value[idx] || '').trim() }
        })

        const hasAnyAnswer = answers.some((a) => {
            if (Array.isArray(a.answer)) return a.answer.some((s) => s && s.trim())
            return !!a.answer
        })
        if (!hasAnyAnswer) {
            handleApiWarning('请至少作答一道题')
            return
        }

        grading.value = true
        isStreaming.value = true
        streamChunk.value = ''

        const callback: StreamCallback = {
            onContent: (content) => {
                streamChunk.value += content
            },
            onComplete: () => {
                isStreaming.value = false
            },
            onError: (error) => {
                isStreaming.value = false
                quizError.value = error.message
            },
        }

        const result = await streamFetch<GradeResponse>('/api/ai/grade', {
            note_content: noteContent,
            questions: quizData.value!.questions,
            user_answers: answers,
        }, callback)

        grading.value = false

        if (result.data) {
            gradeResult.value = result.data
        } else {
            quizError.value = result.error?.message || '批改失败，请重试'
        }
    }

    function formatAnswer(questionIndex: number): string {
        if (!quizData.value) return '（未作答）'
        const q = quizData.value.questions[questionIndex]
        if (!q) return '（未作答）'

        if (q.type === 'fill_blank') {
            const arr = blankAnswers.value[questionIndex]
            if (!arr || arr.length === 0) return '（未作答）'
            const parts = arr.map((s, i) => `空${i + 1}：${s || '（未填）'}`)
            return parts.join('；')
        }
        if (q.type === 'single_choice') {
            const ans = quizAnswers.value[questionIndex]
            if (!ans) return '（未作答）'
            const num = Number(ans)
            const letter = Number.isInteger(num) && num >= 0 && num <= 3
                ? String.fromCharCode(65 + num)
                : ans
            return letter
        }
        return quizAnswers.value[questionIndex] || '（未作答）'
    }

    return {
        quizLoading,
        grading,
        quizData,
        quizAnswers,
        blankAnswers,
        gradeResult,
        quizError,
        streamChunk,
        isStreaming,
        startQuiz,
        submitAnswers,
        getQuestionTypeTag,
        getQuestionTypeLabel,
        getBlankRange,
        formatAnswer,
    }
}