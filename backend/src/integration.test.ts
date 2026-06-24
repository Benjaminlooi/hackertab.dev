import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test/setup'

// Ensure env vars are present before any module loads env.ts
process.env.UPSTASH_REDIS_REST_URL ||= 'https://upstash.example'
process.env.UPSTASH_REDIS_REST_TOKEN ||= 'abc'
process.env.REDDIT_CLIENT_ID ||= 'reddit_id'
process.env.REDDIT_CLIENT_SECRET ||= 'reddit_secret'
process.env.PRODUCTHUNT_CLIENT_ID ||= 'ph_id'
process.env.PRODUCTHUNT_CLIENT_SECRET ||= 'ph_secret'
process.env.INDIEHACKERS_ALGOLIA_KEY ||= 'test_key'

vi.mock('./lib/upstash', () => ({
  redis: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
  },
}))

import app from './index'
import { __resetProductHuntTokenCache } from './lib/sources/producthunt'

const currentYear = new Date().getFullYear()

describe('Integration — full app routes', () => {
  beforeEach(() => {
    __resetProductHuntTokenCache()

    server.use(
      // HackerNews
      http.get('https://hacker-news.firebaseio.com/v0/topstories.json*', () => {
        return HttpResponse.json([1])
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/1.json', () => {
        return HttpResponse.json({
          id: 1,
          type: 'story',
          title: 'Test Story',
          url: 'https://example.com',
          score: 100,
          time: 1700000000,
          descendants: 50,
        })
      }),

      // GitHub Trending
      http.get('https://github.com/trending/python', () => {
        return new HttpResponse(
          `<html><body>
            <article class="Box-row">
              <h2><a href="/owner/repo">owner / repo</a></h2>
              <p class="col-9">A cool repo</p>
              <span itemprop="programmingLanguage">Python</span>
              <a href="/owner/repo/stargazers">1,000</a>
              <span class="d-inline-block float-sm-right">50 stars today</span>
              <a href="/owner/repo/forks">100</a>
            </article>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html' } },
        )
      }),

      // Confs.tech
      http.get(
        'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/python/upcoming.json',
        () => {
          return HttpResponse.json([
            {
              name: 'PyCon Future',
              url: 'https://pycon.future',
              startDate: `${currentYear + 1}-06-15`,
              endDate: `${currentYear + 1}-06-15`,
              online: false,
              city: 'San Francisco',
              country: 'USA',
            },
          ])
        },
      ),
      http.get(
        `https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/python/${currentYear}.json`,
        () => {
          return new HttpResponse(null, { status: 404 })
        },
      ),

      // Product Hunt
      http.post('https://api.producthunt.com/v2/oauth/token', () => {
        return HttpResponse.json({ access_token: 'test-token', expires_in: 7200 })
      }),
      http.post('https://api.producthunt.com/v2/api/graphql', () => {
        return HttpResponse.json({
          data: {
            posts: {
              edges: [
                {
                  node: {
                    id: 'ph-1',
                    name: 'Test Product',
                    slug: 'test-product',
                    tagline: 'A test product',
                    description: 'Description here',
                    url: 'https://www.producthunt.com/posts/test-product',
                    votesCount: 42,
                    commentsCount: 5,
                    createdAt: '2024-01-15T10:00:00.000Z',
                    topics: {
                      edges: [{ node: { name: 'SaaS', slug: 'saas' } }],
                    },
                    media: [
                      { url: 'https://example.com/image.jpg', type: 'image' },
                    ],
                  },
                },
              ],
            },
          },
        })
      }),
    )
  })

  it('GET /health returns 200', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('GET /data/config.json returns 200 with tags', async () => {
    const res = await app.request('/data/config.json')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('tags')
    expect(Array.isArray(body.tags)).toBe(true)
  })

  it('GET /engine/feeds?source=hackernews returns 200 with articles', async () => {
    const res = await app.request('/engine/feeds?source=hackernews')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: '1',
      title: 'Test Story',
      source: 'hackernews',
    })
  })

  it('GET /engine/repos?range=daily&tags=python returns 200 with repos', async () => {
    const res = await app.request('/engine/repos?range=daily&tags=python')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: 'owner/repo',
      title: 'owner/repo',
      technology: 'Python',
      source: 'github',
    })
  })

  it('GET /engine/conferences?tags=python returns 200 with conferences', async () => {
    const res = await app.request('/engine/conferences?tags=python')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      title: 'PyCon Future',
      city: 'San Francisco',
      country: 'USA',
    })
  })

  it('GET /engine/products?date=2026-06-24 returns 200 with products', async () => {
    const res = await app.request('/engine/products?date=2026-06-24')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: 'ph_ph-1',
      title: 'Test Product',
      source: 'producthunt',
    })
  })

  it('GET /engine/v2/feed?tags=javascript returns empty paginated envelope', async () => {
    const res = await app.request('/engine/v2/feed?tags=javascript')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      data: [],
      metadata: { next: null, hasNextPage: false },
    })
  })

  it('GET /engine/ads/adaptive_v2?keywords=javascript returns empty array', async () => {
    const res = await app.request('/engine/ads/adaptive_v2?keywords=javascript')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})
