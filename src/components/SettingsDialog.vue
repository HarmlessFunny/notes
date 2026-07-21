<template>
    <el-dialog v-model="visible" :title="$t('settings.title')" width="auto" class="settings-dialog" :close-on-click-modal="false">
        <el-tabs>
            <el-tab-pane :label="$t('settings.tab.ai')">
                <el-form label-position="top">
                    <el-form-item :label="$t('settings.baseUrl')">
                        <el-input v-model="form.baseUrl" :placeholder="$t('settings.baseUrlPlaceholder')" />
                    </el-form-item>
                    <el-form-item :label="$t('settings.modelName')">
                        <el-input v-model="form.modelName" :placeholder="$t('settings.modelNamePlaceholder')" />
                    </el-form-item>
                    <el-form-item :label="$t('settings.apiKey')">
                        <el-input v-model="form.apiKey" type="password" show-password :placeholder="$t('settings.apiKeyPlaceholder')" />
                    </el-form-item>
                    <el-form-item :label="$t('settings.visionEnabled')">
                        <el-switch v-model="form.visionEnabled" />
                    </el-form-item>
                </el-form>
            </el-tab-pane>
            <el-tab-pane :label="$t('settings.tab.theme')">
                <el-form label-position="top">
                    <el-form-item :label="$t('settings.colorMode')">
                        <el-select v-model="themeForm" style="width: 100%">
                            <el-option value="system" :label="$t('settings.themeSystem')" />
                            <el-option value="light" :label="$t('settings.themeLight')" />
                            <el-option value="dark" :label="$t('settings.themeDark')" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$t('settings.language')">
                        <el-select v-model="localeForm" style="width: 100%">
                            <el-option value="zh-CN" :label="$t('settings.langZh')" />
                            <el-option value="en" :label="$t('settings.langEn')" />
                        </el-select>
                    </el-form-item>
                </el-form>
            </el-tab-pane>
        </el-tabs>
        <template #footer>
            <el-button @click="visible = false">{{ $t('settings.cancel') }}</el-button>
            <el-button type="primary" :loading="testing" @click="handleSave">
                {{ testing ? $t('settings.testing') : $t('settings.save') }}
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiConfig, ThemeMode, LocaleType } from '@/types'
import { useCacheStore } from '@/stores/cache'
import { handleApiSuccess, handleApiWarning, handleApiInfo } from '@/utils/error'

const { t } = useI18n()
const store = useCacheStore()

const visible = defineModel<boolean>('visible', { default: false })
const testing = ref(false)
const themeForm = ref<ThemeMode>('system')
const localeForm = ref<LocaleType>('zh-CN')

const form = reactive<AiConfig>({
    apiKey: '',
    baseUrl: '',
    modelName: '',
    visionEnabled: true,
})

watch(visible, (val) => {
    if (val) {
        themeForm.value = store.themeMode
        localeForm.value = store.locale
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
        store.locale = localeForm.value
        store.updateAiConfig({ ...form })
        const ok = await store.testAiConfig(form)
        const hasConfig = !!(form.apiKey && form.baseUrl && form.modelName)
        store.aiAvailable = ok || hasConfig
        store.visionEnabled = form.visionEnabled
        visible.value = false
        if (ok) {
            handleApiSuccess(t('settings.saved'))
        } else if (hasConfig) {
            handleApiWarning(t('settings.testFailed'))
        } else {
            handleApiInfo(t('settings.cleared'))
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
