import { ref, onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue'

export function useWaterfallLayout(imagesRef: Ref<HTMLElement | null>, imagesList: Ref<string[]>) {
    const itemStyles = ref<Record<number, Record<string, string>>>({})
    const imageHeights = ref<Record<number, number>>({})

    function getColumns(): number {
        if (!imagesRef.value) return 1
        const w = imagesRef.value.offsetWidth
        if (!w || w <= 0) return 1
        if (w >= 1150) return 3
        if (w >= 850) return 2
        return 1
    }

    function layoutWaterfall(): void {
        if (!imagesRef.value || imagesList.value.length === 0) return
        
        const count = getColumns()
        const containerWidth = imagesRef.value.offsetWidth
        if (!containerWidth || containerWidth <= 0) return
        
        const gap = count >= 3 ? 20 : 15
        const colWidth = (containerWidth - gap * (count - 1)) / count
        const colHeights = new Array(count).fill(0)
        const styles: Record<number, Record<string, string>> = {}

        imagesList.value.forEach((_, i) => {
            const col = colHeights.indexOf(Math.min(...colHeights))

            let actualHeight: number
            if (imageHeights.value[i]) {
                const ratio = imageHeights.value[i]
                actualHeight = colWidth * ratio
            } else {
                actualHeight = colWidth * 0.75
            }

            styles[i] = {
                position: 'absolute',
                left: `${col * (colWidth + gap)}px`,
                top: `${colHeights[col]}px`,
                width: `${colWidth}px`,
            }

            colHeights[col] += actualHeight + gap
        })

        itemStyles.value = styles
        imagesRef.value.style.height = `${Math.max(...colHeights, 0)}px`
    }

    function onImageLoaded(index: number, e: Event): void {
        const img = e.target as HTMLImageElement
        if (img.naturalWidth && img.naturalHeight) {
            imageHeights.value = {
                ...imageHeights.value,
                [index]: img.naturalHeight / img.naturalWidth,
            }
            nextTick(layoutWaterfall)
        }
    }

    function resetLayout(): void {
        imageHeights.value = {}
        itemStyles.value = {}
        nextTick(layoutWaterfall)
    }

    let resizeObserver: ResizeObserver | null = null

    function setupObserver(): void {
        if (resizeObserver) {
            resizeObserver.disconnect()
        }
        if (imagesRef.value) {
            resizeObserver = new ResizeObserver(() => {
                nextTick(layoutWaterfall)
            })
            resizeObserver.observe(imagesRef.value)
        }
    }

    function handleLayout(): void {
        if (!imagesRef.value || imagesList.value.length === 0) return
        setupObserver()
        layoutWaterfall()
    }

    onMounted(() => {
        nextTick(handleLayout)
    })

    onUnmounted(() => {
        resizeObserver?.disconnect()
    })

    watch(imagesList, () => {
        nextTick(handleLayout)
    })

    watch(imagesRef, (newVal) => {
        if (newVal) {
            nextTick(handleLayout)
        }
    })

    return {
        itemStyles,
        onImageLoaded,
        resetLayout,
    }
}