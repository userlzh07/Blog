# Userlzh's Blog

「黄昏之时」风格（《你的名字》×《天气之子》）的个人博客，Vue 3 + Vite + Markdown，部署在 GitHub Pages。
黄昏渐变天幕、彗星、穿透云层的阳光、逆光金边云、远山与城市灯火，全部由 Canvas 实时绘制。

## 本地开发

```bash
npm install     # 第一次运行需要
npm run dev     # 启动本地预览（默认 http://localhost:5173）
npm run build   # 构建到 dist/
```

## 虚拟时间预览

访问 `/?preview=1` 可打开预览面板，调整虚拟时间和流逝速度：

- `previewTime=2026-09-27T18:30`：指定虚拟起点（默认今天 18:30）
- `timeScale=60`：1 秒现实时间流逝 60 秒虚拟时间，也可在面板中选择最高 3600×
- 预览时间只影响页面场景，不依赖打开页面时的真实时刻

预览中的彗星遵循：太阳完全落山后出现、约 10 颗/小时；仅下午落日后的暮光可出现双尾，夜晚和清晨朝霞均为单尾。

## 发布到 GitHub Pages（只需设置一次）

1. 在 GitHub 新建一个仓库，命名为 `你的用户名.github.io`
2. 推送代码：

```bash
git init
git add .
git commit -m "初始化博客"
git branch -M main
git remote add origin https://github.com/你的用户名/你的用户名.github.io.git
git push -u origin main
```

3. 打开仓库 → **Settings → Pages**
4. **Source** 选择 **GitHub Actions**
5. 完成！以后每次 `git push` 都会自动构建部署，约 1-2 分钟后可通过
   `https://你的用户名.github.io` 访问

> 如果仓库名不是 `用户名.github.io`（而是比如 `blog`），网站地址会是
> `https://你的用户名.github.io/blog`，代码无需任何改动。

## 写文章

在 `src/posts/` 目录新建 `.md` 文件，格式如下：

```markdown
---
title: 文章标题
date: 2026-09-28
tags: [随笔, 技术]
excerpt: 文章摘要（可选，不填则自动截取正文）
---

正文，支持所有 Markdown 语法。
```

- 文件名（不含 `.md`）就是文章网址，建议用英文短横线，如 `my-first-post.md`
- 加 `draft: true` 可设为草稿，不会发布
- 想删文章，删掉对应文件即可

### 方式一：GitHub 网页直接写（不用开电脑装环境）

打开仓库 → `src/posts/` → **Add file → Create new file** → Commit，自动部署。

### 方式二：本地写（写作体验更好）

用 Obsidian / Typora / VS Code 编辑，然后：

```bash
git add .
git commit -m "新文章：xxx"
git push
```

## 自定义

| 想改什么 | 去哪改 |
|----------|--------|
| 站点名 / 首页标题 / 副标题 | `index.html`、`src/views/HomeView.vue` |
| 导航栏名字（"Userlzh's Blog"） | `src/components/SiteNav.vue` |
| 关于我页面 | `src/views/AboutView.vue`（文件顶部就是个人信息） |
| 关于页专辑墙封面 | 把图片丢进 `src/assets/album/` 自动上墙，无需改代码 |
| 天空颜色 / 整体配色 | `src/style.css` 顶部的 `:root` 变量 |
| 首页标题漂浮、光效强度 | `src/components/SkyCanvas.vue` |
| 彗星出现频率 / 星星数量 | `src/components/SkyCanvas.vue` 顶部常量 |

## 风格备份

- `backup/v1-清新版/` —— 第一版（明亮蓝天白云）
- `backup/v2-紫暮版/` —— 第二版（紫粉暮色 + 彗星）
- `backup/v3-渐变山脉动态版/` —— 第三版（渐变山脉动态背景）
- `backup/v4-星空粒子3D背景/` —— 第四版（星空粒子 3D 背景）
- `backup/v5-黄昏之时手绘天空/` —— 第五版（当前方案，黄昏之时手绘分层天空 + 彗星光粒拖尾）

每个备份里保存了该版本的关键文件（`style.css`、`SkyCanvas.vue`、`HomeView.vue` 等）。
`v5` 起改为整目录备份（`src/`、`public/sky/`、`tools/` 等），恢复时整目录覆盖回项目根即可。
想换回旧风格，把文件复制回 `src/` 对应位置即可。备份目录不参与构建和部署。

## 天空场景烘焙器

首页的天空不是实时程序化绘制的，而是 `tools/bake-sky.mjs` **离线烘焙**的
分层手绘风场景图（纯 JS 软件光栅化，零依赖），输出在 `public/sky/`：

```bash
node tools/bake-sky.mjs all           # 重烘全部图层
node tools/bake-sky.mjs clouds-mid    # 只重烘某一层（back / clouds-mid / mountains / water）
```

- 积云：puff 溅射成形 + 平滑最大融合 + 赛璐璐分带着色（受光/轮廓光）
- 群山：4 层山脊 + 空气透视 + 落日金边 + 小镇灯火
- 运行时（`src/components/SkyCanvas.vue`）：图层视差 + 云带漂移 + 彗星 + 湖面波光 + 飞鸟 + 胶片颗粒
- 鼠标拖尾（`src/components/CometTrail.vue`）：全站生效的彗星光粒拖尾
- 改构图/配色都在 `tools/bake-sky.mjs` 里调参数重烘即可

## 项目结构

```
├── .github/workflows/deploy.yml  # 自动部署配置
├── src/
│   ├── posts/                    # ★ 你的文章都在这里（Markdown）
│   ├── components/SkyCanvas.vue  # 新海诚天空动画
│   ├── views/                    # 首页 / 文章列表 / 文章 / 关于
│   ├── lib/posts.js              # 文章加载器（构建时解析 Markdown）
│   ├── lib/sceneClock.js         # 场景时钟：太阳位置算法 + 虚拟时间，供天空与背景图共用
│   └── style.css                 # 全局样式与配色
└── vite.config.js
```
