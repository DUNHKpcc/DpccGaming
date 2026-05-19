<template>
  <div class="home-page">
    <HeroSection />

    <section
      ref="gameShowcaseHost"
      class="deferred-section game-showcase-section"
    >
      <GameShowcase v-if="showGameShowcase" />
    </section>

    <Footer />

    <section
      ref="brandRevealHost"
      class="deferred-section"
    >
      <BrandRevealSection v-if="showBrandReveal" />
    </section>
  </div>
</template>

<script setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import Footer from '../components/Footer.vue'
import HeroSection from '../components/HeroSection.vue'

const GameShowcase = defineAsyncComponent(() => import('../components/GameShowcase.vue'))
const BrandRevealSection = defineAsyncComponent(() => import('../components/BrandRevealSection.vue'))

const gameShowcaseHost = ref(null)
const brandRevealHost = ref(null)
const showGameShowcase = ref(true)
const showBrandReveal = ref(false)

const observers = []

const mountWhenVisible = (targetRef, visibleRef, rootMargin = '320px 0px') => {
  if (visibleRef.value) return

  const target = targetRef.value
  if (!target || typeof window === 'undefined') {
    visibleRef.value = true
    return
  }

  if (!('IntersectionObserver' in window)) {
    visibleRef.value = true
    return
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries[0]?.isIntersecting) return
    visibleRef.value = true
    observer.disconnect()
  }, { rootMargin })

  observer.observe(target)
  observers.push(observer)
}

onMounted(() => {
  mountWhenVisible(gameShowcaseHost, showGameShowcase, '360px 0px')
  mountWhenVisible(brandRevealHost, showBrandReveal, '240px 0px')
})

onBeforeUnmount(() => {
  observers.forEach((observer) => observer.disconnect())
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
}

.deferred-section {
  min-height: 1px;
}
</style>
