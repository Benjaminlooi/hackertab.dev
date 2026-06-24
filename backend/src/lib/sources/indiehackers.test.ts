import { describe, it, expect, afterEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { UpstreamError } from '../../middleware/error'
import { fetchIndieHackers } from './indiehackers'

const ALGOLIA_ENDPOINT = 'https://OFCNCOG2CU-1.algolianet.com/1/indexes/searchable_posts/query'
const APP_ID = 'OFCNCOG2CU'

const hit1 = {
  objectID: 'abc123',
  title: 'How I Built a SaaS to $5k MRR',
  url: 'https://www.indiehackers.com/post/saas-to-5k-mrr',
  tags: ['saas', 'bootstrapping'],
  createdAt: 1700000000,
  voteCount: 42,
  commentCount: 7,
  heroImage: 'https://indiehackers.com/img/hero1.jpg',
  subtitle: 'A long-form story about building a SaaS from scratch to five thousand dollars in monthly recurring revenue, the lessons learned, and the pivots along the way.',
}

const hit2 = {
  objectID: 'def456',
  title: 'My Indie Journey: 0 to 10k Users',
  url: 'https://www.indiehackers.com/post/zero-to-10k',
  tags: ['marketing', 'growth'],
  createdAt: 1700003600,
  voteCount: 15,
  commentCount: 3,
  heroImage: 'https://indiehackers.com/img/hero2.jpg',
  subtitle: 'Sharing the playbook that took my side project to ten thousand users in six months.',
}

describe('fetchIndieHackers()', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs to Algolia and transforms 2 hits to Article[]', async () => {
    let receivedRequest: { method: string; headers: Headers; body: unknown } | null = null
    server.use(
      http.post(ALGOLIA_ENDPOINT, async ({ request }) => {
        receivedRequest = {
          method: request.method,
          headers: request.headers,
          body: await request.json(),
        }
        return HttpResponse.json({ hits: [hit1, hit2] })
      })
    )

    const articles = await fetchIndieHackers()

    expect(articles).toHaveLength(2)

    expect(articles[0]).toEqual({
      id: 'abc123',
      url: 'https://www.indiehackers.com/post/saas-to-5k-mrr',
      title: 'How I Built a SaaS to $5k MRR',
      tags: ['saas', 'bootstrapping'],
      comments_count: 7,
      points_count: 42,
      image_url: 'https://indiehackers.com/img/hero1.jpg',
      published_at: 1700000000000, // 1700000000 * 1000
      source: 'indiehackers',
      description:
        'A long-form story about building a SaaS from scratch to five thousand dollars in monthly recurring revenue, the lessons learned, and the pivots along the way.'.slice(
          0,
          200
        ),
    })

    expect(articles[1]).toMatchObject({
      id: 'def456',
      url: 'https://www.indiehackers.com/post/zero-to-10k',
      title: 'My Indie Journey: 0 to 10k Users',
      tags: ['marketing', 'growth'],
      comments_count: 3,
      points_count: 15,
      image_url: 'https://indiehackers.com/img/hero2.jpg',
      published_at: 1700003600000,
      source: 'indiehackers',
    })
    expect(articles[1]!.description).toBe(
      'Sharing the playbook that took my side project to ten thousand users in six months.'
    )
  })

  it('sends correct request shape: POST + Algolia headers + body params', async () => {
    let observed: { method: string; appId: string | null; apiKey: string | null; contentType: string | null; params: URLSearchParams } | null =
      null
    server.use(
      http.post(ALGOLIA_ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { params: string }
        observed = {
          method: request.method,
          appId: request.headers.get('X-Algolia-Application-Id'),
          apiKey: request.headers.get('X-Algolia-API-Key'),
          contentType: request.headers.get('Content-Type'),
          params: new URLSearchParams(body.params),
        }
        return HttpResponse.json({ hits: [] })
      })
    )

    await fetchIndieHackers()

    expect(observed).not.toBeNull()
    expect(observed!.method).toBe('POST')
    expect(observed!.appId).toBe(APP_ID)
    expect(observed!.apiKey).toBe('test_key')
    expect(observed!.contentType).toBe('application/json')
    expect(observed!.params.get('hitsPerPage')).toBe('30')
    expect(observed!.params.get('tagFilters')).toBeNull()
  })

  it('appends tagFilters=[firstTag] when tags are provided', async () => {
    let observedParams: URLSearchParams | null = null
    server.use(
      http.post(ALGOLIA_ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { params: string }
        observedParams = new URLSearchParams(body.params)
        return HttpResponse.json({ hits: [] })
      })
    )

    await fetchIndieHackers({ tags: ['saas'] })

    expect(observedParams!.get('tagFilters')).toBe('[saas]')
    expect(observedParams!.get('hitsPerPage')).toBe('30')
  })

  it('uses only the first tag when multiple tags are provided', async () => {
    let observedParams: URLSearchParams | null = null
    server.use(
      http.post(ALGOLIA_ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { params: string }
        observedParams = new URLSearchParams(body.params)
        return HttpResponse.json({ hits: [] })
      })
    )

    await fetchIndieHackers({ tags: ['saas', 'bootstrapping', 'growth'] })

    expect(observedParams!.get('tagFilters')).toBe('[saas]')
  })

  it('truncates subtitle to 200 characters in description', async () => {
    const longSubtitle = 'x'.repeat(500)
    server.use(
      http.post(ALGOLIA_ENDPOINT, () =>
        HttpResponse.json({
          hits: [{ ...hit1, objectID: 'long', subtitle: longSubtitle }],
        })
      )
    )

    const articles = await fetchIndieHackers()

    expect(articles[0]!.description).toHaveLength(200)
  })

  it('uses empty string for description when subtitle is missing', async () => {
    const { subtitle: _omit, ...noSubtitle } = hit1
    server.use(
      http.post(ALGOLIA_ENDPOINT, () => HttpResponse.json({ hits: [noSubtitle] }))
    )

    const articles = await fetchIndieHackers()

    expect(articles[0]!.description).toBe('')
  })

  it('returns image_url="" when heroImage is missing', async () => {
    const { heroImage: _omit, ...noHero } = hit1
    server.use(
      http.post(ALGOLIA_ENDPOINT, () => HttpResponse.json({ hits: [noHero] }))
    )

    const articles = await fetchIndieHackers()

    expect(articles[0]!.image_url).toBe('')
  })

  it('coerces missing commentCount and voteCount to 0', async () => {
    const { commentCount: _c, voteCount: _v, ...counts } = hit1
    server.use(
      http.post(ALGOLIA_ENDPOINT, () => HttpResponse.json({ hits: [counts] }))
    )

    const articles = await fetchIndieHackers()

    expect(articles[0]!.comments_count).toBe(0)
    expect(articles[0]!.points_count).toBe(0)
  })

  it('coerces missing tags to []', async () => {
    const { tags: _t, ...noTags } = hit1
    server.use(
      http.post(ALGOLIA_ENDPOINT, () => HttpResponse.json({ hits: [noTags] }))
    )

    const articles = await fetchIndieHackers()

    expect(articles[0]!.tags).toEqual([])
  })

  it('returns 0 for published_at when createdAt is missing', async () => {
    const { createdAt: _omit, ...noCreated } = hit1
    server.use(
      http.post(ALGOLIA_ENDPOINT, () => HttpResponse.json({ hits: [noCreated] }))
    )

    const articles = await fetchIndieHackers()

    expect(articles[0]!.published_at).toBe(0)
  })

  it('returns [] when the response has no hits', async () => {
    server.use(
      http.post(ALGOLIA_ENDPOINT, () => HttpResponse.json({ hits: [] }))
    )

    const articles = await fetchIndieHackers()

    expect(articles).toEqual([])
  })

  it('throws UpstreamError when Algolia returns 5xx', async () => {
    server.use(
      http.post(ALGOLIA_ENDPOINT, () =>
        new HttpResponse(null, { status: 500, statusText: 'Server Error' })
      )
    )

    await expect(fetchIndieHackers()).rejects.toBeInstanceOf(UpstreamError)
    await expect(fetchIndieHackers()).rejects.toMatchObject({
      source: 'indiehackers',
      message: 'Algolia error: 500',
    })
  })

  it('throws UpstreamError when Algolia returns 4xx', async () => {
    server.use(
      http.post(ALGOLIA_ENDPOINT, () =>
        new HttpResponse(null, { status: 403, statusText: 'Forbidden' })
      )
    )

    await expect(fetchIndieHackers()).rejects.toBeInstanceOf(UpstreamError)
  })

  it('throws UpstreamError "missing Algolia key" when INDIEHACKERS_ALGOLIA_KEY is unset', async () => {
    vi.stubEnv('INDIEHACKERS_ALGOLIA_KEY', '')
    vi.resetModules()

    const mod = await import('./indiehackers')
    let caught: unknown = null
    try {
      await mod.fetchIndieHackers()
    } catch (err) {
      caught = err
    }

    // vi.resetModules() re-imports the source on a fresh module graph, so the
    // UpstreamError class identity differs from the one captured at the top
    // of this file. Duck-type on the documented fields instead.
    expect(caught).toBeTruthy()
    expect((caught as Error).name).toBe('UpstreamError')
    expect((caught as UpstreamError).source).toBe('indiehackers')
    expect((caught as UpstreamError).message).toBe('missing Algolia key')
  })
})
