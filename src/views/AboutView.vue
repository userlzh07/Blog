<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

// 在这里修改你的个人信息
const profile = {
  name: 'Userlzh',
  links: [
    { label: 'GitHub', url: 'https://github.com/userlzh07' },
    { label: '知乎', url: 'https://www.zhihu.com/people/24-85-21-16/columns' },
    { label: 'Bilibili', url: 'https://space.bilibili.com/3546724303899607' },
  ],
}

// 专辑墙：自动读取 src/assets/album/ 里的所有封面，新增图片自动上墙。
// 按当前视口大小精确计算格子数（每格约 180px），整墙刚好铺满、没有缺口。
const CELL_MIN = 180
const coverModules = import.meta.glob('../assets/album/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
})

const covers = ref([])
const loadedCovers = ref(new Set())

function markCoverLoaded(index) {
  loadedCovers.value = new Set(loadedCovers.value).add(index)
}

function rebuildCovers() {
  const list = Object.values(coverModules)
  if (!list.length) return
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
  const pool = shuffle(list)
  const cols = Math.max(1, Math.floor(window.innerWidth / CELL_MIN))
  const rows = Math.max(1, Math.ceil(window.innerHeight / CELL_MIN))
  const needed = cols * rows
  const next = []
  for (let i = 0; i < needed; i += 1) next.push(pool[i % pool.length])
  covers.value = next
  loadedCovers.value = new Set()
  // 缓存命中时 load 事件可能不再触发，直接标记已完成
  nextTick(() => {
    const imgs = document.querySelectorAll('.album-wall img')
    imgs.forEach((img, i) => {
      if (img.complete && img.naturalWidth) markCoverLoaded(i)
    })
  })
}

let resizeTimer = 0
function onWallResize() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(rebuildCovers, 200)
}

onMounted(() => {
  rebuildCovers()
  window.addEventListener('resize', onWallResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWallResize)
  window.clearTimeout(resizeTimer)
})
</script>

<template>
  <div class="about-page">
    <!-- 专辑墙背景 -->
    <div class="album-wall" aria-hidden="true">
      <img
        v-for="(src, index) in covers"
        :key="index"
        class="album-cover"
        :class="{ loaded: loadedCovers.has(index) }"
        :src="src"
        alt=""
        loading="lazy"
        @load="markCoverLoaded(index)"
      />
      <div class="album-shade"></div>
    </div>

    <div class="page-container about">
      <div class="about-card">
        <h1 class="serif-title">{{ profile.name }}</h1>

        <div class="links">
          <a
            v-for="link in profile.links"
            :key="link.label"
            :href="link.url"
            target="_blank"
            rel="noopener"
            class="link-btn"
          >
            {{ link.label }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 专辑墙：铺满视口的固定背景 */
.album-wall {
  position: fixed;
  inset: 0;
  z-index: -1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 1fr;
  background: #0a0e24;
}

.album-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.06);
  /* 加载完成后才淡入，1.2s 优雅过渡（与月亮一致） */
  transition:
    opacity 1.2s ease,
    transform 1.2s ease,
    filter 0.4s ease;
  filter: saturate(0.92);
}

.album-cover.loaded {
  opacity: 1;
  transform: scale(1);
}

.album-wall:hover .album-cover.loaded {
  filter: saturate(1.05);
}

/* 压暗 + 四周收暗，保证卡片可读 */
.album-shade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 42%, rgba(10, 14, 36, 0.42) 0%, rgba(10, 14, 36, 0.78) 100%),
    linear-gradient(180deg, rgba(10, 14, 36, 0.5), rgba(10, 14, 36, 0.32) 30%, rgba(10, 14, 36, 0.66));
}

.about {
  max-width: 640px;
}

/* 深色玻璃卡，浮在专辑墙上 */
.about-card {
  padding: 56px 40px;
  text-align: center;
  background: rgba(15, 19, 42, 0.58);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 20px;
  box-shadow: 0 18px 60px rgba(5, 8, 24, 0.5);
}

.avatar {
  width: 96px;
  height: 96px;
  margin: 0 auto 24px;
  border-radius: 50%;
  background: linear-gradient(160deg, var(--sky-mid), var(--horizon-pink));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.6rem;
  box-shadow: 0 12px 32px rgba(99, 179, 237, 0.35);
}

.about-card h1 {
  font-size: 2rem;
  color: #f2f5ff;
}

.links {
  display: flex;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.link-btn {
  padding: 10px 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1.5px solid rgba(255, 255, 255, 0.38);
  color: #e9edf9;
  font-size: 0.92rem;
  transition: all 0.3s ease;
}

.link-btn:hover {
  background: var(--sky-mid);
  border-color: var(--sky-mid);
  color: #fff;
  box-shadow: 0 0 26px rgba(138, 90, 160, 0.55);
}
</style>
