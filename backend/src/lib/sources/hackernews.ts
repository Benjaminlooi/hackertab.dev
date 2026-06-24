import type { Article } from '../../types'

const HN_API = 'https://hacker-news.firebaseio.com/v0'

export async function fetchHackerNews(_opts?: { tags?: string[] }): Promise<Article[]> {
  // Fetch top story IDs (limit to 30 for performance)
  const idsRes = await fetch(`${HN_API}/topstories.json?limitToFirst=30&orderBy="priority"`)
  if (!idsRes.ok) throw new Error(`HackerNews API error: ${idsRes.status}`)
  const ids: number[] = await idsRes.json()

  // Fetch each item in parallel (small batch)
  const items = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${HN_API}/item/${id}.json`)
      if (!res.ok) return null // Skip failed items
      return res.json()
    })
  )

  // Filter out nulls (failed fetches) and job stories
  return items
    .filter((item): item is NonNullable<typeof item> => item !== null && item.type === 'story')
    .map((item) => ({
      id: String(item.id),
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      title: item.title || '',
      tags: [],
      comments_count: item.descendants || 0,
      points_count: item.score || 0,
      image_url: '',
      published_at: (item.time || 0) * 1000,
      source: 'hackernews',
      canonical_url: `https://news.ycombinator.com/item?id=${item.id}`,
      description: '',
    } as Article))
}
