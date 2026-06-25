<template>
    <div v-if="quizLoading || isStreaming" class="quiz-loading">
        <div v-if="!streamChunk" class="loading-message">
            <el-icon class="is-loading" :size="32">
                <Loading />
            </el-icon>
            <div style="margin-top: 12px; color: var(--el-text-color-secondary)" v-if="!streamChunk">
                AI 正在根据笔记内容{{ quizLoading ? '生成题目' : '批改答案' }}...
            </div>
        </div>
        <pre v-else="streamChunk" class="stream-preview">{{ streamChunk }}</pre>
    </div>

    <div v-else-if="quizData && !gradeResult" class="quiz-questions">
        <div v-for="(q, idx) in quizData.questions" :key="idx" class="quiz-question">
            <div class="quiz-question-header">
                <span class="question-num">{{ idx + 1 }}</span>
                <el-tag size="small" :type="getQuestionTypeTag(q.type)">
                    {{ getQuestionTypeLabel(q.type) }}
                </el-tag>
            </div>
            <MarkdownRenderer class="quiz-question-text" :content="q.question" />

            <div v-if="q.type === 'single_choice'" class="quiz-options">
                <el-radio-group v-model="quizAnswers[idx]">
                    <el-radio v-for="(opt, oIdx) in q.options" :key="oIdx" :value="String(oIdx)"
                        style="margin-right: 20px">
                        {{ opt }}
                    </el-radio>
                </el-radio-group>
            </div>

            <div v-else-if="q.type === 'fill_blank'" class="quiz-fill">
                <div v-for="(_, bIdx) in getBlankRange(q)" :key="bIdx" class="blank-item">
                    <el-input v-model="blankAnswers[idx]![bIdx]" :placeholder="`第 ${bIdx + 1} 个空`" clearable />
                </div>
            </div>

            <div v-else class="quiz-short">
                <el-input v-model="quizAnswers[idx]" type="textarea" :rows="3" placeholder="请输入你的答案" />
            </div>
        </div>

        <div style="text-align: center; margin-top: 24px">
            <el-button type="primary" size="large" @click="submitAnswers(noteContent)" :loading="grading">
                提交批改
            </el-button>
        </div>
    </div>

    <div v-else-if="gradeResult" class="quiz-results">
        <div class="result-summary">
            <span class="result-score">{{ gradeResult.score }}</span>
            <span class="result-label">分</span>
            <span class="result-text">{{ gradeResult.summary }}</span>
        </div>

        <div v-for="(r, idx) in gradeResult.results" :key="idx" class="result-item"
            :class="r.is_correct ? 'correct' : 'incorrect'">
            <div class="result-question">
                <el-tag :type="r.is_correct ? 'success' : 'danger'" size="small" style="margin-right: 8px">
                    {{ r.is_correct ? '正确' : '错误' }}
                </el-tag>
                <span>第 {{ r.question_index + 1 }} 题</span>
            </div>
            <div class="result-detail">
                <div><span class="label">你的答案：</span>{{ formatAnswer(r.question_index) }}</div>
                <div v-if="r.correct_answer"><span class="label">参考答案：</span>{{ r.correct_answer }}</div>
                <div v-if="r.feedback"><span class="label">解析：</span>{{ r.feedback }}</div>
            </div>
        </div>
    </div>

    <div v-else-if="quizError" class="quiz-error">
        <el-alert :title="quizError" type="error" :closable="false" show-icon />
    </div>
</template>

<script setup lang="ts" name="QuizDialog">
import { useQuiz } from '@/hooks/useQuiz'
import { Loading } from '@element-plus/icons-vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const props = defineProps<{
    noteContent: string
}>()

const {
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
} = useQuiz()

defineExpose({
    startQuiz: () => startQuiz(props.noteContent),
    quizLoading,
    grading,
    isStreaming,
    streamChunk,
})
</script>

<style scoped>
.quiz-loading {
    text-align: center;
    padding: 0 20px;
    color: var(--el-text-color-secondary);
}

.stream-preview {
    text-align: left;
    background: var(--el-bg-color-page);
    border-radius: 8px;
    padding: 12px;
    white-space: pre-wrap;
    overflow-y: auto;
}

.stream-label {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin-bottom: 8px;
}

.stream-content {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--el-text-color-primary);
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
}

.quiz-questions {
    padding: 0 20px;
}

.quiz-question {
    margin-bottom: 24px;
    padding: 16px 18px;
    background: var(--el-bg-color-page);
    border-radius: 8px;
    border-left: 4px solid var(--el-color-primary);
}

.quiz-question-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.question-num {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--el-text-color-primary);
}

.quiz-question-text {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    word-break: break-word;
    background: transparent;
}

.quiz-options :deep(.el-radio) {
    display: block;
    margin-bottom: 8px;
    margin-right: 0;
}

.quiz-options :deep(.el-radio .el-radio__label) {
    padding-left: 8px;
}

.quiz-fill,
.quiz-short {
    margin-top: 4px;
}

.quiz-fill .blank-item {
    margin-bottom: 6px;
}

.quiz-results {
    padding: 0 20px;
}

.result-summary {
    text-align: center;
    padding: 16px;
    margin-bottom: 16px;
    background: var(--el-bg-color-page);
    border-radius: 8px;
}

.result-score {
    font-size: 2rem;
    font-weight: 700;
    color: var(--el-text-color-primary);
}

.result-label {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    margin-right: 12px;
}

.result-text {
    display: block;
    margin-top: 6px;
    color: var(--el-text-color-regular);
    font-size: 0.95rem;
}

.result-item {
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    border-left: 4px solid;
}

.result-item.correct {
    background: rgba(103, 194, 58, 0.08);
    border-left-color: var(--el-color-success);
}

.result-item.incorrect {
    background: rgba(245, 108, 108, 0.08);
    border-left-color: var(--el-color-danger);
}

.result-question {
    margin-bottom: 8px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}

.result-detail {
    line-height: 1.8;
    color: var(--el-text-color-regular);
    font-size: 0.95rem;
}

.result-detail .label {
    color: var(--el-text-color-secondary);
    font-weight: 500;
}

.quiz-error {
    padding: 20px;
}

@media (max-width: 768px) {

    .quiz-questions,
    .quiz-results {
        padding: 0 12px;
    }

    .quiz-question {
        padding: 12px 14px;
        margin-bottom: 16px;
    }

    .result-item {
        padding: 10px 12px;
    }
}

@media (max-width: 480px) {

    .quiz-questions,
    .quiz-results {
        padding: 0 8px;
    }

    .quiz-question {
        padding: 10px 12px;
        margin-bottom: 14px;
    }

    .quiz-question-text {
        font-size: 0.9rem;
    }

    .quiz-options :deep(.el-radio) {
        margin-bottom: 6px;
        font-size: 13px;
    }

    .result-summary {
        padding: 12px;
    }

    .result-score {
        font-size: 1.6rem;
    }

    .result-item {
        padding: 8px 10px;
        margin-top: 12px;
    }

    .result-detail {
        font-size: 0.85rem;
    }
}
</style>