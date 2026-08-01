<template>
    <el-dialog v-model="visible" title="设置" class="settings-dialog" width="90%" :close-on-click-modal="false">
        <el-tabs>
            <el-tab-pane label="基本">
                <el-form label-position="top">
                    <el-form-item label="颜色模式">
                        <el-select v-model="themeForm" style="width: 100%">
                            <el-option value="system" label="跟随系统" />
                            <el-option value="light" label="浅色" />
                            <el-option value="dark" label="深色" />
                        </el-select>
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" plain :loading="checkingUpdate" @click="handleCheckUpdate">
                            {{ checkingUpdate ? '检查中...' : '检查更新' }}
                        </el-button>
                        <span class="current-version">当前版本：{{ currentVersion }}</span>
                    </el-form-item>
                </el-form>
            </el-tab-pane>
            <el-tab-pane label="AI 配置">
                <el-form label-position="top">
                    <el-form-item label="Base URL (Chat Completions)">
                        <el-autocomplete
                            v-model="form.baseUrl"
                            :fetch-suggestions="queryBaseUrlSuggestions"
                            placeholder="例：https://api.deepseek.com"
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
                    <el-form-item label="API Key">
                        <el-input v-model="form.apiKey" type="password" show-password placeholder="请到官网获取 API Key" />
                    </el-form-item>
                    <el-form-item label="模型名">
                        <el-autocomplete
                            v-model="form.modelName"
                            :fetch-suggestions="fetchModelSuggestions"
                            placeholder="例：deepseek-v4-flash"
                            clearable
                        />
                    </el-form-item>
                    <el-form-item label="启用识图" label-position="left" label-width="70px">
                        <el-switch v-model="form.visionEnabled" />
                        <span class="inline-label">显示思考</span>
                        <el-switch v-model="form.showThinking" />
                    </el-form-item>
                    <el-form-item label="思考模式" label-position="left" label-width="70px">
                        <el-select v-model="form.reasoningEffort" style="width: 220px">
                            <el-option label="默认" value="" />
                            <el-option label="禁用" value="disabled" />
                            <el-option label="low" value="low" />
                            <el-option label="medium" value="medium" />
                            <el-option label="high" value="high" />
                            <el-option label="xhigh" value="xhigh" />
                            <el-option label="max" value="max" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="系统提示词">
                        <el-input
                            v-model="form.systemPrompt"
                            type="textarea"
                            :autosize="{ minRows: 4, maxRows: 12 }"
                            :placeholder="DEFAULT_SYSTEM_PROMPT"
                        />
                        <div class="prompt-hint">
                            <span>{timestamp} 占位符会替换为当前时间戳</span>
                        </div>
                    </el-form-item>
                </el-form>
            </el-tab-pane>
        </el-tabs>
        <template #footer>
            <el-button @click="visible = false">取消</el-button>
            <el-button type="primary" :loading="testing" @click="handleSave">
                {{ testing ? '测试中...' : '保存' }}
            </el-button>
        </template>
    </el-dialog>
    <UpdateDialog v-model="showUpdate" :info="updateInfo" cancel-text="取消" />
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { version as currentVersion } from '../../package.json'
import type { AiConfig, ThemeMode } from '@/types'
import { DEFAULT_SYSTEM_PROMPT } from '@/types'
import { useCacheStore } from '@/stores/cache'
import { checkForUpdate, type UpdateInfo } from '@/utils/update'
import UpdateDialog from '@/components/UpdateDialog.vue'
import axios from 'axios'

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

const visible = defineModel<boolean>('visible', { default: false })
const testing = ref(false)
const checkingUpdate = ref(false)
const showUpdate = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
const themeForm = ref<ThemeMode>('system')

const form = reactive<AiConfig>({
    apiKey: '',
    baseUrl: '',
    modelName: '',
    visionEnabled: true,
    systemPrompt: '',
    reasoningEffort: '',
    showThinking: true,
})

watch(visible, (val) => {
    if (val) {
        themeForm.value = store.themeMode
        const cfg = store.aiConfig
        form.apiKey = cfg.apiKey
        form.baseUrl = cfg.baseUrl
        form.modelName = cfg.modelName
        form.visionEnabled = cfg.visionEnabled
        form.systemPrompt = cfg.systemPrompt ?? ''
        form.reasoningEffort = cfg.reasoningEffort ?? ''
        form.showThinking = cfg.showThinking ?? true
    }
})

async function handleCheckUpdate() {
  checkingUpdate.value = true
  try {
    const info = await checkForUpdate(true)
    if (info) {
      updateInfo.value = info
      showUpdate.value = true
    }
  } finally {
    checkingUpdate.value = false
  }
}

async function handleSave() {
    testing.value = true
    try {
        store.themeMode = themeForm.value
        store.updateAiConfig({ ...form })
        const ok = await store.testAiConfig(form)
        const hasConfig = !!(form.apiKey && form.baseUrl && form.modelName)
        store.aiAvailable = ok || hasConfig
        store.visionEnabled = form.visionEnabled
        visible.value = false
        if (ok) {
            ElMessage.success('配置已保存')
        } else if (hasConfig) {
            ElMessage.warning('已保存，但连接测试失败，请检查配置')
        } else {
            ElMessage.info('已清除 AI 配置')
        }
    } finally {
        testing.value = false
    }
}
</script>

<style>
.inline-label {
    margin: 0 6px 0 16px;
    font-size: 14px;
    color: var(--el-text-color-primary);
    white-space: nowrap;
}

.settings-dialog {
    max-width: 480px !important;
}

.current-version {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-left: 12px;
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
