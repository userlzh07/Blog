<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import { getPost, posts } from '../lib/posts'
import MoonArchiveScene from '../components/MoonArchiveScene.vue'

const props = defineProps({ slug: String })
const router = useRouter()

const post = computed(() => getPost(props.slug))
const articleBody = ref(null)

function prepareArticleHtml(body) {
  if (typeof DOMParser === 'undefined') return marked.parse(body)
  const parsed = new DOMParser().parseFromString(marked.parse(body), 'text/html')
  for (const formula of parsed.querySelectorAll('.ztext-math')) {
    const tex = formula.getAttribute('data-tex') || formula.querySelector('.math-holder')?.textContent?.trim()
    if (!tex) continue

    if (formula.querySelector('.MathJax_SVG')) {
      formula.querySelectorAll('.MathJax_Preview, .math-holder').forEach((node) => node.remove())
      continue
    }

    const replacement = parsed.createElement('span')
    replacement.className = 'blog-tex-math'
    replacement.dataset.tex = tex
    replacement.textContent = `\\(${tex}\\)`
    formula.replaceWith(replacement)
  }
  return parsed.body.innerHTML
}

const html = computed(() => (post.value ? prepareArticleHtml(post.value.body) : ''))

let mathJaxPromise
function loadMathJax() {
  if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax)
  if (mathJaxPromise) return mathJaxPromise

  window.MathJax = {
    startup: { typeset: false },
    tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] },
    svg: { fontCache: 'global' },
  }

  mathJaxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@4.0.0/tex-svg.js'
    script.async = true
    script.onload = async () => {
      try {
        await window.MathJax.startup.promise
        resolve(window.MathJax)
      } catch (error) {
        reject(error)
      }
    }
    script.onerror = () => reject(new Error('MathJax failed to load'))
    document.head.append(script)
  })
  return mathJaxPromise
}

async function typesetArticleMath() {
  const root = articleBody.value
  if (!root || !root.querySelector('.blog-tex-math')) return
  try {
    const mathJax = await loadMathJax()
    await mathJax.typesetPromise([root])
  } catch (error) {
    root.querySelectorAll('.blog-tex-math').forEach((node) => {
      node.textContent = node.dataset.tex || node.textContent
    })
    console.error('文章公式排版失败', error)
  }
}

watch(
  html,
  () => {
    const root = articleBody.value
    if (root) window.MathJax?.typesetClear?.([root])
    nextTick(typesetArticleMath)
  },
  { flush: 'pre' },
)

// 上一篇 / 下一篇
const index = computed(() => posts.findIndex((p) => p.slug === props.slug))
const newer = computed(() => (index.value > 0 ? posts[index.value - 1] : null))
const older = computed(() =>
  index.value >= 0 && index.value < posts.length - 1 ? posts[index.value + 1] : null,
)

if (!post.value) router.replace('/posts')

marked.setOptions({ breaks: true })

onMounted(() => {
  document.body.classList.add('moon-page-active')
  typesetArticleMath()
})
onUnmounted(() => {
  if (articleBody.value) window.MathJax?.typesetClear?.([articleBody.value])
  document.body.classList.remove('moon-page-active')
})
</script>

<template>
  <div class="post-page">
    <!-- 月亮背景（与文章列表页同一组件）
         关键行内样式确保首帧即正确：避免 CSS 加载完成前出现未缩放/无遮罩的中间态 -->
    <div
      class="moon-bg"
      aria-hidden="true"
      :style="{ position: 'fixed', inset: '0', background: '#070b1e' }"
    >
      <div class="moon-bg-scaler" :style="{ transform: 'scale(1.35)' }">
        <MoonArchiveScene />
      </div>
      <div class="moon-bg-shade"></div>
    </div>

    <div class="page-container post-content" v-if="post">
      <article class="article" :style="{ background: 'rgba(15, 19, 42, 0.6)', color: 'rgba(226, 232, 248, 0.88)' }">
        <header class="article-header">
          <h1 class="serif-title">{{ post.title }}</h1>
          <div class="meta">
            <span class="date">{{ post.date }}</span>
            <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </header>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div ref="articleBody" class="markdown-body" v-html="html"></div>
      </article>

      <nav class="post-nav">
        <router-link v-if="newer" :to="`/post/${newer.slug}`" class="nav-btn prev">
          ← {{ newer.title }}
        </router-link>
        <span v-else></span>
        <router-link v-if="older" :to="`/post/${older.slug}`" class="nav-btn next">
          {{ older.title }} →
        </router-link>
      </nav>
    </div>
  </div>
</template>

<style scoped>
/* 月亮背景层：固定铺满视口，压暗保证正文可读 */
.moon-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #070b1e;
  pointer-events: none;
}

.moon-bg-scaler {
  transform: scale(1.35);
}

/* 月相说明文字作背景时隐藏 */
.moon-bg :deep(.moon-caption) {
  display: none;
}

.moon-bg-shade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 45%, rgba(7, 11, 30, 0.18) 0%, rgba(7, 11, 30, 0.72) 100%),
    linear-gradient(180deg, rgba(7, 11, 30, 0.5), rgba(7, 11, 30, 0.3) 30%, rgba(7, 11, 30, 0.68));
}

.post-content {
  position: relative;
  z-index: 1;
}

/* 深色玻璃文章卡 */
.article {
  padding: clamp(28px, 6vw, 64px);
  background: rgba(15, 19, 42, 0.6);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  box-shadow: 0 18px 60px rgba(5, 8, 24, 0.5);
}

.article-header {
  text-align: center;
  padding-bottom: 28px;
  margin-bottom: 36px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
}

.article-header h1 {
  font-size: clamp(1.7rem, 4.5vw, 2.4rem);
  color: #eef2fc;
  line-height: 1.4;
}

.meta {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.date {
  color: rgba(190, 200, 228, 0.75);
  font-size: 0.9rem;
  margin-right: 8px;
}

.meta .tag {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.35);
  color: rgba(226, 232, 248, 0.9);
}

.post-nav {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 32px;
}

.nav-btn {
  padding: 12px 22px;
  border-radius: 12px;
  background: rgba(15, 19, 42, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(12px);
  color: rgba(226, 232, 248, 0.88);
  font-size: 0.9rem;
  transition: all 0.3s ease;
  max-width: 45%;
}

.nav-btn:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 26px rgba(138, 90, 160, 0.45);
}

.next {
  margin-left: auto;
  text-align: right;
}
</style>

<style>
/* ========== Markdown 排版（全局，作用于 v-html 内容；夜色主题） ========== */
.markdown-body {
  font-size: 1.02rem;
  color: rgba(226, 232, 248, 0.88);
  line-height: 2;
  word-break: break-word;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  font-family: var(--font-serif);
  color: #eef2fc;
  margin: 1.6em 0 0.6em;
  line-height: 1.5;
}

.markdown-body h2 {
  font-size: 1.5rem;
  padding-left: 14px;
  border-left: 4px solid var(--sky-light);
}

.markdown-body h3 {
  font-size: 1.25rem;
}

.markdown-body p {
  margin: 1em 0;
}

.markdown-body a {
  color: #a9c8ff;
  border-bottom: 1px solid rgba(169, 200, 255, 0.4);
  transition: border-color 0.25s ease;
}

.markdown-body a:hover {
  border-color: #a9c8ff;
}

.markdown-body img {
  max-width: 100%;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(5, 8, 24, 0.5);
  margin: 1.2em auto;
  display: block;
}

.markdown-body blockquote {
  margin: 1.2em 0;
  padding: 14px 22px;
  border-left: 4px solid var(--horizon-pink);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 0 12px 12px 0;
  color: rgba(226, 232, 248, 0.82);
}

.markdown-body blockquote p {
  margin: 0;
}

.markdown-body code {
  font-family: 'Cascadia Code', Consolas, monospace;
  background: rgba(138, 90, 160, 0.28);
  color: #ffe0b0;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.9em;
}

.markdown-body pre {
  background: #161d33;
  border-radius: 12px;
  padding: 20px 24px;
  overflow-x: auto;
  margin: 1.2em 0;
  box-shadow: 0 8px 28px rgba(5, 8, 24, 0.45);
}

.markdown-body pre code {
  background: none;
  color: #e2e8f0;
  padding: 0;
}

.markdown-body ul,
.markdown-body ol {
  padding-left: 1.6em;
  margin: 1em 0;
}

.markdown-body li {
  margin: 0.35em 0;
}

.markdown-body hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  margin: 2.4em 0;
}

.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.2em 0;
  font-size: 0.95rem;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid rgba(255, 255, 255, 0.16);
  padding: 10px 14px;
}

.markdown-body th {
  background: rgba(255, 255, 255, 0.08);
  font-weight: 600;
}

/* Zhihu stores three layers per rendered equation: SVG, assistive MathML,
   and a raw TeX fallback. Keep the visual SVG once, while retaining the
   MathML as screen-reader-only content. */
.markdown-body .ztext-math:has(.MathJax_SVG) .MathJax_Preview,
.markdown-body .ztext-math:has(.MathJax_SVG) .math-holder {
  display: none !important;
}

.markdown-body .zhihu-math-definitions {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.markdown-body .zhihu-math-definitions svg {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.markdown-body .ztext-math:has(.MathJax_SVG) .MJX_Assistive_MathML {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
</style>
