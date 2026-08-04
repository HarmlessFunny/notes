<template>
    <div class="container">
        <div class="settings-card">
            <el-tabs :model-value="route.path" @tab-change="handleTabChange">
                <el-tab-pane name="/settings/base" :label="$t('settings.tabBasic')" />
                <el-tab-pane name="/settings/ai" :label="$t('settings.tabAi')" />
            </el-tabs>
            <router-view />
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SettingsLayout' })
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

function handleTabChange(name: string | number) {
    const target = String(name)
    if (target && target !== route.path) {
        router.replace(target)
    }
}
</script>

<style scoped>
.container {
    padding: 15px 10px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.8;
    color: var(--el-text-color-primary);
}

.back-button {
    flex-shrink: 0;
    font-size: 1rem !important;
    font-weight: normal !important;
    color: var(--el-color-primary) !important;
}

.settings-card {
    background-color: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    padding: 20px 24px;
}

@media (max-width: 768px) {
    .container {
        padding: 20px 15px;
    }

    .settings-card {
        padding: 16px;
    }
}
</style>