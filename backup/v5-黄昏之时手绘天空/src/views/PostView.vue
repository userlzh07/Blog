<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import { getPost, posts } from '../lib/posts'

const props = defineProps({ slug: String })
const router = useRouter()

const post = computed(() => getPost(props.slug))
const html = computed(() => (post.value ? marked.parse(post.value.body) : ''))

// 上一篇 / 下一篇
const index = computed(() => posts.findIndex((p) => p.slug === props.slug))
const newer = computed(() => (index.value > 0 ? posts[index.value - 1] : null))
const older = computed(() =>
  index.value >= 0 && index.value < posts.length - 1 ? posts[index.value + 1] : null,
)

if (!post.value) router.replace('/posts')

marked.setOptions({ breaks: true })
</script>

<template>
  <div class="page-container" v-if="post">
    <article class="glass-card article">
      <header class="article-header">
        <h1 class="serif-title">{{ post.title }}</h1>
        <div class="meta">
          <span class="date">{{ post.date }}</span>
          <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </header>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="markdown-body" v-html="html"></div>
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
</template>

<style scoped>
.article {
  padding: clamp(28px, 6vw, 64px);
}

.article-header {
  text-align: center;
  padding-bottom: 28px;
  margin-bottom: 36px;
  border-bottom: 1px solid rgba(99, 179, 237, 0.25);
}

.article-header h1 {
  font-size: clamp(1.7rem, 4.5vw, 2.4rem);
  color: var(--text-primary);
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
  color: var(--text-faint);
  font-size: 0.9rem;
  margin-right: 8px;
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
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(10px);
  color: var(--text-secondary);
  font-size: 0.9rem;
  transition: all 0.3s ease;
  max-width: 45%;
}

.nav-btn:hover {
  color: var(--sky-deep);
  box-shadow: var(--glass-shadow);
}

.next {
  margin-left: auto;
  text-align: right;
}
</style>

<style>
/* ========== Markdown 排版（全局，作用于 v-html 内容） ========== */
.markdown-body {
  font-size: 1.02rem;
  color: var(--text-secondary);
  line-height: 2;
  word-break: break-word;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  font-family: var(--font-serif);
  color: var(--text-primary);
  margin: 1.6em 0 0.6em;
  line-height: 1.5;
}

.markdown-body h2 {
  font-size: 1.5rem;
  padding-left: 14px;
  border-left: 4px solid var(--sky-mid);
}

.markdown-body h3 {
  font-size: 1.25rem;
}

.markdown-body p {
  margin: 1em 0;
}

.markdown-body a {
  color: var(--sky-deep);
  border-bottom: 1px solid rgba(43, 108, 184, 0.35);
  transition: border-color 0.25s ease;
}

.markdown-body a:hover {
  border-color: var(--sky-deep);
}

.markdown-body img {
  max-width: 100%;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(43, 108, 184, 0.15);
  margin: 1.2em auto;
  display: block;
}

.markdown-body blockquote {
  margin: 1.2em 0;
  padding: 14px 22px;
  border-left: 4px solid var(--horizon-pink);
  background: rgba(251, 213, 224, 0.25);
  border-radius: 0 12px 12px 0;
  color: var(--text-secondary);
}

.markdown-body blockquote p {
  margin: 0;
}

.markdown-body code {
  font-family: 'Cascadia Code', Consolas, monospace;
  background: rgba(99, 179, 237, 0.14);
  color: #2c5282;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.9em;
}

.markdown-body pre {
  background: #1e293b;
  border-radius: 12px;
  padding: 20px 24px;
  overflow-x: auto;
  margin: 1.2em 0;
  box-shadow: 0 8px 28px rgba(30, 41, 59, 0.25);
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
  background: linear-gradient(90deg, transparent, var(--sky-mid), transparent);
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
  border: 1px solid rgba(99, 179, 237, 0.3);
  padding: 10px 14px;
}

.markdown-body th {
  background: rgba(99, 179, 237, 0.12);
  font-weight: 600;
}
</style>
