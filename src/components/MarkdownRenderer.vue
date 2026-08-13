<template>
    <div class="markdown-body" v-html="finalHtml"></div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { resolveImageUrl } from '@/utils/mediaUrl'

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
    streaming?: boolean
}>()

// DOMPurify 白名单：保留 MathML 标签
const SANITIZE_OPTS = {
    ADD_TAGS: [
        'math', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt',
        'mroot', 'mrow', 'munder', 'mover', 'munderover', 'mspace',
        'mpadded', 'mphantom', 'mstyle', 'merror', 'semantics',
        'annotation', 'annotation-xml', 'mtext'
    ],
    ADD_ATTR: ['xmlns', 'encoding']
}

// 生产环境修正 markdown 内图片相对路径
function postProcess(html: string): string {
    return html.replace(/src="\/uploads\/images\//g, `src="${resolveImageUrl('/uploads/images/')}`)
}

// ---- 非流式：整段渲染（版本号防抖避免异步 parse 结果错乱）----
const rawHtml = ref('')
let version = 0

// 同时监听 streaming：发送结束后 streaming 变 false 时强制全量渲染一次，兜底流式中间态
watch([() => props.content, () => props.streaming], async ([newContent, streaming]) => {
    if (streaming) return
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

const sanitizedHtml = computed(() => postProcess(DOMPurify.sanitize(rawHtml.value, SANITIZE_OPTS)))

// ---- 流式：增量渲染 ----
// 内容按最后一个空行切分为「已定稿 + 尾部残块」：定稿部分只 parse 新增的 slice 并缓存 HTML，
// 尾部残块（未闭合的代码围栏/公式/表格）防抖渲染，闭合后流入定稿缓存。
// 与每 chunk 全量重 parse 相比，总工作量从 O(n²) 降为 O(n)。
// epoch 记录每次 watch 的代数：异步 parse 完成后仅当本轮未被更新/重置才写入结果，
// 被丢弃的部分由后续 watch 基于已更新的 settledText 重新计算，不会出现缺口。
const TAIL_LIMIT = 16384
const tailHtml = ref('')
let settledText = ''
let settledHtml = ''
let epoch = 0
let tailRaf = 0
let pendingTail = ''

function splitContent(content: string): { settled: string; tail: string } {
    const boundary = content.lastIndexOf('\n\n')
    if (boundary < 0) return { settled: '', tail: content }
    let settled = content.slice(0, boundary)
    let tail = content.slice(boundary + 2)
    // 极端情况：无断行的超长文本会让 tail 无限增长，强制按最后一个单换行定稿
    if (tail.length > TAIL_LIMIT) {
        const nl = tail.lastIndexOf('\n')
        if (nl > 0) {
            settled = `${settled}\n\n${tail.slice(0, nl)}`
            tail = tail.slice(nl + 1)
        }
    }
    return { settled, tail }
}

// tail 渲染：rAF 帧节流（而非定时防抖），流式期间每帧渲染最新尾块，
// 避免高频 chunk 下防抖被反复重置导致正文整段才跳出来。
function requestTailRender() {
    if (tailRaf) return
    tailRaf = requestAnimationFrame(async () => {
        tailRaf = 0
        if (!props.streaming) return
        const currentTail = pendingTail
        let html = ''
        if (currentTail) html = await markedInstance.parse(currentTail)
        if (!props.streaming) return
        if (props.content.endsWith(currentTail)) {
            tailHtml.value = html ? postProcess(DOMPurify.sanitize(html, SANITIZE_OPTS)) : ''
        }
        // 渲染期间内容又增长：下一帧渲染最新 tail
        if (props.streaming && !props.content.endsWith(currentTail)) {
            requestTailRender()
        }
    })
}

watch([() => props.content, () => props.streaming], async ([newContent, streaming]) => {
    if (!streaming) return
    const myEpoch = ++epoch
    if (tailRaf) {
        cancelAnimationFrame(tailRaf)
        tailRaf = 0
    }
    if (!newContent) {
        settledText = ''
        settledHtml = ''
        tailHtml.value = ''
        pendingTail = ''
        return
    }
    // 内容突变（切换会话/截断）时全量重建
    if (!newContent.startsWith(settledText)) {
        settledText = ''
        settledHtml = ''
    }
    const { settled, tail } = splitContent(newContent)
    // 先按最新内容更新 settledText，parse 期间的并发 watch 会基于它计算完整 slice
    const slice = settled.slice(settledText.length)
    settledText = settled
    if (slice) {
        const html = await markedInstance.parse(slice)
        if (myEpoch === epoch) {
            settledHtml += postProcess(DOMPurify.sanitize(html, SANITIZE_OPTS))
        }
    }
    pendingTail = tail
    requestTailRender()
}, { immediate: true })

const finalHtml = computed(() =>
    props.streaming ? settledHtml + tailHtml.value : sanitizedHtml.value
)

onUnmounted(() => {
    if (tailRaf) cancelAnimationFrame(tailRaf)
})
</script>

<style>
@import 'github-markdown-css/github-markdown-light.css';

.markdown-body {
    box-sizing: border-box;
    padding: 0;
    background-color: transparent;
}

/* 超宽块级公式原地横向滚动，避免撑破容器产生整页横向滚动条 */
.markdown-body .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
    max-width: 100%;
    padding: 2px 0;
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