<script setup>
import { computed } from 'vue'
import { posts } from '../lib/posts'
import SkyCanvas from '../components/SkyCanvas.vue'

const recentPosts = computed(() => posts.slice(0, 3))

function excerpt(post) {
  if (post.excerpt) return post.excerpt
  // 从正文提取纯文本摘要
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
      <div class="hero-content">
        <h1 class="serif-title">云之上</h1>
        <p class="subtitle">把心事写在云层里，等风来读</p>
        <router-link to="/posts" class="cta">进入文章 →</router-link>
      </div>
      <div class="scroll-hint">↓ 向下滚动</div>
    </section>

    <!-- 最新文章 -->
    <section class="recent">
      <div class="page-container">
        <h2 class="section-title serif-title">最新文章</h2>
        <div class="post-grid">
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
    0 4px 30px rgba(30, 90, 168, 0.5),
    0 0 80px rgba(255, 240, 180, 0.4);
  letter-spacing: 0.2em;
  animation: float 6s ease-in-out infinite;
}

.subtitle {
  margin-top: 20px;
  font-size: clamp(1rem, 2.5vw, 1.3rem);
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 12px rgba(30, 90, 168, 0.5);
  letter-spacing: 0.3em;
}

.cta {
  margin-top: 48px;
  padding: 12px 40px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  color: #fff;
  letter-spacing: 0.15em;
  transition: all 0.35s ease;
}

.cta:hover {
  background: rgba(255, 255, 255, 0.45);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 255, 255, 0.3);
}

.scroll-hint {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
  letter-spacing: 0.2em;
  animation: bounce 2.4s ease-in-out infinite;
  z-index: 2;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-14px); }
}

@keyframes bounce {
  0%, 100% { transform: translate(-50%, 0); opacity: 0.85; }
  50% { transform: translate(-50%, 10px); opacity: 0.4; }
}

/* 最新文章区 */
.section-title {
  font-size: 2rem;
  color: var(--sky-deep);
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
  color: var(--sky-deep);
  font-weight: 600;
  letter-spacing: 0.1em;
  border-bottom: 2px solid transparent;
  transition: border-color 0.3s ease;
}

.more-link:hover {
  border-color: var(--sky-mid);
}
</style>
