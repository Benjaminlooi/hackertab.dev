import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchDevTo } from './devto'

const DEVTO_API = 'https://dev.to/api'

const baseDevtoArticle = {
  id: 1234567,
  title: 'How to Build a DevTo Client',
  description: 'A guide on building a DevTo client using the Forem API. We cover authentication, rate limits, and pagination.',
  url: 'https://dev.to/example/how-to-build-a-devto-client',
  canonical_url: 'https://example.com/blog/devto-client',
  published_at: '2024-05-01T12:34:56Z',
  positive_reactions_count: 150,
  comments_count: 12,
  cover_image: 'https://dev.to/image.jpg',
  social_image: 'https://dev.to/social.jpg',
  readable_current_user_reactions_count: 0,
}

describe('fetchDevTo()', () => {
  it('transforms a DevTo article into the Article shape', async () => {
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return HttpResponse.json([baseDevtoArticle])
      })
    )

    const articles = await fetchDevTo({ tags: ['javascript'] })

    expect(articles).toHaveLength(1)
    const a = articles[0]!
    expect(a.id).toBe('1234567')
    expect(a.url).toBe(baseDevtoArticle.url)
    expect(a.title).toBe(baseDevtoArticle.title)
    expect(a.source).toBe('devto')
    expect(a.canonical_url).toBe(baseDevtoArticle.canonical_url)
    expect(a.comments_count).toBe(12)
    expect(a.points_count).toBe(150)
    expect(a.image_url).toBe(baseDevtoArticle.cover_image)
    expect(a.published_at).toBe(Date.parse('2024-05-01T12:34:56Z'))
  })

  it('splits a comma-separated tag_list into a string array', async () => {
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return HttpResponse.json([
          { ...baseDevtoArticle, id: 1, tag_list: 'javascript,react,webdev' },
          { ...baseDevtoArticle, id: 2, tag_list: 'python' },
          { ...baseDevtoArticle, id: 3, tag_list: '' },
        ])
      })
    )

    const articles = await fetchDevTo({ tags: ['javascript'] })

    expect(articles[0]!.tags).toEqual(['javascript', 'react', 'webdev'])
    expect(articles[1]!.tags).toEqual(['python'])
    expect(articles[2]!.tags).toEqual([])
  })

  it('returns multiple articles in order', async () => {
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return HttpResponse.json([
          { ...baseDevtoArticle, id: 100, title: 'First' },
          { ...baseDevtoArticle, id: 200, title: 'Second' },
        ])
      })
    )

    const articles = await fetchDevTo({ tags: ['javascript'] })

    expect(articles).toHaveLength(2)
    expect(articles[0]!.id).toBe('100')
    expect(articles[0]!.title).toBe('First')
    expect(articles[1]!.id).toBe('200')
    expect(articles[1]!.title).toBe('Second')
  })

  it('falls back to social_image when cover_image is empty', async () => {
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return HttpResponse.json([
          { ...baseDevtoArticle, cover_image: null, social_image: 'https://dev.to/social-fallback.jpg' },
        ])
      })
    )

    const articles = await fetchDevTo({ tags: ['javascript'] })

    expect(articles[0]!.image_url).toBe('https://dev.to/social-fallback.jpg')
  })

  it('truncates description to 200 characters', async () => {
    const longDescription = 'x'.repeat(500)
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return HttpResponse.json([{ ...baseDevtoArticle, description: longDescription }])
      })
    )

    const articles = await fetchDevTo({ tags: ['javascript'] })

    expect(articles[0]!.description).toHaveLength(200)
  })

  it('uses "programming" as the default tag when no tags are provided', async () => {
    let requestedUrl = ''
    server.use(
      http.get(`${DEVTO_API}/articles`, ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.json([])
      })
    )

    await fetchDevTo()

    expect(requestedUrl).toContain('tag=programming')
  })

  it('encodes the requested tag in the URL', async () => {
    let requestedUrl = ''
    server.use(
      http.get(`${DEVTO_API}/articles`, ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.json([])
      })
    )

    await fetchDevTo({ tags: ['c#'] })

    expect(requestedUrl).toContain('tag=c%23')
  })

  it('throws when the API responds with a 429 rate limit', async () => {
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' })
      })
    )

    await expect(fetchDevTo({ tags: ['javascript'] })).rejects.toThrow('DevTo API error: 429')
  })

  it('throws on non-OK responses with the status code', async () => {
    server.use(
      http.get(`${DEVTO_API}/articles`, () => {
        return new HttpResponse(null, { status: 500, statusText: 'Server Error' })
      })
    )

    await expect(fetchDevTo({ tags: ['javascript'] })).rejects.toThrow('DevTo API error: 500')
  })
})
