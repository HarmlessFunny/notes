import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { Note } from '@/types'
import { handleApiError } from './error'

/**
 * 将图片URL转换为dataURL
 */
async function loadImageAsDataUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url)
        const blob = await response.blob()
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    } catch {
        return url
    }
}

/**
 * 导出笔记内容为 PDF 文件
 * @param note 笔记数据
 * @param contentElement 内容区域元素（可为 null）
 * @param imagesContainer 图片容器元素（每个图片单独一页，可为 null）
 */
export async function exportNoteToPdf(
    note: Note,
    contentElement: HTMLElement | null,
    imagesContainer: HTMLElement | null
): Promise<void> {
    const loadingOverlay = document.createElement('div')
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 20px 40px;
        border-radius: 8px;
        z-index: 9999;
        font-family: 'Segoe UI', sans-serif;
    `
    loadingOverlay.textContent = '正在生成 PDF...'
    document.body.appendChild(loadingOverlay)

    try {
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pageWidth = 210 // A4 宽度 mm
        const pageHeight = 297 // A4 高度 mm
        const margin = 15 // 页边距 mm
        const contentWidth = pageWidth - margin * 2
        const availablePageHeight = pageHeight - margin * 2

        // 1. 处理内容区域
        if (contentElement) {
            const contentCanvas = await html2canvas(contentElement, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
            })

            // 跳过空内容
            if (contentCanvas.width === 0 || contentCanvas.height === 0) {
                // 内容为空，不添加页面
            } else {
                // 计算内容总高度（mm）
                const totalContentHeight = (contentCanvas.height * contentWidth) / contentCanvas.width

                // 计算需要多少页
                const pageCount = Math.ceil(totalContentHeight / availablePageHeight)

                for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                    // 第一页直接使用，后续页面需要添加
                    if (pageIndex > 0) {
                        pdf.addPage()
                    }

                    // 计算当前页应该截取的内容
                    const sourceYOnCanvas = pageIndex * availablePageHeight * contentCanvas.width / contentWidth
                    const sourceHeight = Math.min(
                        availablePageHeight * contentCanvas.width / contentWidth,
                        contentCanvas.height - sourceYOnCanvas
                    )

                    // 创建临时 canvas 截取当前页内容
                    const tempCanvas = document.createElement('canvas')
                    tempCanvas.width = contentCanvas.width
                    tempCanvas.height = sourceHeight
                    const tempCtx = tempCanvas.getContext('2d')!
                    tempCtx.drawImage(
                        contentCanvas,
                        0, sourceYOnCanvas,
                        contentCanvas.width, sourceHeight,
                        0, 0,
                        tempCanvas.width, tempCanvas.height
                    )

                    const pageContentHeight = (tempCanvas.height * contentWidth) / tempCanvas.width
                    pdf.addImage(
                        tempCanvas.toDataURL('image/png'),
                        'PNG',
                        margin,
                        margin,
                        contentWidth,
                        pageContentHeight
                    )
                }
            }
        }

        // 2. 处理图片区域（每张图片单独一页）
        if (imagesContainer && note.imgs.length > 0) {
            let hasContent = contentElement && contentElement.textContent?.trim().length
            let firstImage = true

            for (const imgName of note.imgs) {
                const imgUrl = `/assets/${imgName}`

                let imgDataUrl: string
                try {
                    imgDataUrl = await loadImageAsDataUrl(imgUrl)
                } catch (error) {
                    handleApiError(error, '加载图片失败')
                    continue
                }

                const img = new Image()
                img.crossOrigin = 'anonymous'

                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve()
                    img.onerror = () => reject(new Error(`Failed to load image: ${imgName}`))
                    img.src = imgDataUrl
                })

                const naturalWidth = img.width
                const naturalHeight = img.height

                if (naturalWidth === 0 || naturalHeight === 0) continue

                // 如果已经有内容页，或者不是第一张图片，添加新页面
                // 如果没有内容页且是第一张图片，使用初始化的空白页
                if (hasContent || !firstImage) {
                    pdf.addPage()
                }
                firstImage = false

                // 计算图片在PDF中的尺寸
                const availableWidth = pageWidth - margin * 2
                const availableHeight = pageHeight - margin * 2

                let finalWidth: number
                let finalHeight: number

                if (naturalWidth / naturalHeight > availableWidth / availableHeight) {
                    finalWidth = availableWidth
                    finalHeight = (naturalHeight * availableWidth) / naturalWidth
                } else {
                    finalHeight = availableHeight
                    finalWidth = (naturalWidth * availableHeight) / naturalHeight
                }

                const finalX = (pageWidth - finalWidth) / 2
                const finalY = (pageHeight - finalHeight) / 2

                pdf.addImage(
                    imgDataUrl,
                    'PNG',
                    finalX,
                    finalY,
                    finalWidth,
                    finalHeight
                )
            }
        }

        // 生成文件名
        const fileName = `${note.title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`
        pdf.save(fileName)
    } finally {
        document.body.removeChild(loadingOverlay)
    }
}
