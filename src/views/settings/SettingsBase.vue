<template>
    <div>
        <el-form label-position="top">
            <el-form-item :label="$t('settings.language')">
                <el-select v-model="store.localeSetting" style="width: 100%">
                    <el-option value="system" :label="$t('settings.languageSystem')" />
                    <el-option value="zh-CN" :label="$t('settings.languageZh')" />
                    <el-option value="en-US" :label="$t('settings.languageEn')" />
                </el-select>
            </el-form-item>
            <el-form-item :label="$t('settings.colorMode')">
                <el-select v-model="store.themeMode" style="width: 100%">
                    <el-option value="system" :label="$t('settings.modeSystem')" />
                    <el-option value="light" :label="$t('settings.modeLight')" />
                    <el-option value="dark" :label="$t('settings.modeDark')" />
                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" plain :loading="checkingUpdate" @click="handleCheckUpdate">
                    {{ checkingUpdate ? $t('update.checking') : $t('update.check') }}
                </el-button>
                <span class="current-version">{{ $t('update.currentVersion', { version: currentVersion }) }}</span>
            </el-form-item>
        </el-form>
        <UpdateDialog v-model="showUpdate" :info="updateInfo" cancel-text="common.cancel" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SettingsBase' })
import { ref } from 'vue'
import { version as currentVersion } from '../../../package.json'
import { useCacheStore } from '@/stores/cache'
import { checkForUpdate, type UpdateInfo } from '@/utils/update'
import UpdateDialog from '@/components/UpdateDialog.vue'

const store = useCacheStore()

const checkingUpdate = ref(false)
const showUpdate = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)

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
</script>

<style scoped>
.current-version {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-left: 12px;
}
</style>