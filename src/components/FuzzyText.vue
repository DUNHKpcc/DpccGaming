<template>
  <!--
    The canvas inherits size/position from parent CSS (e.g. .hero-title-line),
    so wrapping elements keep their original layout.
  -->
  <canvas ref="canvasRef" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  fontWeight: {
    type: [String, Number],
    default: 900
  },
  fontFamily: {
    type: String,
    default: 'inherit'
  },
  enableHover: {
    type: Boolean,
    default: true
  },
  baseIntensity: {
    type: Number,
    default: 0.18
  },
  hoverIntensity: {
    type: Number,
    default: 0.5
  }
})

const canvasRef = ref(null)

let animationFrameId = null
let cleanupFn = null
let themeObserver = null

const setupFuzzyText = async () => {
  const canvas = canvasRef.value
  if (!canvas) return

  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
    }
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const computedStyle = window.getComputedStyle(canvas)
  const computedFontFamily =
    props.fontFamily === 'inherit'
      ? computedStyle.fontFamily || 'sans-serif'
      : props.fontFamily

  const computedFontSizeStr = computedStyle.fontSize || '100px'
  const numericFontSize = parseFloat(computedFontSizeStr) || 100

  const root = document.documentElement
  const currentTheme = root ? root.getAttribute('data-theme') : null
  let themeColor = null
  if (currentTheme === 'light') themeColor = '#000000'
  else if (currentTheme === 'dark') themeColor = '#ffffff'

  const colorFromCss = themeColor || computedStyle.color || '#ffffff'

  const text = props.text

  const offscreen = document.createElement('canvas')
  const offCtx = offscreen.getContext('2d')
  if (!offCtx) return

  const fontWeightStr = typeof props.fontWeight === 'number' ? `${props.fontWeight}` : props.fontWeight
  const fontStr = `${fontWeightStr} ${computedFontSizeStr} ${computedFontFamily}`

  offCtx.font = fontStr
  offCtx.textBaseline = 'alphabetic'

  const metrics = offCtx.measureText(text)

  const actualLeft = metrics.actualBoundingBoxLeft ?? 0
  const actualRight = metrics.actualBoundingBoxRight ?? metrics.width
  const actualAscent = metrics.actualBoundingBoxAscent ?? numericFontSize
  const actualDescent = metrics.actualBoundingBoxDescent ?? numericFontSize * 0.2

  const textBoundingWidth = Math.ceil(actualLeft + actualRight)
  const tightHeight = Math.ceil(actualAscent + actualDescent)

  const extraWidthBuffer = 10
  const offscreenWidth = textBoundingWidth + extraWidthBuffer

  offscreen.width = offscreenWidth
  offscreen.height = tightHeight

  const xOffset = extraWidthBuffer / 2
  offCtx.font = fontStr
  offCtx.textBaseline = 'alphabetic'
  offCtx.fillStyle = colorFromCss
  offCtx.fillText(text, xOffset - actualLeft, actualAscent)

  const horizontalMargin = 50
  const verticalMargin = 0
  canvas.width = offscreenWidth + horizontalMargin * 2
  canvas.height = tightHeight + verticalMargin * 2

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.translate(horizontalMargin, verticalMargin)

  const interactiveLeft = horizontalMargin + xOffset
  const interactiveTop = verticalMargin
  const interactiveRight = interactiveLeft + textBoundingWidth
  const interactiveBottom = interactiveTop + tightHeight

  let isHovering = false
  const fuzzRange = 30

  const run = () => {
    ctx.clearRect(-fuzzRange, -fuzzRange, offscreenWidth + 2 * fuzzRange, tightHeight + 2 * fuzzRange)
    const intensity = isHovering && props.enableHover ? props.hoverIntensity : props.baseIntensity
    for (let j = 0; j < tightHeight; j++) {
      const dx = Math.floor(intensity * (Math.random() - 0.5) * fuzzRange)
      ctx.drawImage(offscreen, 0, j, offscreenWidth, 1, dx, j, offscreenWidth, 1)
    }
    animationFrameId = window.requestAnimationFrame(run)
  }

  run()

  const isInsideTextArea = (x, y) => {
    return x >= interactiveLeft && x <= interactiveRight && y >= interactiveTop && y <= interactiveBottom
  }

  const handleMouseMove = (e) => {
    if (!props.enableHover) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    isHovering = isInsideTextArea(x, y)
  }

  const handleMouseLeave = () => {
    isHovering = false
  }

  const handleTouchMove = (e) => {
    if (!props.enableHover) return
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    isHovering = isInsideTextArea(x, y)
  }

  const handleTouchEnd = () => {
    isHovering = false
  }

  if (props.enableHover) {
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)
  }

  cleanupFn = () => {
    if (animationFrameId != null) {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (props.enableHover) {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }
}

onMounted(() => {
  setupFuzzyText()
  const root = document.documentElement
  if (root && 'MutationObserver' in window) {
    themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setupFuzzyText()
          break
        }
      }
    })
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  }
})

onBeforeUnmount(() => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }
  if (animationFrameId != null) {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
})

watch(
  () => [props.text, props.fontWeight, props.fontFamily, props.enableHover, props.baseIntensity, props.hoverIntensity],
  () => {
    setupFuzzyText()
  }
)
</script>

<style scoped>
canvas {
  display: block;
}
</style>
