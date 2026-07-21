<template>
    <el-dialog v-model="visible" title="设置" width="auto" class="settings-dialog" :close-on-click-modal="false">
        <el-tabs>
            <el-tab-pane label="AI 配置">
                <el-form label-position="top">
                    <el-form-item label="Base URL">
                        <el-input v-model="form.baseUrl" placeholder="例：https://api.deepseek.com" />
                    </el-form-item>
                    <el-form-item label="模型名">
                        <el-input v-model="form.modelName" placeholder="例：deepseek-v4-flash" />
                    </el-form-item>
                    <el-form-item label="API Key">
                        <el-input v-model="form.apiKey" type="password" show-password placeholder="请到官网获取 API Key" />
                    </el-form-item>
                    <el-form-item label="启用识图">
                        <el-switch v-model="form.visionEnabled" />
                    </el-form-item>
                </el-form>
            </el-tab-pane>
            <el-tab-pane label="主题">
                <el-form label-position="top">
                    <el-form-item label="颜色模式">
                        <el-select v-model="themeForm" style="width: 100%">
                            <el-option value="system" label="跟随系统" />
                            <el-option value="light" label="浅色" />
                            <el-option value="dark" label="深色" />
                        </el-select>
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
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { AiConfig, ThemeMode } from '@/types'
import { useCacheStore } from '@/stores/cache'

const store = useCacheStore()

const visible = defineModel<boolean>('visible', { default: false })
const testing = ref(false)
const themeForm = ref<ThemeMode>('system')

const form = reactive<AiConfig>({
    apiKey: '',
    baseUrl: '',
    modelName: '',
    visionEnabled: true,
})

watch(visible, (val) => {
    if (val) {
        themeForm.value = store.themeMode
        const cfg = store.aiConfig
        form.apiKey = cfg.apiKey
        form.baseUrl = cfg.baseUrl
        form.modelName = cfg.modelName
        form.visionEnabled = cfg.visionEnabled
    }
})

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

<style scoped>
.settings-dialog {
    max-width: 480px;
    width: calc(100vw - 32px);
}
</style>
