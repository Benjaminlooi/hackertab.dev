import type { Article } from '../../types'

const DEVTO_API = 'https://dev.to/api'

export async function fetchDevTo(opts?: { tags?: string[] }): Promise<Article[]> {
  const tag = opts?.tags?.[0] || 'programming'
  const res = await fetch(`${DEVTO_API}/articles?tag=${encodeURIComponent(tag)}&per_page=30`, {
    headers: {
      'Accept': 'application/vnd.forem.api-v1+json',
      'User-Agent': 'hackertab-backend/1.0',
    },
  })
  if (!res.ok) throw new Error(`DevTo API error: ${res.status}`)
  const articles = await res.json() as any[]

  return articles.map((a) => ({
    id: String(a.id),
    url: a.url,
    title: a.title,
    tags: a.tag_list ? a.tag_list.split(',').filter(Boolean) : [],
    comments_count: a.comments_count || 0,
    points_count: a.positive_reactions_count || 0,
    image_url: a.cover_image || a.social_image || '',
    published_at: a.published_at ? Date.parse(a.published_at) : 0,
    source: 'devto',
    canonical_url: a.canonical_url,
    description: (a.description || '').slice(0, 200),
  } as Article))
}
