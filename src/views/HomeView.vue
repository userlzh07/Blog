<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { posts } from '../lib/posts'
import { sceneMood, startSceneClock, stopSceneClock } from '../lib/sceneClock'
import SkyCanvas from '../components/SkyCanvas.vue'
import CloudCityScene from '../components/CloudCityScene.vue'
import TimePreviewControls from '../components/TimePreviewControls.vue'

const baseUrl = import.meta.env.BASE_URL

const recentPosts = computed(() => posts.slice(0, 3))

// 滚动视差：标题随滚动上移淡出
const scrollY = ref(0)
function onScroll() {
  scrollY.value = window.scrollY
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  startSceneClock()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  stopSceneClock()
})

// 卡片文字颜色自适应：白天深字、夜晚浅字，黄昏/黎明在两者之间平滑过渡
const mixChannel = (a, b, t) => Math.round(a + (b - a) * t)
function mixRgb(dark, light, t) {
  return `rgb(${mixChannel(dark[0], light[0], t)}, ${mixChannel(dark[1], light[1], t)}, ${mixChannel(dark[2], light[2], t)})`
}

const recentSectionStyle = computed(() => {
  const t = 1 - sceneMood.value.daylight
  return {
    '--card-text': mixRgb([45, 55, 72], [238, 242, 252], t),
  }
})

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
        <h1 class="serif-title">Userlzh's Blog</h1>
        <router-link to="/posts" class="cta">进入文章 →</router-link>
      </div>

      <!-- 底部渐入文章的过渡光带 -->
      <div class="horizon-fade"></div>
      <div class="scroll-hint">↓ 向下滚动</div>
      <TimePreviewControls />
    </section>

    <!-- 云海之城：人物在日落时落到男孩伸出的手边，最新文章叠在同一幅场景里 -->
    <section class="recent" :style="recentSectionStyle">
      <div class="recent-art">
        <CloudCityScene
          class="recent-scene"
          :girl-src="`${baseUrl}cloud-city-girl.png`"
        />
        <div class="page-container recent-content">
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
  letter-spacing: 0.06em;
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
  margin-top: 36px;
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

/* 底部过渡：湖面深蓝平滑融入文章区，末端与文章区顶部同为 100% 不透明，消除分割线 */
.horizon-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 26vh;
  background: linear-gradient(
    180deg,
    rgba(12, 16, 46, 0) 0%,
    rgba(12, 16, 46, 0.55) 60%,
    rgba(12, 16, 46, 1) 100%
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

/* 云海之城作为完整画布，最新文章悬浮在底部云层上。 */
.recent {
  display: block;
  margin-top: -1px;
  background: #0b1130;
}

.recent-art {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #0b1130;
}

.recent-art::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: clamp(40px, 6vh, 70px);
  z-index: 2;
  background: linear-gradient(
    180deg,
    rgba(11, 17, 48, 0.88) 0%,
    rgba(11, 17, 48, 0.56) 32%,
    rgba(11, 17, 48, 0.18) 68%,
    transparent 100%
  );
  pointer-events: none;
}

.recent-scene {
  position: relative;
  z-index: 1;
}

.recent-content {
  position: absolute;
  inset: auto auto clamp(24px, 4vw, 44px) clamp(24px, 4vw, 64px);
  z-index: 3;
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  width: min(420px, 36vw);
  max-width: 420px;
  padding: 0;
}

.section-title {
  font-size: 2rem;
  color: #fff;
  text-shadow: 0 2px 18px rgba(10, 18, 52, 0.85), 0 0 40px rgba(10, 18, 52, 0.5);
  margin-bottom: clamp(12px, 1.8vw, 20px);
  text-align: left;
}

.post-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.post-card {
  display: block;
  padding: clamp(16px, 2vw, 22px);
  background: rgba(12, 19, 50, 0.52);
}

.post-date {
  font-size: 0.82rem;
  color: rgba(233, 238, 249, 0.75);
  text-shadow: 0 1px 8px rgba(10, 18, 52, 0.45);
  letter-spacing: 0.1em;
}

.post-title {
  font-size: 1.3rem;
  margin: 10px 0 12px;
  color: var(--card-text);
  transition: color 2s ease;
}

.post-excerpt {
  font-size: 0.92rem;
  color: rgba(240, 244, 252, 0.9);
  text-shadow: 0 1px 8px rgba(10, 18, 52, 0.4);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-tags .tag {
  background: rgba(255, 255, 255, 0.22);
  border-color: rgba(255, 255, 255, 0.55);
  color: rgba(240, 244, 252, 0.85);
  text-shadow: 0 1px 6px rgba(10, 18, 52, 0.4);
}

.post-tags {
  margin-top: 16px;
}

.more {
  text-align: left;
  margin-top: clamp(14px, 1.6vw, 20px);
  padding-left: 4px;
}

.more-link {
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-shadow: 0 1px 10px rgba(10, 18, 52, 0.7);
  border-bottom: 2px solid transparent;
  transition: border-color 0.3s ease;
}

.more-link:hover {
  border-color: rgba(255, 255, 255, 0.85);
}

@media (max-width: 600px) {
  .hero-content h1 {
    letter-spacing: 0.12em;
  }

  .recent-content {
    inset: 18px 14px auto auto;
    width: min(280px, 72vw);
  }

  .section-title {
    font-size: 1.5rem;
    margin-bottom: 12px;
  }

  .post-card {
    padding: 15px;
  }

  .post-excerpt,
  .post-tags {
    display: none;
  }

  .post-title {
    font-size: 1.05rem;
    margin: 7px 0 0;
  }

  .more {
    margin-top: 10px;
  }
}
</style>
