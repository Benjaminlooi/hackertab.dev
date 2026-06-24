import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { cached } from '../lib/cache'
import type { Article } from '../types'

// Source clients
import { fetchHackerNews } from '../lib/sources/hackernews'
import { fetchDevTo } from '../lib/sources/devto'
import { fetchHashnode } from '../lib/sources/hashnode'
import { fetchLobsters } from '../lib/sources/lobsters'
import { fetchFreeCodeCamp } from '../lib/sources/freecodecamp'
import { fetchMedium } from '../lib/sources/medium'
import { fetchHackerNoon } from '../lib/sources/hackernoon'
import { fetchReddit } from '../lib/sources/reddit'
import { fetchIndieHackers } from '../lib/sources/indiehackers'
import { fetchGithubTrending } from '../lib/sources/githubTrending'
import { fetchConfsTech } from '../lib/sources/confsTech'
import { fetchProductHunt } from '../lib/sources/producthunt'

const SOURCE_CLIENTS: Record<string, (opts: { tags?: string[] }) => Promise<Article[]>> = {
  hackernews: fetchHackerNews,
  devto: fetchDevTo,
  hashnode: fetchHashnode,
  lobsters: fetchLobsters,
  freecodecamp: fetchFreeCodeCamp,
  medium: fetchMedium,
  hackernoon: fetchHackerNoon,
  reddit: fetchReddit,
  indiehackers: fetchIndieHackers,
}

const engine = new Hono()

// GET /feeds
const feedsSchema = z.object({
  source: z.enum(['hackernews', 'devto', 'hashnode', 'lobsters', 'freecodecamp', 'medium', 'hackernoon', 'reddit', 'indiehackers']),
  tags: z.string().optional().transform((s) => s ? s.split(',') : []),
})

engine.get('/feeds', zValidator('query', feedsSchema, (result, c) => {
  if (!result.success) return c.json({ error: 'invalid source' }, 400)
}), async (c) => {
  const { source, tags } = c.req.valid('query')
  const key = `feeds:${source}:${[...tags].sort().join(',')}`
  const client = SOURCE_CLIENTS[source]
  if (!client) return c.json({ error: 'invalid source' }, 400)
  const articles = await cached(key, () => client({ tags }))
  return c.json(articles)
})

// GET /repos
const reposSchema = z.object({
  range: z.enum(['daily', 'weekly', 'monthly']),
  tags: z.string().transform((s) => s ? s.split(',') : []),
})
engine.get('/repos', zValidator('query', reposSchema, (result, c) => {
  if (!result.success) return c.json({ error: 'invalid params' }, 400)
}), async (c) => {
  const { range, tags } = c.req.valid('query')
  const key = `repos:${[...tags].sort().join(',')}:${range}`
  const repos = await cached(key, () => fetchGithubTrending({ tags, range }))
  return c.json(repos)
})

// GET /conferences
const conferencesSchema = z.object({
  tags: z.string().optional().transform((s) => s ? s.split(',') : []),
})
engine.get('/conferences', zValidator('query', conferencesSchema, (result, c) => {
  if (!result.success) return c.json({ error: 'invalid params' }, 400)
}), async (c) => {
  const { tags } = c.req.valid('query')
  const key = `confs:${[...tags].sort().join(',')}`
  const conferences = await cached(key, () => fetchConfsTech({ tags }))
  return c.json(conferences)
})

// GET /products
const productsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
engine.get('/products', zValidator('query', productsSchema, (result, c) => {
  if (!result.success) return c.json({ error: 'invalid date' }, 400)
}), async (c) => {
  const { date } = c.req.valid('query')
  const key = `products:${date}`
  const products = await cached(key, () => fetchProductHunt({ date }))
  return c.json(products)
})

// STUB: GET /v2/feed — empty pages
const feedSchema = z.object({
  tags: z.string().optional(),
  limit: z.coerce.number().optional(),
  next: z.string().optional(),
})
engine.get('/v2/feed', zValidator('query', feedSchema), (c) => {
  return c.json({ data: [], metadata: { next: null, hasNextPage: false } })
})

// STUB: GET /rss_info/
engine.get('/rss_info/', zValidator('query', z.object({ url: z.string().url() })), (c) => {
  return c.json({})
})

// STUB: GET /remote_feed
engine.get('/remote_feed', zValidator('query', z.object({ feedUrl: z.string() })), (c) => {
  return c.body('')
})

// STUB: GET /ads/adaptive_v2
engine.get('/ads/adaptive_v2', zValidator('query', z.object({ keywords: z.string() })), (c) => {
  return c.json([])
})

export default engine
