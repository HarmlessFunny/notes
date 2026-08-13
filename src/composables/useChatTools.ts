import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolCallInfo } from '@/utils/stream'

const MUTATION_TOOLS = new Set(['add_note', 'delete_notes', 'update_note'])

// 工具展示元数据的唯一来源：名称、是否变更型操作、参数格式化
export function useChatTools() {
    const { t } = useI18n()

    const toolNames = computed<Record<string, string>>(() => ({
        fetch_note_by_title: t('ai.tool.name.fetchNoteByTitle'),
        fetch_all_notes: t('ai.tool.name.fetchAllNotes'),
        fetch_notes_by_day: t('ai.tool.name.fetchNotesByDay'),
        search_notes: t('ai.tool.name.searchNotes'),
        add_note: t('ai.tool.name.addNote'),
        delete_notes: t('ai.tool.name.deleteNotes'),
        update_note: t('ai.tool.name.updateNote'),
    }))

    function isMutationTool(name: string) {
        return MUTATION_TOOLS.has(name)
    }

    function formatArgs(tool: ToolCallInfo): string {
        const args = tool.arguments as Record<string, unknown>
        const arg = (key: string): string => String(args[key] ?? '')

        switch (tool.name) {
            case 'fetch_note_by_title':
                return `${t('ai.tool.arg.title')}: ${arg('title')}`
            case 'fetch_all_notes':
                return ''
            case 'fetch_notes_by_day': {
                const ts = Number(arg('someday'))
                if (Number.isFinite(ts) && ts > 0) {
                    const d = new Date(ts)
                    const pad = (n: number) => String(n).padStart(2, '0')
                    return `${t('ai.tool.arg.date')}: ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                }
                return `${t('ai.tool.arg.timestamp')}: ${arg('someday')}`
            }
            case 'search_notes':
                return `${t('ai.tool.arg.keyword')}: ${arg('keyword')}`
            case 'add_note': {
                const parts = [`${t('ai.tool.arg.title')}: ${arg('title')}`]
                if (arg('subject')) parts.push(`${t('ai.tool.arg.subject')}: ${arg('subject')}`)
                return parts.join(' · ')
            }
            case 'delete_notes':
                return `${t('ai.tool.arg.title')}: ${arg('title')}`
            case 'update_note':
                return `${t('ai.tool.arg.old')}: ${arg('old_title')} → ${t('ai.tool.arg.new')}: ${arg('new_title')}`
            default:
                return JSON.stringify(args)
        }
    }

    return { toolNames, isMutationTool, formatArgs }
}