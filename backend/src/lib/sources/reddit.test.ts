import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { UpstreamError } from '../../middleware/error'

// Mutable env state — toggled in beforeEach to cover the missing-creds path
// without reloading the reddit module (which would re-evaluate
// middleware/error.ts and break `instanceof` checks on UpstreamError).
const mockCreds = vi.hoisted(() => ({
  id: 'reddit_id' as string | undefined,
  secret: 'reddit_secret' as string | undefined,
}))

vi.mock('../env', () => ({
  env: {
    get REDDIT_CLIENT_ID() {
      return mockCreds.id
    },
    get REDDIT_CLIENT_SECRET() {
      return mockCreds.secret
    },
  } as any,
}))

import { fetchReddit, __resetRedditTokenCacheForTests } from './reddit'

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'

const sampleListing = {
  data: {
    children: [
      {
        data: {
          id: 'abc123',
          title: 'Test post 1',
          permalink: '/r/Python/comments/abc123/test_post_1/',
          num_comments: 42,
          ups: 100,
          downs: 5,
          thumbnail: 'https://example.com/thumb1.jpg',
          selftext: 'Some test content',
          created_utc: 1700000000,
        },
      },
      {
        data: {
          id: 'def456',
          title: 'Test post 2',
          permalink: '/r/Python/comments/def456/test_post_2/',
          num_comments: 0,
          ups: 50,
          downs: 0,
          thumbnail: 'self',
          selftext: 'x'.repeat(500),
          created_utc: 1700000050,
        },
      },
    ],
  },
}

const tokenResponse = {
  access_token: 'tok-xyz',
  expires_in: 3600,
  token_type: 'bearer',
}

describe('fetchReddit', () => {
  beforeEach(() => {
    mockCreds.id = 'reddit_id'
    mockCreds.secret = 'reddit_secret'
    __resetRedditTokenCacheForTests()
  })

  it('fetches OAuth token then posts, transforms to Article[] with source=reddit', async () => {
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json(tokenResponse)),
      http.get('https://oauth.reddit.com/r/python/top.json*', () =>
        HttpResponse.json(sampleListing),
      ),
    )

    const articles = await fetchReddit({ tags: ['python'] })

    expect(articles).toHaveLength(2)
    expect(articles[0]).toEqual({
      id: 'abc123',
      url: 'https://reddit.com/r/Python/comments/abc123/test_post_1/',
      title: 'Test post 1',
      tags: ['python'],
      comments_count: 42,
      points_count: 95,
      image_url: 'https://example.com/thumb1.jpg',
      published_at: 1700000000000,
      source: 'reddit',
      description: 'Some test content',
    })
    // 'self' thumbnail should be filtered out (not an http URL)
    expect(articles[1]!.image_url).toBe('')
    // selftext should be truncated to 200 chars
    expect(articles[1]!.description).toHaveLength(200)
    expect(articles[1]!.description).toBe('x'.repeat(200))
  })

  it('throws UpstreamError when OAuth credentials are missing', async () => {
    mockCreds.id = undefined
    mockCreds.secret = undefined

    let err: unknown
    try {
      await fetchReddit()
    } catch (e) {
      err = e
    }

    // Must fail BEFORE any network call — no msw handlers are registered for
    // this test, so any fetch hitting the network would surface as a different
    // error (msw onUnhandledRequest: 'error').
    expect(err).toBeInstanceOf(UpstreamError)
    expect((err as UpstreamError).source).toBe('reddit')
    expect((err as Error).message).toMatch(/missing OAuth credentials/i)
  })

  it('throws UpstreamError when OAuth token endpoint returns 401', async () => {
    server.use(
      http.post(TOKEN_URL, () => new HttpResponse(null, { status: 401 })),
    )

    let err: unknown
    try {
      await fetchReddit()
    } catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(UpstreamError)
    expect((err as UpstreamError).source).toBe('reddit')
    expect((err as Error).message).toMatch(/OAuth token fetch failed/i)
  })

  it('caches the OAuth token — token endpoint hit once across multiple fetchReddit calls', async () => {
    let tokenCallCount = 0
    server.use(
      http.post(TOKEN_URL, () => {
        tokenCallCount++
        return HttpResponse.json(tokenResponse)
      }),
      http.get('https://oauth.reddit.com/r/programming/top.json*', () =>
        HttpResponse.json(sampleListing),
      ),
    )

    await fetchReddit()
    await fetchReddit()
    await fetchReddit()

    expect(tokenCallCount).toBe(1)
  })
})
