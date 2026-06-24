import { XMLParser } from 'fast-xml-parser'
import type { Article } from '../../types'

const HACKERNOON_BASE = 'https://hackernoon.com'

// fast-xml-parser instance — keep namespace prefixes (dc:, media:, content:)
// and surface attributes under the @_ prefix so we can read e.g.
//   item['media:thumbnail']?.['@_url']
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  // Force these to always be arrays even when only one element is present.
  isArray: (name) => name === 'item' || name === 'category',
})

type RssItem = {
  title?: string
  link?: string
  guid?: string | { '#text': string; '@_isPermaLink'?: string }
  pubDate?: string
  'dc:creator'?: string
  'media:thumbnail'?: { '@_url'?: string }
  'content:encoded'?: string
  category?: string | string[]
}

// Strip HTML tags from an arbitrary string. Collapses whitespace and
// decodes a few common HTML entities so the description reads cleanly.
function stripHtml(input: string | undefined): string {
  if (!input) return ''
  const noTags = input.replace(/<[^>]*>/g, '')
  const decoded = noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  return decoded.replace(/\s+/g, ' ').trim()
}

function readGuid(raw: RssItem['guid']): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && typeof raw['#text'] === 'string') return raw['#text']
  return ''
}

function readCategories(raw: RssItem['category']): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === 'string')
  if (typeof raw === 'string') return [raw]
  return []
}

export async function fetchHackerNoon(opts?: { tags?: string[] }): Promise<Article[]> {
  const tag = opts?.tags?.[0]
  const url = tag
    ? `${HACKERNOON_BASE}/tagged/${encodeURIComponent(tag)}/feed`
    : `${HACKERNOON_BASE}/feed`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'hackertab-backend/1.0',
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HackerNoon API error: ${res.status}`)

  const xml = await res.text()
  const parsed = xmlParser.parse(xml) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } }
  }
  const items = parsed.rss?.channel?.item
  if (!items) return []
  const itemList: RssItem[] = Array.isArray(items) ? items : [items]

  return itemList.map((item) => {
    const description = stripHtml(item['content:encoded']).slice(0, 200)
    return {
      id: readGuid(item.guid),
      url: item.link ?? '',
      title: item.title ?? '',
      tags: readCategories(item.category),
      comments_count: 0,
      points_count: 0,
      image_url: item['media:thumbnail']?.['@_url'] ?? '',
      published_at: item.pubDate ? Date.parse(item.pubDate) : 0,
      source: 'hackernoon',
      description,
    } as Article
  })
}
