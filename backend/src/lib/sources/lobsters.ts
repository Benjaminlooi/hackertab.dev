import { XMLParser } from 'fast-xml-parser'
import type { Article } from '../../types'

const LOBSTERS_BASE = 'https://lobste.rs'

export type LobstersRange = 'daily' | 'weekly' | 'monthly'

export type FetchLobstersOpts = {
  tags?: string[]
  range?: LobstersRange
}

type RssItem = {
  title?: string
  link?: string
  guid?: string
  pubDate?: string
  comments?: string
  category?: string | string[]
  description?: string
}

const RANGE_TO_PATH: Record<LobstersRange, string> = {
  daily: '/top/1d.rss',
  weekly: '/top/1w.rss',
  monthly: '/top/1m.rss',
}

function normalizeCategories(category: string | string[] | undefined): string[] {
  if (!category) return []
  return Array.isArray(category) ? category : [category]
}

function toArticle(item: RssItem): Article | null {
  if (!item.link || !item.title) return null
  return {
    id: item.guid || item.link,
    url: item.link,
    title: item.title,
    tags: normalizeCategories(item.category),
    comments_count: 0,
    points_count: 0,
    image_url: '',
    published_at: item.pubDate ? Date.parse(item.pubDate) : 0,
    source: 'lobsters',
    description: '',
  }
}

export async function fetchLobsters(opts: FetchLobstersOpts = {}): Promise<Article[]> {
  const path = opts.range ? RANGE_TO_PATH[opts.range] : '/rss'
  const url = `${LOBSTERS_BASE}${path}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Lobsters RSS error: ${res.status}`)

  const xml = await res.text()
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
  })
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } }

  const channel = parsed.rss?.channel
  const rawItems = channel?.item
  if (!rawItems) return []
  const items = Array.isArray(rawItems) ? rawItems : [rawItems]

  return items
    .map(toArticle)
    .filter((a): a is Article => a !== null)
}
