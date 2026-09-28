<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { posts } from '../lib/posts'
import SkyCanvas from '../components/SkyCanvas.vue'
import TimePreviewControls from '../components/TimePreviewControls.vue'

const recentPosts = computed(() => posts.slice(0, 3))

// 滚动视差：标题随滚动上移淡出
const scrollY = ref(0)
function onScroll() {
  scrollY.value = window.scrollY
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))

const heroStyle = computed(() => ({
  transform: `translateY(${scrollY.value * 0.4}px)`,
  opacity: Math.max(0, 1 - scrollY.value / 600),
}))

// 光标追光：卡片上的柔光跟随鼠标
function onCardMove(e) {
  const card = e.target.closest('.glass-card')
  if (!card) return
  const r = card.getBoundingClientRect()
  card.style.setProperty('--mx', `${e.clientX - r.left}px`)
  card.style.setProperty('--my', `${e.clientY - r.top}px`)
}

function excerpt(post) {
  if (post.excerpt) return post.excerpt
  const text = post.body
    .replace(/[#>*`\-\[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 90) + (text.length > 90 ? '…' : '')
}
</script>

<template>
  <div class="home">
    <!-- 全屏天空 Hero -->
    <section class="hero">
      <SkyCanvas />

      <div class="hero-content" :style="heroStyle">
        <router-link to="/posts" class="cta">进入文章 →</router-link>
      </div>

      <!-- 底部渐入文章的过渡光带 -->
      <div class="horizon-fade"></div>
      <div class="scroll-hint">↓ 向下滚动</div>
      <TimePreviewControls />
    </section>

    <!-- 最新文章 -->
    <section class="recent">
      <div class="page-container">
        <h2 class="section-title serif-title">最新文章</h2>
        <div class="post-grid" @mousemove="onCardMove">
          <router-link
            v-for="post in recentPosts"
            :key="post.slug"
            :to="`/post/${post.slug}`"
            class="post-card glass-card"
          >
            <div class="post-date">{{ post.date }}</div>
            <h3 class="post-title serif-title">{{ post.title }}</h3>
            <p class="post-excerpt">{{ excerpt(post) }}</p>
            <div class="post-tags">
              <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </router-link>
        </div>
        <div class="more">
          <router-link to="/posts" class="more-link">查看全部文章 →</router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  height: 100vh;
  overflow: hidden;
}

/* 竖排文字已移除 */

.hero-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  z-index: 2;
}

.hero-content h1 {
  font-size: clamp(3rem, 9vw, 5.5rem);
  color: #fff;
  text-shadow:
    0 2px 12px rgba(45, 42, 99, 0.85),
    0 4px 34px rgba(45, 42, 99, 0.65),
    0 0 90px rgba(255, 215, 160, 0.55);
  letter-spacing: 0.2em;
  animation:
    riseIn 1.4s cubic-bezier(0.22, 1, 0.36, 1) backwards,
    float 7s ease-in-out 1.4s infinite;
}

.subtitle {
  margin-top: 20px;
  font-size: clamp(1rem, 2.5vw, 1.3rem);
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 14px rgba(45, 42, 99, 0.55);
  letter-spacing: 0.3em;
  animation: riseIn 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.25s backwards;
}

.cta {
  margin-top: 0;
  padding: 12px 40px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(8px);
  color: #fff;
  letter-spacing: 0.15em;
  box-shadow: 0 0 30px rgba(255, 200, 150, 0.15);
  transition: all 0.35s ease;
  animation: riseIn 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.5s backwards;
}

.cta:hover {
  background: rgba(255, 255, 255, 0.28);
  box-shadow: 0 0 44px rgba(255, 215, 165, 0.5), inset 0 0 18px rgba(255, 255, 255, 0.18);
}

/* 底部过渡：湖面深蓝平滑融入文章区 */
.horizon-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 26vh;
  background: linear-gradient(
    180deg,
    rgba(10, 16, 48, 0) 0%,
    rgba(10, 16, 48, 0.55) 70%,
    rgba(12, 16, 46, 0.92) 100%
  );
  pointer-events: none;
  z-index: 1;
}

.scroll-hint {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  letter-spacing: 0.2em;
  text-shadow: 0 1px 8px rgba(120, 70, 40, 0.4);
  animation: bounce 2.4s ease-in-out infinite;
  z-index: 2;
}

@keyframes riseIn {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-14px); }
}

@keyframes bounce {
  0%, 100% { transform: translate(-50%, 0); opacity: 0.9; }
  50% { transform: translate(-50%, 10px); opacity: 0.4; }
}

/* 最新文章区：从深蓝夜色渐变过渡到紫色背景 */
.recent {
  background: linear-gradient(
    180deg,
    rgba(12, 16, 46, 0.92) 0%,
    rgba(30, 28, 75, 0.55) 18%,
    rgba(61, 58, 125, 0) 38%
  );
}

.section-title {
  font-size: 2rem;
  color: #e8e4f5;
  text-shadow: 0 2px 16px rgba(20, 16, 60, 0.5);
  margin-bottom: 36px;
  text-align: center;
}

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.post-card {
  display: block;
  padding: 28px;
}

.post-date {
  font-size: 0.82rem;
  color: var(--text-faint);
  letter-spacing: 0.1em;
}

.post-title {
  font-size: 1.3rem;
  margin: 10px 0 12px;
  color: var(--text-primary);
}

.post-excerpt {
  font-size: 0.92rem;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-tags {
  margin-top: 16px;
}

.more {
  text-align: center;
  margin-top: 40px;
}

.more-link {
  color: #5a4a8f;
  font-weight: 600;
  letter-spacing: 0.1em;
  border-bottom: 2px solid transparent;
  transition: border-color 0.3s ease;
}

.more-link:hover {
  border-color: var(--sky-mid);
}

@media (max-width: 600px) {
  .hero-content h1 {
    letter-spacing: 0.12em;
  }
}
</style>
