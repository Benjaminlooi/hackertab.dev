import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../test/setup'

process.env.UPSTASH_REDIS_REST_URL ||= 'https://upstash.example'
process.env.UPSTASH_REDIS_REST_TOKEN ||= 'abc'
process.env.REDDIT_CLIENT_ID ||= 'reddit_id'
process.env.REDDIT_CLIENT_SECRET ||= 'reddit_secret'
process.env.PRODUCTHUNT_CLIENT_ID ||= 'ph_id'
process.env.PRODUCTHUNT_CLIENT_SECRET ||= 'ph_secret'
process.env.INDIEHACKERS_ALGOLIA_KEY ||= 'test_key'

vi.mock('../lib/upstash', () => ({
  redis: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
  },
}))

import engine from './engine'

describe('GET /engine/feeds', () => {
  it('returns 200 with Article[] for hackernews', async () => {
    server.use(
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
    )

    const res = await engine.request('/feeds?source=hackernews')
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

  it('returns 400 for invalid source', async () => {
    const res = await engine.request('/feeds?source=invalid')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'invalid source' })
  })
})

describe('GET /engine/repos', () => {
  it('returns 200 with Repository[] for daily+python', async () => {
    server.use(
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
    )

    const res = await engine.request('/repos?range=daily&tags=python')
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
})

describe('GET /engine/conferences', () => {
  it('returns 200 with Conference[] for python tag', async () => {
    const currentYear = new Date().getFullYear()
    const futureDate = `${currentYear + 1}-06-15`

    server.use(
      http.get(
        'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/python/upcoming.json',
        () => {
          return HttpResponse.json([
            {
              name: 'PyCon Future',
              url: 'https://pycon.future',
              startDate: futureDate,
              endDate: futureDate,
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
    )

    const res = await engine.request('/conferences?tags=python')
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
})

describe('GET /engine/products', () => {
  it('returns 200 with Product[] for valid date', async () => {
    server.use(
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

    const res = await engine.request('/products?date=2026-06-23')
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

  it('returns 400 for invalid date', async () => {
    const res = await engine.request('/products?date=invalid')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'invalid date' })
  })
})

describe('GET /engine/v2/feed', () => {
  it('returns empty paginated envelope', async () => {
    const res = await engine.request('/v2/feed?tags=javascript&limit=21')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      data: [],
      metadata: { next: null, hasNextPage: false },
    })
  })
})

describe('GET /engine/ads/adaptive_v2', () => {
  it('returns empty ads array', async () => {
    const res = await engine.request('/ads/adaptive_v2?keywords=javascript')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})

describe('GET /engine/rss_info/', () => {
  it('returns empty object', async () => {
    const res = await engine.request('/rss_info/?url=https://example.com/feed')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({})
  })
})

describe('GET /engine/remote_feed', () => {
  it('returns empty string body', async () => {
    const res = await engine.request('/remote_feed?feedUrl=https://example.com')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toBe('')
  })
})
