// Markdown 文章加载器
// 在 src/posts/ 下新建 .md 文件即可发布文章，格式见文件头注释

// Vite 构建时把所有文章打包进来（key 形如 ../posts/xxx.md）
const files = import.meta.glob('../posts/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})

// 极简 front matter 解析（YAML 子集：只支持字符串和 [a, b] 数组）
function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { meta: {}, body: raw }

  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    const [, key, value] = kv
    const arr = value.match(/^\[(.*)\]$/)
    if (arr) {
      meta[key] = arr[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      meta[key] = value.trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return { meta, body: raw.slice(match[0].length) }
}

export const posts = Object.entries(files)
  .map(([path, raw]) => {
    const slug = path.match(/\/([^/]+)\.md$/)[1]
    const { meta, body } = parseFrontMatter(raw)
    return {
      slug,
      title: meta.title || slug,
      date: meta.date || '',
      tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
      excerpt: meta.excerpt || '',
      draft: meta.draft === 'true' || meta.draft === true,
      body,
    }
  })
  .filter((p) => !p.draft) // 草稿不发布
  .sort((a, b) => (a.date < b.date ? 1 : -1)) // 日期新的在前

export function getPost(slug) {
  return posts.find((p) => p.slug === slug)
}

export function getAllTags() {
  return [...new Set(posts.flatMap((p) => p.tags))]
}
