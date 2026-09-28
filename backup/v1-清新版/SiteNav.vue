<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 40
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <nav class="site-nav" :class="{ scrolled }">
    <router-link to="/" class="logo serif-title">云之上</router-link>
    <div class="links">
      <router-link to="/" exact-active-class="active">首页</router-link>
      <router-link to="/posts" active-class="active">文章</router-link>
      <router-link to="/about" active-class="active">关于</router-link>
    </div>
  </nav>
</template>

<style scoped>
.site-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 32px;
  transition: all 0.4s ease;
}

.site-nav.scrolled {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px rgba(43, 108, 184, 0.1);
  padding: 12px 32px;
}

.logo {
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 12px rgba(43, 108, 184, 0.4);
  transition: color 0.4s ease, text-shadow 0.4s ease;
}

.scrolled .logo {
  color: var(--sky-deep);
  text-shadow: none;
}

.links {
  display: flex;
  gap: 28px;
}

.links a {
  color: #fff;
  font-size: 0.95rem;
  text-shadow: 0 1px 8px rgba(43, 108, 184, 0.4);
  position: relative;
  padding-bottom: 4px;
  transition: color 0.4s ease, text-shadow 0.4s ease;
}

.scrolled .links a {
  color: var(--text-secondary);
  text-shadow: none;
}

.links a::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--sky-mid), var(--horizon-pink));
  border-radius: 2px;
  transition: all 0.3s ease;
  transform: translateX(-50%);
}

.links a:hover::after,
.links a.active::after {
  width: 100%;
}

@media (max-width: 600px) {
  .site-nav {
    padding: 14px 18px;
  }
  .links {
    gap: 18px;
  }
}
</style>
