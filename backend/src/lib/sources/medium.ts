import { XMLParser } from 'fast-xml-parser'
import type { Article } from '../../types'

const MEDIUM_FEED = 'https://medium.com/feed/tag'

// Keep `media:thumbnail` and `content:encoded` namespaced (removeNSPrefix: false)
// and drop the `@_` prefix on attributes so `media:thumbnail.url` works directly.
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: false,
  attributeNamePrefix: '',
  // Force RSS items into an array even when the feed has a single <item>.
  isArray: (_name, _jpath, isLeafNode) => !isLeafNode && _name === 'item',
})

type RssItem = {
  title?: string
  link?: string
  guid?: string | { '#text': string; '@_isPermaLink'?: string }
  category?: string | string[]
  pubDate?: string
  'media:thumbnail'?: { url?: string }
  'media:content'?: { url?: string }
  'content:encoded'?: string
}

function textOf(value: string | { '#text': string } | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && typeof value['#text'] === 'string') return value['#text']
  return ''
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

export async function fetchMedium(opts?: { tags?: string[] }): Promise<Article[]> {
  const tag = opts?.tags?.[0] || 'programming'
  const url = `${MEDIUM_FEED}/${encodeURIComponent(tag)}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Medium RSS error: ${res.status}`)

  const xml = await res.text()
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } }
  const rawItems = parsed?.rss?.channel?.item ?? []
  const items: RssItem[] = Array.isArray(rawItems) ? rawItems : [rawItems]

  return items.map((item) => {
    const link = textOf(item.link as never) || ''
    const description = stripHtml(textOf(item['content:encoded'] as never)).slice(0, 200)

    const categories = item.category
    const tags: string[] = Array.isArray(categories)
      ? categories.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : typeof categories === 'string' && categories.length > 0
        ? [categories]
        : []

    return {
      id: textOf(item.guid as never) || link,
      url: link,
      title: textOf(item.title as never),
      tags,
      comments_count: 0,
      points_count: 0,
      image_url: item['media:thumbnail']?.url || item['media:content']?.url || '',
      published_at: item.pubDate ? Date.parse(item.pubDate) : 0,
      source: 'medium',
      canonical_url: link,
      description,
    } as Article
  })
}
