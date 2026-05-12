<template>
  <section class="hero-section relative">
    <!-- Waves background -->
    <div v-if="shouldRenderWaves" class="waves-bg absolute inset-0">
      <a-waves class="block w-full h-full"><svg class="js-svg"></svg></a-waves>
    </div>
    <!-- Banner title pinned to section bottom -->
    <div class="hero-heading">
      <h1 ref="heroTitle" class="hero-title uppercase" aria-label="DPCC GAMING">
        <FuzzyText
          class="hero-title-line hero-title-line--small"
          text="DPCC"
        />
        <FuzzyText
          class="hero-title-line hero-title-line--large"
          text="GAMING"
        />
      </h1>
    </div>
    <!-- Content on top -->
    <div class="relative z-10 w-full h-full flex items-center justify-center">
      <div class="container mx-auto px-6 md:px-10 h-full flex items-center justify-center">
        <div class="hero-content flex flex-col items-center justify-center text-center">
          <!-- banner is pinned at section level -->

          <!-- Removed middle hero-waves container per request -->

          <p v-if="heroSubtitleText" ref="heroSubtitle" class="hero-subtitle text-black/80 uppercase tracking-[0.4em] font-bold">
            {{ heroSubtitleText }}
          </p>
          <div ref="heroActions" class="hero-actions flex flex-col sm:flex-row items-center gap-4">
            <button @click="scrollToGames" class="hero-button btn-23">
              <span class="text">PLAY</span>
              <span class="marquee" aria-hidden="true">PLAY</span>
            </button>
            <button @click="scrollToFeatures" class="hero-button btn-23">
              <span class="text">MORW</span>
              <span class="marquee" aria-hidden="true">MORW</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- 悬浮小组件 -->
    <div class="new-year-widget">
      <div class="widget-content">
        <div class="widget-text">
          <span class="greeting">DPCC-API稳定的中转体验</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import FuzzyText from './FuzzyText.vue'

gsap.registerPlugin(ScrollTrigger)

const router = useRouter()

const heroTitle = ref(null)
const heroSubtitle = ref(null)
const heroActions = ref(null)

const heroSubtitleText = 'A game aggregation platform for individual developers'
const shouldRenderWaves = ref(
  window.matchMedia('(min-width: 768px)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
)

let heroTimeline = null
let motionMediaQuery = null
let widthMediaQuery = null

const scrollToGames = () => {
  router.push('/games')
}

const scrollToFeatures = () => {
  const gameShowcaseSection = document.querySelector('.game-showcase-section')
  if (gameShowcaseSection) {
    gameShowcaseSection.scrollIntoView({ behavior: 'smooth' })
  }
}

const initAnimations = () => {
  const titleEl = heroTitle.value
  const subtitleEl = heroSubtitle.value
  const actionsEl = heroActions.value

  // Smooth intro: title drops from top -> bottom, others rise slightly
  let titleLines = []
  if (titleEl) {
    titleLines = Array.from(titleEl.querySelectorAll('.hero-title-line'))
    if (titleLines.length) gsap.set(titleLines, { opacity: 0, y: -90 })
    else gsap.set(titleEl, { opacity: 0, y: -80 })
  }
  const others = [subtitleEl, actionsEl].filter(Boolean)
  if (others.length) gsap.set(others, { opacity: 0, y: 50 })

  if (heroTimeline) {
    heroTimeline.kill()
  }

  heroTimeline = gsap.timeline({ delay: 0.15, defaults: { ease: 'power3.out' } })

  if (titleEl) {
    if (titleLines.length) {
      heroTimeline.to(titleLines, { opacity: 1, y: 0, duration: 1.1, ease: 'power4.out', stagger: 0.12 }, 0)
    } else {
      heroTimeline.to(titleEl, { opacity: 1, y: 0, duration: 1.1, ease: 'power4.out' }, 0)
    }
  }

  if (subtitleEl) {
    heroTimeline.to(subtitleEl, { opacity: 1, y: 0, duration: 0.7 }, '-=0.6')
  }

  if (actionsEl) {
    heroTimeline.to(actionsEl, { opacity: 1, y: 0, duration: 0.7 }, '-=0.35')
  }
}

const initScrollAnimations = () => {
  const elements = document.querySelectorAll('.fade-in-up')

  elements.forEach((element) => {
    gsap.fromTo(
      element,
      {
        opacity: 0,
        y: 50
      },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 80%',
          end: 'bottom 20%',
          toggleActions: 'play none none reverse'
        }
      }
    )
  })
}

const updateWavePreference = () => {
  shouldRenderWaves.value = Boolean(widthMediaQuery?.matches) && !Boolean(motionMediaQuery?.matches)
}

const addMediaQueryListener = (query, handler) => {
  if (query.addEventListener) {
    query.addEventListener('change', handler)
  } else {
    query.addListener(handler)
  }
}

const removeMediaQueryListener = (query, handler) => {
  if (!query) return
  if (query.removeEventListener) {
    query.removeEventListener('change', handler)
  } else {
    query.removeListener(handler)
  }
}


// Waves background implementation (self-contained)
class Noise {
  constructor(seed = Math.random()) {
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    let n = Math.floor(seed * 2147483647) || 1
    for (let i = 255; i > 0; i--) {
      n = (n * 16807) % 2147483647
      const r = n % (i + 1)
      const t = p[i]
      p[i] = p[r]
      p[r] = t
    }
    this.perm = new Uint8Array(512)
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }
  lerp(t, a, b) { return a + t * (b - a) }
  grad(hash, x, y) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
  }
  perlin2(x, y) {
    let X = Math.floor(x) & 255
    let Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = this.fade(x)
    const v = this.fade(y)
    const A = this.perm[X] + Y
    const B = this.perm[(X + 1) & 255] + Y
    const g1 = this.grad(this.perm[A], x, y)
    const g2 = this.grad(this.perm[B], x - 1, y)
    const g3 = this.grad(this.perm[(A + 1) & 255], x, y - 1)
    const g4 = this.grad(this.perm[(B + 1) & 255], x - 1, y - 1)
    return this.lerp(v, this.lerp(u, g1, g2), this.lerp(u, g3, g4))
  }
}

class AWaves extends HTMLElement {
  constructor() {
    super()
    // RAF + handlers
    this._raf = 0
    this._tick = this.tick.bind(this)
    this._onResize = this.onResize.bind(this)
    this._onMouseMove = this.onMouseMove.bind(this)
    this._onTouchMove = this.onTouchMove.bind(this)
    this._onVisibility = this.onVisibilityChange.bind(this)
    this._onIntersect = this.onIntersect.bind(this)
    this._resizeTimer = null
    this._mouseFrame = 0
    this._pendingMouse = null
    this._io = null
    this._visible = true
  }
  connectedCallback() {
    this.svg = this.querySelector('.js-svg')
    if (!this.svg) return
    this.mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false }
    this.lines = []
    this.paths = []
    this.noise = new Noise(Math.random())
    this.prevWidth = 0
    this.prevHeight = 0
    this.setSize()
    this.setLines()
    this.bindEvents()
    // Observe visibility within viewport to pause/resume
    this._io = new IntersectionObserver(this._onIntersect, { root: null, threshold: 0.01 })
    this._io.observe(this)
    this._raf = requestAnimationFrame(this._tick)
  }
  disconnectedCallback() {
    // Cleanup to prevent leaks when leaving page
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('mousemove', this._onMouseMove)
    this.removeEventListener('touchmove', this._onTouchMove)
    document.removeEventListener('visibilitychange', this._onVisibility)
    if (this._io) { this._io.disconnect(); this._io = null }
    if (this._raf) cancelAnimationFrame(this._raf)
    if (this._mouseFrame) cancelAnimationFrame(this._mouseFrame)
    this._raf = 0
    this._mouseFrame = 0
    this._pendingMouse = null
    if (this._resizeTimer) { clearTimeout(this._resizeTimer); this._resizeTimer = null }
  }
  bindEvents() {
    window.addEventListener('resize', this._onResize)
    window.addEventListener('mousemove', this._onMouseMove, { passive: true })
    this.addEventListener('touchmove', this._onTouchMove, { passive: true })
    document.addEventListener('visibilitychange', this._onVisibility)
  }
  onVisibilityChange() {
    if (document.hidden) {
      if (this._raf) cancelAnimationFrame(this._raf)
      this._raf = 0
    } else {
      if (!this._raf && this._visible) this._raf = requestAnimationFrame(this._tick)
    }
  }
  onIntersect(entries) {
    const entry = entries && entries[0]
    if (!entry) return
    this._visible = !!entry.isIntersecting
    if (this._visible) {
      if (!this._raf && !document.hidden) this._raf = requestAnimationFrame(this._tick)
    } else {
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0 }
    }
  }
  onResize() {
    // Debounce + only rebuild when size really changed
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    this._resizeTimer = setTimeout(() => {
      this.setSize()
      if (this.bounding && (this.bounding.width !== this.prevWidth || this.bounding.height !== this.prevHeight)) {
        this.setLines()
      }
    }, 100)
  }
  onMouseMove(e) { this.queueMousePosition(e.clientX, e.clientY) }
  onTouchMove(e) {
    const t = e.touches[0]
    if (t) this.queueMousePosition(t.clientX, t.clientY)
  }
  queueMousePosition(x, y) {
    this._pendingMouse = { x, y }
    if (this._mouseFrame) return
    this._mouseFrame = requestAnimationFrame(() => {
      this._mouseFrame = 0
      const point = this._pendingMouse
      this._pendingMouse = null
      if (point) this.updateMousePosition(point.x, point.y)
    })
  }
  updateMousePosition(x, y) {
    const m = this.mouse
    // Use cached bounding from setSize (avoid layout thrash on every move)
    if (!this.bounding) this.bounding = this.getBoundingClientRect()
    m.x = x - this.bounding.left
    m.y = y - this.bounding.top
    if (!m.set) { m.sx = m.x; m.sy = m.y; m.lx = m.x; m.ly = m.y; m.set = true }
  }
  setSize() {
    this.bounding = this.getBoundingClientRect()
    this.svg.style.width = `${this.bounding.width}px`
    this.svg.style.height = `${this.bounding.height}px`
    this.prevWidth = this.bounding.width
    this.prevHeight = this.bounding.height
  }
  setLines() {
    const { width, height } = this.bounding
    this.lines = []
    this.paths.forEach(p => p.remove())
    this.paths = []
    const xGap = 10, yGap = 32
    const oWidth = width + 200, oHeight = height + 30
    const totalLines = Math.ceil(oWidth / xGap)
    const totalPoints = Math.ceil(oHeight / yGap)
    const xStart = (width - xGap * totalLines) / 2
    const yStart = (height - yGap * totalPoints) / 2
    for (let i = 0; i <= totalLines; i++) {
      const points = []
      for (let j = 0; j <= totalPoints; j++) {
        points.push({ x: xStart + xGap * i, y: yStart + yGap * j, wave: { x: 0, y: 0 }, cursor: { x: 0, y: 0, vx: 0, vy: 0 } })
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.classList.add('a__line', 'js-line')
      this.svg.appendChild(path)
      this.paths.push(path)
      this.lines.push(points)
    }
  }
  movePoints(time) {
    const { lines, mouse, noise } = this
    lines.forEach(points => {
      points.forEach(p => {
        const move = noise.perlin2((p.x + time * 0.0125) * 0.002, (p.y + time * 0.005) * 0.0015) * 12
        p.wave.x = Math.cos(move) * 32
        p.wave.y = Math.sin(move) * 16
        const dx = p.x - mouse.sx, dy = p.y - mouse.sy
        const d = Math.hypot(dx, dy)
        const l = Math.max(175, mouse.vs)
        if (d < l) {
          const s = 1 - d / l
          const f = Math.cos(d * 0.001) * s
          p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00065
          p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00065
        }
        p.cursor.vx += (0 - p.cursor.x) * 0.005
        p.cursor.vy += (0 - p.cursor.y) * 0.005
        p.cursor.vx *= 0.925
        p.cursor.vy *= 0.925
        p.cursor.x += p.cursor.vx * 2
        p.cursor.y += p.cursor.vy * 2
        p.cursor.x = Math.min(100, Math.max(-100, p.cursor.x))
        p.cursor.y = Math.min(100, Math.max(-100, p.cursor.y))
      })
    })
  }
  moved(point, withCursorForce = true) {
    const coords = {
      x: point.x + point.wave.x + (withCursorForce ? point.cursor.x : 0),
      y: point.y + point.wave.y + (withCursorForce ? point.cursor.y : 0)
    }
    coords.x = Math.round(coords.x * 10) / 10
    coords.y = Math.round(coords.y * 10) / 10
    return coords
  }
  drawLines() {
    const { lines, moved, paths } = this
    lines.forEach((points, lIndex) => {
      let p1 = moved(points[0], false)
      let d = `M ${p1.x} ${p1.y}`
      points.forEach((pp, pIndex) => {
        const isLast = pIndex === points.length - 1
        p1 = moved(pp, !isLast)
        const p2 = moved(points[pIndex + 1] || points[points.length - 1], !isLast)
        d += `L ${p1.x} ${p1.y}`
      })
      paths[lIndex].setAttribute('d', d)
    })
  }
  tick(time) {
    const mouse = this.mouse
    mouse.sx += (mouse.x - mouse.sx) * 0.1
    mouse.sy += (mouse.y - mouse.sy) * 0.1
    const dx = mouse.x - mouse.lx
    const dy = mouse.y - mouse.ly
    const d = Math.hypot(dx, dy)
    mouse.v = d
    mouse.vs += (d - mouse.vs) * 0.1
    mouse.vs = Math.min(100, mouse.vs)
    mouse.lx = mouse.x
    mouse.ly = mouse.y
    mouse.a = Math.atan2(dy, dx)
    this.style.setProperty('--x', `${mouse.sx}px`)
    this.style.setProperty('--y', `${mouse.sy}px`)
    this.movePoints(time)
    this.drawLines()
    if (this._visible && !document.hidden) {
      this._raf = requestAnimationFrame(this._tick)
    } else {
      this._raf = 0
    }
  }
}

if (!customElements.get('a-waves')) {
  customElements.define('a-waves', AWaves)
}

onMounted(() => {
  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  widthMediaQuery = window.matchMedia('(min-width: 768px)')
  updateWavePreference()
  addMediaQueryListener(motionMediaQuery, updateWavePreference)
  addMediaQueryListener(widthMediaQuery, updateWavePreference)

  requestAnimationFrame(() => {
    initAnimations()
    initScrollAnimations()
  })
})

onUnmounted(() => {
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill())

  if (heroTimeline) {
    heroTimeline.kill()
    heroTimeline = null
  }

  removeMediaQueryListener(motionMediaQuery, updateWavePreference)
  removeMediaQueryListener(widthMediaQuery, updateWavePreference)
  motionMediaQuery = null
  widthMediaQuery = null
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');

  .hero-section {
    background-color: #000000;
    padding: 0;
    height: 94vh;
    width: 100%;
    overflow-x: clip;
    overflow-y: visible;
    transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  [data-theme="light"] .hero-section {
    background-color: #ffffff;
  }
  

.hero-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  overflow: visible;
  padding: clamp(1.5rem, 5vh, 3rem) 0 0;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center; 
  justify-content: center;
  gap: clamp(1rem, 3vh, 2.5rem);
}

.hero-heading {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 1rem clamp(1.25rem, 3vh, 2.5rem);
  z-index: 20;
}

.hero-title {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: center;
  gap: clamp(1rem, 2vw, 2rem);
  width: 100%;
  white-space: nowrap;
  will-change: transform;
  margin-bottom: 15px;
}

:deep(.hero-title-line) {
  display: block;
  line-height: 0.8;
  letter-spacing: 0.04em;
  transform: scaleY(1.3);
  transform-origin: bottom center;
  font-family: 'Bebas Neue', 'Segoe UI', Gadget, Tahoma, Geneva, Arial, sans-serif;
}
@media (max-width: 640px) {
  :deep(.hero-title-line--small),
  :deep(.hero-title-line--large) {
    font-size: clamp(48px, 18vw, 150px);
    transform: scaleY(1.3);
  }
}

:deep(.hero-title-line--small),
:deep(.hero-title-line--large) {
  font-size: clamp(110px, min(12vw, 26vh), 280px);
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #fff9f9;
  transition: color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep([data-theme="light"] .hero-title-line--small),
:deep([data-theme="light"] .hero-title-line--large) {
  color: #000000;
  font-weight: 800;
  font-family: 'Bebas Neue', 'Segoe UI', Gadget, Tahoma, Geneva, Arial, sans-serif;
  letter-spacing: 0.1em;
  transform: translateX(6px);
}

:deep([data-theme="dark"] .hero-title-line--small),
:deep([data-theme="dark"] .hero-title-line--large) {
  color: #ffffff;
  font-weight: 800;
  font-family: 'Bebas Neue', 'Segoe UI', Gadget, Tahoma, Geneva, Arial, sans-serif;
  letter-spacing: 0.1em;
  transform: translateX(6px);
}
/* Remove gradient; use solid black text */

.hero-subtitle {
  font-size: clamp(1rem, 2vw, 1.35rem);
  color: #ffffff;
  transition: color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: 'Bebas Neue', 'Segoe UI', Gadget, Tahoma, Geneva, Arial, sans-serif !important;
  font-smooth: always !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
  text-rendering: optimizeLegibility !important;
}


[data-theme="light"] .hero-subtitle {
  color: #000000;
  font-family: 'Bebas Neue', 'Segoe UI', Gadget, Tahoma, Geneva, Arial, sans-serif;
}

.hero-image-wrapper {
  position: relative;
  width: min(100%, 1520px);
  margin: 30px auto 0;
  z-index: 1;
  display: flex;
  justify-content: center;
  transform: translateY(var(--hero-image-offset, 0));
}

.hero-waves {
  position: relative;
  display: block;
  width: 100%;
  max-width: 1520px;
  margin: -250px auto 20px;
  height: clamp(770px, 68vh, 1000px);
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.06);
  transition: transform 0.6s ease;
  background: transparent;
}

/* Waves background element fills wrapper */
.waves-bg { background: transparent; }

/* Scoped deep selectors for custom element */
:deep(a-waves) {
  --x: -0.5rem;
  --y: 50%;
  color: var(--waves-stroke-current);
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

:deep(a-waves)::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 0.5rem;
  height: 0.5rem;
  background: var(--waves-dot-current);
  border-radius: 50%;
  transform: translate3d(calc(var(--x) - 50%), calc(var(--y) - 50%), 0);
  will-change: transform;
  content: "";
  transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(a-waves) svg { display: block; width: 100%; height: 100%; }
:deep(a-waves) path { 
  fill: none; 
  stroke: currentColor;
  stroke-width: 1px; 
  transition: stroke 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 全局CSS变量定义 */
:global(:root) {
  --waves-stroke-dark: #efecec;
  --waves-dot-dark: #fff7f7;
  --waves-stroke-light: #000000;
  --waves-dot-light: #000000;
}

:global(html[data-theme="light"]) {
  --waves-stroke-current: var(--waves-stroke-light);
  --waves-dot-current: var(--waves-dot-light);
}

:global(html[data-theme="dark"]) {
  --waves-stroke-current: var(--waves-stroke-dark);
  --waves-dot-current: var(--waves-dot-dark);
}

.hero-actions {
  display: flex;
  justify-content: center;
}

.hero-button {
  background-color: rgb(0, 0, 0);
  color: #ffffff;
  border-radius: 9999px;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.9rem 2.75rem;
  transition: transform 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease, color 0.3s ease;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.hero-button:focus {
  outline: none;
}

.hero-button:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.7);
  outline-offset: 4px;
  border-radius: 9999px;
}

.btn-23,
.btn-23 *,
.btn-23 :after,
.btn-23 :before,
.btn-23:after,
.btn-23:before {
  border: 0 solid;
  box-sizing: border-box;
}

.btn-23 {
  -webkit-tap-highlight-color: transparent;
  -webkit-appearance: button;
  background-color: #000;
  background-image: none;
  color: #fff;
  cursor: pointer;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.5;
  margin: 0;
  -webkit-mask-image: -webkit-radial-gradient(#000, #fff);
  padding: 0;
  text-transform: uppercase;
  border-radius: 99rem;
  border-width: 2px;
  overflow: hidden;
  padding: 0.8rem 3rem;
  position: relative;
  display: inline-grid;
  place-items: center;
  min-width: 10rem;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.btn-23:disabled {
  cursor: default;
  opacity: 0.7;
}

.btn-23 span {
  display: grid;
  inset: 0;
  place-items: center;
  position: absolute;
  transition: opacity 0.2s ease;
}

.btn-23 .marquee {
  --spacing: 5em;
  --start: 0em;
  --end: 5em;
  animation: marquee 1s linear infinite;
  animation-play-state: paused;
  opacity: 0;
  position: relative;
  text-shadow: #fff var(--spacing) 0, #fff calc(var(--spacing) * -1) 0, #fff calc(var(--spacing) * -2) 0;
}

.btn-23:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 20px 35px rgba(255, 255, 255, 0.18);
}

.btn-23:hover .marquee {
  animation-play-state: running;
  opacity: 1;
}

.btn-23:hover .text {
  opacity: 0;
}

.btn-23:active {
  transform: translateY(0);
  box-shadow: 0 12px 24px rgba(255, 255, 255, 0.12);
}

@-webkit-keyframes marquee {
  0% {
    transform: translateX(var(--start));
  }

  100% {
    transform: translateX(var(--end));
  }
}

@keyframes marquee {
  0% {
    transform: translateX(var(--start));
  }

  100% {
    transform: translateX(var(--end));
  }
}
@media (max-width: 768px) {
  .hero-section {
    padding: 0;
    height: auto;
    min-height: 100vh;
  }

  .hero-content {
    padding: clamp(1rem, 6vw, 2.5rem) 0 0;
    gap: clamp(1rem, 4vw, 2.5rem);
  }

  .hero-heading {
    padding: 0 1rem clamp(1rem, 4vw, 2rem);
  }
}

@media (max-width: 640px) {
  .hero-title {
    letter-spacing: 0.08em;
  }

  .hero-subtitle {
    letter-spacing: 0.3em;
  }

  .hero-actions {
    width: 100%;
  }

  .hero-button {
    width: 100%;
  }
}

.fade-in-up {
  opacity: 0;
  transform: translateY(40px);
}


.new-year-widget {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 12;
}

.widget-content {
  background: black;
  border-radius: 50px;
  padding: 12px 30px;
  box-shadow: 
    0 4px 15px rgba(0, 0, 0, 0.3),
    0 0 0 2px rgba(109, 108, 108, 0.2);
  position: relative;
  overflow: hidden;
}

.widget-text {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.greeting {
  font-size: 1rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 2px;
  text-transform: uppercase;
  white-space: nowrap;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .new-year-widget {
    top: 14px;
    right: 12px;
  }
  
  .widget-content {
    padding: 10px 25px;
  }
  
  .greeting {
    font-size: 0.9rem;
    letter-spacing: 1.5px;
  }
}

@media (max-width: 480px) {
  .new-year-widget {
    top: 12px;
    right: 8px;
  }
  
  .widget-content {
    padding: 8px 20px;
  }
  
  .greeting {
    font-size: 0.8rem;
    letter-spacing: 1px;
  }
}
</style>
