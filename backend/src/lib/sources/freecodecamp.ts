import { XMLParser } from 'fast-xml-parser'
import type { Article } from '../../types'

const RSS_URL = 'https://www.freecodecamp.org/news/rss/'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

/**
 * Coerce a parsed XML node into its text value.
 * fast-xml-parser returns either a string (leaf with no attrs/text-only),
 * an object with `#text` (leaf with attributes), or undefined.
 */
function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if ('#text' in obj) return asText(obj['#text'])
    return ''
  }
  return ''
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s
}

function readMediaUrl(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const attrs = node as Record<string, unknown>
  const url = attrs['@_url']
  return typeof url === 'string' ? url : ''
}

function readTags(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((t) => asText(t)).filter(Boolean)
  const single = asText(raw)
  return single ? [single] : []
}

export async function fetchFreeCodeCamp(_opts?: { tags?: string[] }): Promise<Article[]> {
  const res = await fetch(RSS_URL)
  if (!res.ok) throw new Error(`FreeCodeCamp RSS error: ${res.status}`)
  const xml = await res.text()

  // Second arg `true` enables fast-xml-parser's strict tag-balance validation;
  // default mode is lenient and silently accepts truncated/malformed XML.
  const parsed = parser.parse(xml, true) as Record<string, any>
  const items = parsed?.rss?.channel?.item
  if (!items) return []

  const list: Record<string, any>[] = Array.isArray(items) ? items : [items]

  return list.map((item) => {
    const contentEncoded = asText(item['content:encoded'])
    const creator = asText(item['dc:creator'])
    const description = contentEncoded
      ? truncate(stripHtml(contentEncoded), 200)
      : creator

    const imageUrl =
      readMediaUrl(item['media:content']) || readMediaUrl(item['media:thumbnail']) || ''

    return {
      id: asText(item.guid),
      url: asText(item.link),
      title: asText(item.title),
      tags: readTags(item.category),
      comments_count: 0,
      points_count: 0,
      image_url: imageUrl,
      published_at: item.pubDate ? Date.parse(asText(item.pubDate)) : 0,
      source: 'freecodecamp',
      description,
    }
  })
}
