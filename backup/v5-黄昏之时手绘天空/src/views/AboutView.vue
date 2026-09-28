<script setup>
// 在这里修改你的个人信息
const profile = {
  name: '你的名字',
  motto: '把心事写在云层里，等风来读',
  bio: '这里写一段自我介绍。比如你是谁、在学什么/做什么、喜欢什么。\n比如：一名热爱天空与代码的学生，喜欢新海诚的动画，相信美好的事物值得被记录。',
  links: [
    { label: 'GitHub', url: 'https://github.com/你的用户名' },
    { label: '邮箱', url: 'mailto:you@example.com' },
    { label: 'Bilibili', url: 'https://space.bilibili.com/' },
  ],
}
</script>

<template>
  <div class="page-container about">
    <div class="glass-card about-card">
      <div class="avatar">☁️</div>
      <h1 class="serif-title">{{ profile.name }}</h1>
      <p class="motto">{{ profile.motto }}</p>
      <p class="bio">{{ profile.bio }}</p>

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
</template>

<style scoped>
.about {
  max-width: 640px;
}

.about-card {
  padding: 56px 40px;
  text-align: center;
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
  color: var(--text-primary);
}

.motto {
  margin-top: 10px;
  color: var(--sky-deep);
  letter-spacing: 0.15em;
  font-size: 0.95rem;
}

.bio {
  margin: 28px auto;
  max-width: 420px;
  color: var(--text-secondary);
  white-space: pre-line;
  text-align: left;
  line-height: 2;
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
  background: rgba(255, 255, 255, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  color: var(--text-secondary);
  font-size: 0.92rem;
  transition: all 0.3s ease;
}

.link-btn:hover {
  background: var(--sky-mid);
  border-color: var(--sky-mid);
  color: #fff;
  box-shadow: 0 0 26px rgba(99, 179, 237, 0.35);
}
</style>
