<template>
    <el-dialog v-model="visible" title="AI 配置" width="480px" :close-on-click-modal="false">
        <el-form label-position="top">
            <el-form-item label="Base URL">
                <el-input v-model="form.baseUrl" placeholder="https://open.bigmodel.cn/api/paas/v4" />
            </el-form-item>
            <el-form-item label="模型名">
                <el-input v-model="form.modelName" placeholder="glm-4v-flash" />
            </el-form-item>
            <el-form-item label="API Key">
                <el-input v-model="form.apiKey" type="password" show-password placeholder="请输入 API Key" />
            </el-form-item>
            <el-form-item label="启用识图">
                <el-switch v-model="form.visionEnabled" />
            </el-form-item>
        </el-form>
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
import type { AiConfig } from '@/types'
import { useCacheStore } from '@/stores/cache'

const store = useCacheStore()

const visible = defineModel<boolean>('visible', { default: false })
const testing = ref(false)

const form = reactive<AiConfig>({
    apiKey: '',
    baseUrl: '',
    modelName: '',
    visionEnabled: true,
})

watch(visible, (val) => {
    if (val) {
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
