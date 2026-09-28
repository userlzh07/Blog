<script setup>
import { ref, computed } from 'vue'
import { posts, getAllTags } from '../lib/posts'

const allTags = getAllTags()
const activeTag = ref('全部')

const filtered = computed(() =>
  activeTag.value === '全部'
    ? posts
    : posts.filter((p) => p.tags.includes(activeTag.value)),
)
</script>

<template>
  <div class="page-container">
    <h1 class="page-title serif-title">文章</h1>

    <!-- 标签筛选 -->
    <div class="filter-bar" v-if="allTags.length">
      <button
        v-for="tag in ['全部', ...allTags]"
        :key="tag"
        class="filter-btn"
        :class="{ active: tag === activeTag }"
        @click="activeTag = tag"
      >
        {{ tag }}
      </button>
    </div>

    <!-- 时间线列表 -->
    <div class="timeline">
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
</template>

<style scoped>
.page-title {
  font-size: 2.4rem;
  color: var(--sky-deep);
  text-align: center;
  margin-bottom: 28px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 36px;
}

.filter-btn {
  padding: 6px 20px;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.4);
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: inherit;
}

.filter-btn:hover {
  background: rgba(255, 255, 255, 0.7);
}

.filter-btn.active {
  background: var(--sky-mid);
  border-color: var(--sky-mid);
  color: #fff;
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
}

.item-date {
  font-size: 0.85rem;
  color: var(--text-faint);
  min-width: 96px;
  letter-spacing: 0.05em;
}

.item-body {
  flex: 1;
}

.item-title {
  font-size: 1.2rem;
  margin-bottom: 6px;
}

.item-tags {
  font-size: 0.85rem;
}

.item-arrow {
  color: var(--sky-mid);
  font-size: 1.2rem;
}

.empty {
  text-align: center;
  color: var(--text-faint);
  padding: 60px 0;
}

@media (max-width: 600px) {
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
