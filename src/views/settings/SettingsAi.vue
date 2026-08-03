<template>
    <div>
        <el-form label-position="top">
            <el-form-item :label="$t('settings.api.baseUrl')">
                <el-autocomplete
                    v-model="form.baseUrl"
                    :fetch-suggestions="queryBaseUrlSuggestions"
                    :placeholder="$t('settings.api.baseUrlPlaceholder')"
                    clearable
                >
                    <template #default="{ item }">
                        <div class="base-url-option">
                            <span class="base-url-label">{{ item.label }}</span>
                            <span class="base-url-value">{{ item.value }}</span>
                        </div>
                    </template>
                </el-autocomplete>
            </el-form-item>
            <el-form-item :label="$t('settings.api.apiKey')">
                <el-input v-model="form.apiKey" type="password" show-password :placeholder="$t('settings.api.apiKeyPlaceholder')" />
            </el-form-item>
            <el-form-item :label="$t('settings.api.modelName')">
                <el-autocomplete
                    v-model="form.modelName"
                    :fetch-suggestions="fetchModelSuggestions"
                    :placeholder="$t('settings.api.modelNamePlaceholder')"
                    clearable
                />
            </el-form-item>
            <el-form-item :label="$t('settings.api.vision')" label-position="left" label-width="70px">
                <el-switch v-model="form.visionEnabled" />
                <span class="inline-label">{{ $t('settings.api.showThinking') }}</span>
                <el-switch v-model="form.showThinking" />
            </el-form-item>
            <el-form-item :label="$t('settings.api.reasoning')" label-position="left">
                <el-slider v-model="reasoningLevel" :min="0" :max="6" :step="1" :show-tooltip="false"
                    style="width: 200px; margin: 0 5px" />
                <span class="reasoning-label">{{ reasoningLabel(reasoningLevel) }}</span>
            </el-form-item>
            <el-form-item :label="$t('settings.api.systemPrompt')">
                <el-input
                    v-model="form.systemPrompt"
                    type="textarea"
                    :autosize="{ minRows: 4, maxRows: 12 }"
                    :placeholder="t('settings.api.defaultPrompt')"
                />
                <div class="prompt-hint">
                    <span>{{ $t('settings.api.promptHint', { timestamp: '{timestamp}' }) }}</span>
                </div>
            </el-form-item>
        </el-form>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SettingsAi' })
import { reactive, computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { AiConfig } from '@/types'
import { useCacheStore } from '@/stores/cache'
import axios from 'axios'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const store = useCacheStore()

interface BaseUrlSuggestion {
    value: string
    label: string
}

const baseUrlSuggestions: BaseUrlSuggestion[] = [
    { value: 'https://api.deepseek.com', label: 'DeepSeek' },
    { value: 'https://open.bigmodel.cn/api/paas/v4', label: 'GLM' },
    { value: 'https://api.moonshot.cn/v1', label: 'Kimi' },
    { value: 'https://api.minimaxi.com/v1', label: 'MiniMax' },
    { value: 'https://dashscope.aliyuncs.com/compatible-mode/v1', label: 'Qwen' },
    { value: 'https://api.xiaomimimo.com/v1', label: 'MiMo' },
    { value: 'https://api.openai.com/v1', label: 'OpenAI' },
    { value: 'https://api.x.ai/v1', label: 'Grok' },
    { value: 'https://openrouter.ai/api/v1', label: 'OpenRouter' },
]

function queryBaseUrlSuggestions(queryString: string, cb: (results: BaseUrlSuggestion[]) => void) {
    const results = queryString
        ? baseUrlSuggestions.filter(s => s.value.includes(queryString) || s.label.includes(queryString))
        : baseUrlSuggestions
    cb(results)
}

const modelCache = ref<BaseUrlSuggestion[]>([])
const lastModelFetch = ref({ baseUrl: '', apiKey: '' })

async function fetchModelSuggestions(queryString: string, cb: (results: BaseUrlSuggestion[]) => void) {
    const { baseUrl, apiKey } = form
    if (!baseUrl || !apiKey) {
        cb([])
        return
    }

    if (baseUrl !== lastModelFetch.value.baseUrl || apiKey !== lastModelFetch.value.apiKey) {
        try {
            const res = await axios.get(`${baseUrl}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            })
            const ids: string[] = (res.data?.data ?? []).map((m: any) => m.id)
            modelCache.value = ids.map(id => ({ value: id, label: '' }))
            lastModelFetch.value = { baseUrl, apiKey }
        } catch {
            modelCache.value = []
        }
    }

    const results = queryString
        ? modelCache.value.filter(s => s.value.includes(queryString))
        : modelCache.value
    cb(results)
}

const REASONING_OPTIONS = ['default', 'disabled', 'low', 'medium', 'high', 'xhigh', 'max']

function reasoningLabel(v: number) {
    const key = REASONING_OPTIONS[Math.round(v)] ?? 'default'
    if (key === 'default') return t('settings.api.reasoningDefault')
    if (key === 'disabled') return t('settings.api.reasoningDisabled')
    return key
}

const reasoningLevel = computed({
    get: () => {
        const i = REASONING_OPTIONS.indexOf(form.reasoningEffort)
        return i === -1 ? 0 : i
    },
    set: (v: number) => { form.reasoningEffort = REASONING_OPTIONS[Math.round(v)] ?? 'default' },
})

const form = reactive<AiConfig>({
    apiKey: '',
    baseUrl: '',
    modelName: '',
    visionEnabled: true,
    systemPrompt: '',
    reasoningEffort: 'default',
    showThinking: true,
})

const dirty = ref(false)

// 进入页面时从已保存配置初始化表单
onMounted(() => {
    const cfg = store.aiConfig
    form.apiKey = cfg.apiKey
    form.baseUrl = cfg.baseUrl
    form.modelName = cfg.modelName
    form.visionEnabled = cfg.visionEnabled
    form.systemPrompt = cfg.systemPrompt ?? ''
    form.reasoningEffort = cfg.reasoningEffort ?? 'default'
    form.showThinking = cfg.showThinking ?? true
    dirty.value = false
})

// 修改即自动保存（写入 store + localStorage）
watch(form, () => {
    dirty.value = true
    store.updateAiConfig({ ...form })
}, { deep: true })

// 离开设置路由时静默测试连接，刷新 AI 可用状态
onBeforeRouteLeave(async () => {
    if (!dirty.value) return
    const ok = await store.testAiConfig(store.aiConfig)
    store.aiAvailable = ok
    store.visionEnabled = form.visionEnabled
})

// 兜底：直接关闭窗口前确保已保存
function handleBeforeUnload() {
    store.updateAiConfig({ ...form })
}
window.addEventListener('beforeunload', handleBeforeUnload)

onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
.inline-label {
    margin: 0 6px 0 16px;
    font-size: 14px;
    color: var(--el-text-color-primary);
    white-space: nowrap;
}

.reasoning-label {
    margin-left: 12px;
    font-size: 13px;
    color: var(--el-color-primary);
    white-space: nowrap;
    min-width: 60px;
}

.base-url-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    width: 100%;
}

.base-url-label {
    font-weight: 400;
    font-size: 13px;
    flex-shrink: 0;
    margin-right: 12px;
}

.base-url-value {
    font-size: 12px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
}

.prompt-hint {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
    margin-top: 4px;
}
</style>