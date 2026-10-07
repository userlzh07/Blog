<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MoonArchiveScene from '../components/MoonArchiveScene.vue'
import { posts } from '../lib/posts'

// 固定分类：课程分类紧跟科研，方便在同一组入口中浏览
const CATEGORIES = ['全部', '随笔', '科研', '课程']
const activeTag = ref('全部')
const archiveScrolled = ref(false)

const filtered = computed(() =>
  activeTag.value === '全部'
    ? posts
    : posts.filter((p) => p.tags.includes(activeTag.value)),
)

function updateArchiveScroll() {
  archiveScrolled.value = window.scrollY > 260
}

onMounted(() => {
  document.body.classList.add('moon-page-active')
  updateArchiveScroll()
  window.addEventListener('scroll', updateArchiveScroll, { passive: true })
})
onUnmounted(() => {
  document.body.classList.remove('moon-page-active')
  window.removeEventListener('scroll', updateArchiveScroll)
})
</script>

<template>
  <main class="moon-archive" :class="{ 'archive-scrolled': archiveScrolled }">
    <section class="moon-hero" aria-labelledby="archive-title">
      <div class="hero-copy">
        <p class="hero-kicker">MOONLIT ARCHIVE</p>
        <p class="hero-subtitle">THE JOURNAL</p>
        <h1 id="archive-title" class="hero-title serif-title">月下手记</h1>
        <div class="filter-bar">
          <button
            v-for="tag in CATEGORIES"
            :key="tag"
            class="filter-btn"
            :class="{ active: tag === activeTag }"
            @click="activeTag = tag"
          >
            {{ tag }}
          </button>
        </div>
        <div id="archive-list" class="timeline hero-timeline">
          <router-link
            v-for="post in filtered"
            :key="post.slug"
            :to="`/post/${post.slug}`"
            class="timeline-item glass-card"
          >
            <div class="item-date">{{ post.date }}</div>
            <div class="item-body">
              <h2 class="item-title serif-title">{{ post.title }}</h2>
              <div class="item-tags">
                <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </div>
            <div class="item-arrow">→</div>
          </router-link>
        </div>
        <p v-if="!filtered.length" class="empty">这个分类下还没有文章～</p>
      </div>
      <MoonArchiveScene class="moon-backdrop" />
      <a class="scroll-cue" href="#archive-list" aria-label="向下浏览文章">
        <span></span>
      </a>
    </section>
  </main>
</template>

<style scoped>
.moon-archive {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  overflow: hidden;
  color: #f7f0e7;
  background:
    radial-gradient(ellipse at 50% 34%, rgba(38, 49, 83, 0.34), transparent 40%),
    linear-gradient(180deg, #080b19 0%, #10162a 46%, #171827 76%, #211c27 100%);
}

.moon-archive::before,
.moon-archive::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.moon-archive::before {
  opacity: 0.7;
  background-repeat: no-repeat;
  background-image:
    radial-gradient(circle 1px at 8% 8%, rgba(255, 239, 208, 0.8) 55%, transparent 100%),
    radial-gradient(circle 1px at 17% 23%, rgba(188, 207, 245, 0.62) 55%, transparent 100%),
    radial-gradient(circle 1.5px at 28% 12%, rgba(255, 232, 194, 0.76) 55%, transparent 100%),
    radial-gradient(circle 1px at 39% 31%, rgba(212, 219, 255, 0.62) 55%, transparent 100%),
    radial-gradient(circle 1px at 54% 7%, rgba(255, 238, 210, 0.62) 55%, transparent 100%),
    radial-gradient(circle 1.4px at 66% 18%, rgba(203, 220, 255, 0.68) 55%, transparent 100%),
    radial-gradient(circle 1px at 79% 11%, rgba(255, 232, 194, 0.72) 55%, transparent 100%),
    radial-gradient(circle 1px at 93% 24%, rgba(212, 219, 255, 0.6) 55%, transparent 100%),
    radial-gradient(circle 1px at 4% 43%, rgba(255, 238, 210, 0.58) 55%, transparent 100%),
    radial-gradient(circle 1.3px at 21% 52%, rgba(203, 220, 255, 0.62) 55%, transparent 100%),
    radial-gradient(circle 1px at 34% 45%, rgba(255, 232, 194, 0.55) 55%, transparent 100%),
    radial-gradient(circle 1px at 48% 61%, rgba(212, 219, 255, 0.6) 55%, transparent 100%),
    radial-gradient(circle 1.5px at 61% 42%, rgba(255, 238, 210, 0.62) 55%, transparent 100%),
    radial-gradient(circle 1px at 75% 55%, rgba(203, 220, 255, 0.55) 55%, transparent 100%),
    radial-gradient(circle 1px at 89% 47%, rgba(255, 232, 194, 0.66) 55%, transparent 100%),
    radial-gradient(circle 1px at 11% 77%, rgba(212, 219, 255, 0.58) 55%, transparent 100%),
    radial-gradient(circle 1.4px at 29% 88%, rgba(255, 238, 210, 0.55) 55%, transparent 100%),
    radial-gradient(circle 1px at 45% 79%, rgba(203, 220, 255, 0.6) 55%, transparent 100%),
    radial-gradient(circle 1px at 70% 84%, rgba(255, 232, 194, 0.58) 55%, transparent 100%),
    radial-gradient(circle 1.3px at 91% 75%, rgba(212, 219, 255, 0.64) 55%, transparent 100%),
    radial-gradient(circle 1px at 13% 34%, rgba(255, 232, 194, 0.48) 55%, transparent 100%),
    radial-gradient(circle 1.2px at 31% 28%, rgba(207, 222, 255, 0.52) 55%, transparent 100%),
    radial-gradient(circle 1px at 47% 19%, rgba(255, 238, 210, 0.5) 55%, transparent 100%),
    radial-gradient(circle 1px at 58% 32%, rgba(212, 219, 255, 0.5) 55%, transparent 100%),
    radial-gradient(circle 1.3px at 72% 29%, rgba(255, 232, 194, 0.56) 55%, transparent 100%),
    radial-gradient(circle 1px at 86% 36%, rgba(203, 220, 255, 0.48) 55%, transparent 100%),
    radial-gradient(circle 1px at 18% 66%, rgba(255, 238, 210, 0.48) 55%, transparent 100%),
    radial-gradient(circle 1.1px at 38% 69%, rgba(203, 220, 255, 0.5) 55%, transparent 100%),
    radial-gradient(circle 1px at 57% 73%, rgba(255, 232, 194, 0.5) 55%, transparent 100%),
    radial-gradient(circle 1px at 81% 68%, rgba(212, 219, 255, 0.48) 55%, transparent 100%),
    radial-gradient(circle 1px at 96% 91%, rgba(255, 238, 210, 0.5) 55%, transparent 100%);
}

.moon-archive::after {
  top: auto;
  height: 240px;
  background: linear-gradient(180deg, transparent, rgba(230, 171, 125, 0.035));
}

.moon-hero {
  position: relative;
  z-index: 1;
  min-height: min(940px, 100svh);
  padding: clamp(84px, 9vh, 112px) 24px 70px;
  isolation: isolate;
}

.moon-backdrop {
  position: fixed !important;
  z-index: 0;
  top: 50svh !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
}

.archive-scrolled :deep(.moon-caption) {
  opacity: 0;
}

.hero-copy {
  position: relative;
  z-index: 2;
  width: min(860px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hero-kicker,
.hero-subtitle {
  color: rgba(233, 200, 157, 0.67);
  font-size: 0.65rem;
  letter-spacing: 0.36em;
}

.hero-subtitle {
  margin-top: 9px;
  color: rgba(245, 226, 197, 0.76);
}

.hero-title {
  margin-top: 1px;
  line-height: 1.25;
  color: #f5e9d6;
  font-size: clamp(1.75rem, 3vw, 2.35rem);
  font-weight: 400;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  text-shadow: 0 4px 28px rgba(0, 0, 0, 0.48);
}

.scroll-cue {
  position: absolute;
  z-index: 2;
  bottom: 22px;
  left: 50%;
  width: 22px;
  height: 32px;
  border: 1px solid rgba(246, 221, 185, 0.38);
  border-radius: 999px;
  transform: translateX(-50%);
}

.scroll-cue span {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 3px;
  height: 6px;
  border-radius: 3px;
  background: #f4d39d;
  animation: scroll-hint 1.7s ease-in-out infinite;
}

@keyframes scroll-hint {
  0%, 100% { opacity: 0.35; transform: translate(-50%, 0); }
  70% { opacity: 1; transform: translate(-50%, 8px); }
}

.archive-content {
  z-index: 1;
  margin-top: -400px;
  padding-top: 0;
  padding-bottom: 100px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 36px;
}

.hero-copy .filter-bar {
  gap: 8px;
  margin: 14px 0 0;
}

.hero-timeline {
  width: 100%;
  margin-top: 28px;
}

.filter-btn {
  padding: 6px 20px;
  border-radius: 999px;
  border: 1px solid rgba(238, 216, 184, 0.23);
  background: rgba(255, 255, 255, 0.035);
  color: rgba(248, 236, 219, 0.72);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: inherit;
}

.filter-btn:hover {
  background: rgba(250, 227, 193, 0.12);
}

.filter-btn.active {
  background: rgba(214, 165, 112, 0.22);
  border-color: rgba(237, 198, 144, 0.62);
  color: #f7dba9;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 22px 28px;
  border-color: rgba(244, 221, 190, 0.14);
  background: rgba(255, 255, 255, 0.018);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
}

.timeline-item:hover {
  box-shadow: 0 0 0 1px rgba(235, 201, 159, 0.3), 0 10px 36px rgba(0, 0, 0, 0.24);
}

.timeline-item.glass-card::after {
  background: radial-gradient(
    240px circle at var(--mx, 50%) var(--my, 50%),
    rgba(245, 213, 170, 0.13),
    transparent 68%
  );
}

.item-date {
  font-size: 0.85rem;
  color: rgba(232, 216, 196, 0.48);
  min-width: 96px;
  letter-spacing: 0.05em;
}

.item-body {
  flex: 1;
}

.item-title {
  font-size: 1.2rem;
  margin-bottom: 6px;
  color: #f0e4d4;
}

.item-tags {
  font-size: 0.85rem;
}

.item-tags .tag {
  background: rgba(228, 191, 143, 0.1);
  border-color: rgba(228, 191, 143, 0.18);
  color: rgba(248, 230, 205, 0.72);
}

.item-arrow {
  color: #dfb679;
  font-size: 1.2rem;
}

.empty {
  text-align: center;
  color: rgba(232, 216, 196, 0.56);
  padding: 60px 0;
}

@media (max-width: 600px) {
  .moon-hero { min-height: min(820px, 100svh); padding-inline: 12px; }
  .timeline-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .item-arrow {
    display: none;
  }
}
</style>
