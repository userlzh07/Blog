# v3 · 环形山湖静态版

快照日期：2026-09-26

这是后续三维改造前的完整项目快照，保留当前静态环形山湖首页、动画、图片资源、构建产物和项目配置。`node_modules` 未复制，可根据 `package-lock.json` 重新安装依赖。

主要内容：

- `src/`：全部 Vue 源码和样式
- `public/sky/`：当前场景图层，包含 `crater-scene.png`
- `dist/`：当前构建产物
- `tools/`、`.github/`、`index.html`、`package.json`、`package-lock.json`、`vite.config.js`、`README.md`
- `example.png`：环形山湖风格参考图

可直接从此目录恢复文件；主页场景入口为 `src/components/SkyCanvas.vue`。
