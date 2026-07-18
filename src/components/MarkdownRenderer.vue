<template>
    <div class="markdown-body" v-html="sanitizedHtml"></div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import katex from 'katex'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'

// 规范化数学公式中的反斜杠：修复因 JSON 双重转义导致的 \\frac → \frac 问题
// 仅把「双反斜杠 + 字母」合并为「单反斜杠 + 字母」，
// 保留 display math 中 \\ 作为换行的合法用法（后跟空白/符号不替换）
function normalizeMathBackslashes(text: string): string {
    return text.replace(/\\\\([a-zA-Z])/g, '\\$1')
}

// 模块级 marked 实例：只初始化一次，避免每次创建组件都向全局 marked 追加插件
const markedInstance: Marked = (() => {
    const md = new Marked()
    md.use(
        markedHighlight({
            langPrefix: 'hljs language-',
            highlight(code, lang) {
                const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
                return hljs.highlight(code, { language }).value
            }
        })
    )
    md.use({
        extensions: [
            {
                name: 'blockMath',
                level: 'block',
                start(src: string) {
                    const idx = src.search(/\$\$/)
                    return idx >= 0 ? idx : undefined
                },
                tokenizer(src: string) {
                    const match = src.match(/^\$\$([\s\S]+?)\$\$/)
                    if (match) {
                        return {
                            type: 'blockMath',
                            raw: match[0],
                            text: match[1]!.trim()
                        }
                    }
                    return undefined
                },
                renderer(token: any) {
                    try {
                        return katex.renderToString(normalizeMathBackslashes(token.text), {
                            displayMode: true,
                            throwOnError: false
                        })
                    } catch {
                        return token.text
                    }
                }
            },
            {
                name: 'inlineMath',
                level: 'inline',
                start(src: string) {
                    const idx = src.search(/\$/)
                    return idx >= 0 ? idx : undefined
                },
                tokenizer(src: string) {
                    const match = src.match(/^\$(?!\s)((?:[^$\n\\]|\\.)*?\S)\$/)
                    if (match) {
                        return {
                            type: 'inlineMath',
                            raw: match[0],
                            text: match[1]!.trim()
                        }
                    }
                    return undefined
                },
                renderer(token: any) {
                    try {
                        return katex.renderToString(normalizeMathBackslashes(token.text), {
                            displayMode: false,
                            throwOnError: false
                        })
                    } catch {
                        return token.text
                    }
                }
            }
        ]
    })
    md.setOptions({ breaks: true, gfm: true })
    return md
})()

const props = defineProps<{
    content: string
}>()

const rawHtml = ref<string>('')
let version = 0

watch(() => props.content, async (newContent) => {
    const currentVersion = ++version
    if (!newContent) {
        if (currentVersion === version) {
            rawHtml.value = ''
        }
        return
    }
    const html = await markedInstance.parse(newContent)
    if (currentVersion === version) {
        rawHtml.value = html
    }
}, { immediate: true })

const sanitizedHtml = computed(() => {
    let html = DOMPurify.sanitize(rawHtml.value, {
        ADD_TAGS: [
            'math', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt',
            'mroot', 'mrow', 'munder', 'mover', 'munderover', 'mspace',
            'mpadded', 'mphantom', 'mstyle', 'merror', 'semantics',
            'annotation', 'annotation-xml', 'mtext'
        ],
        ADD_ATTR: ['xmlns', 'encoding']
    })
    if (!import.meta.env.DEV) {
        html = html.replace(/src="\/uploads\/images\//g, `src="${(window as any).__API_BASE__}/uploads/images/`)
    }
    return html
})
</script>

<style>
@import 'github-markdown-css/github-markdown-light.css';

.markdown-body {
    box-sizing: border-box;
    padding: 0;
}

/* 暗色模式覆盖 */
.dark .markdown-body {
    --color-canvas-default: transparent;
    color-scheme: dark;
    color: var(--el-text-color-primary) !important;
}
.dark .markdown-body table tr,
.dark .markdown-body table th,
.dark .markdown-body table td {
    background-color: var(--el-bg-color) !important;
    border-color: var(--el-border-color) !important;
}
.dark .markdown-body table tr:nth-child(2n) {
    background-color: var(--el-fill-color-light) !important;
}
.dark .markdown-body pre,
.dark .markdown-body code {
    background-color: var(--el-fill-color) !important;
    color: var(--el-text-color-primary) !important;
}
.dark .markdown-body pre code {
    background-color: transparent !important;
}
.dark .markdown-body blockquote {
    color: var(--el-text-color-secondary);
    border-left-color: var(--el-border-color);
}
.dark .markdown-body hr {
    background-color: var(--el-border-color);
}
.dark .markdown-body th {
    font-weight: 600;
}
</style>