---
title: 写作指南：如何发布一篇文章
date: 2026-09-27
tags: [教程]
draft: true
excerpt: 写给自己看的备忘：怎么发新文章。
---

> 把本文的 `draft: true` 删掉（或改成 `false`），它就正式上线了。

## 方法一：GitHub 网页直接写（推荐）

1. 打开你的仓库 → 进入 `src/posts/` 目录
2. 点右上角 **Add file → Create new file**
3. 文件名填 `my-post.md`，内容按下面的格式写
4. 点 **Commit changes**，等一分钟左右网站自动更新

## 方法二：本地写

用 VS Code / Obsidian 写好后：

```bash
git add .
git commit -m "新文章"
git push
```

## 文章格式

```markdown
---
title: 文章标题
date: 2026-09-28
tags: [随笔, 技术]
excerpt: 列表页显示的摘要（不写则自动截取正文）
---

正文从这里开始，支持所有 Markdown 语法。
```
