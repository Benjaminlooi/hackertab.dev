import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'

// Module-level constants match the constants used inside producthunt.ts
// (we cannot import the module statically because the "missing creds"
// test needs vi.resetModules() to re-evaluate env.ts).
const PH_OAUTH_URL = 'https://api.producthunt.com/v2/oauth/token'
const PH_GQL_URL = 'https://api.producthunt.com/v2/api/graphql'

const TOKEN_BODY = { access_token: 'test-bearer-token-xyz', expires_in: 7200 }

// Helper: a single fully-populated Product Hunt post node.
const samplePost = {
  id: 'ph-post-1',
  name: 'Awesome Product',
  slug: 'awesome-product',
  tagline: 'The best way to do awesome things',
  description:
    'A long-form description of the product that should be truncated to 200 characters when stored on the Product shape we expose to the rest of the backend.',
  url: 'https://www.producthunt.com/posts/awesome-product',
  website: 'https://awesome-product.example.com',
  votesCount: 142,
  commentsCount: 17,
  createdAt: '2024-01-15T10:00:00.000Z',
  topics: {
    edges: [
      { node: { name: 'Productivity', slug: 'productivity' } },
      { node: { name: 'SaaS', slug: 'saas' } },
    ],
  },
  media: [
    { url: 'https://ph-files.imgix.net/abc/cover.jpg?auto=format', type: 'image' },
  ],
}

type PostOverrides = {
  id?: string
  name?: string
  slug?: string
  tagline?: string | null
  description?: string | null
  url?: string
  website?: string | null
  votesCount?: number | null
  commentsCount?: number | null
  createdAt?: string
  topics?: { edges: Array<{ node: { name: string; slug: string } }> } | null
  media?: Array<{ url: string; type: string }> | null
}

const makePost = (overrides: PostOverrides = {}) => ({
  id: 'ph-post-1',
  name: 'Awesome Product',
  slug: 'awesome-product',
  tagline: 'The best way to do awesome things',
  description: 'A great product',
  url: 'https://www.producthunt.com/posts/awesome-product',
  website: 'https://awesome-product.example.com',
  votesCount: 142,
  commentsCount: 17,
  createdAt: '2024-01-15T10:00:00.000Z',
  topics: {
    edges: [
      { node: { name: 'Productivity', slug: 'productivity' } },
      { node: { name: 'SaaS', slug: 'saas' } },
    ],
  },
  media: [{ url: 'https://ph-files.imgix.net/abc/cover.jpg?auto=format', type: 'image' }],
  ...overrides,
})

function mockOAuth() {
  return http.post(PH_OAUTH_URL, () => HttpResponse.json(TOKEN_BODY))
}

function mockGraphQL(edges: Array<{ node: unknown }>) {
  return http.post(PH_GQL_URL, () =>
    HttpResponse.json({ data: { posts: { edges } } })
  )
}

// Save and restore process.env so the "missing creds" test doesn't leak.
const originalEnv = { ...process.env }

describe('fetchProductHunt()', () => {
  beforeEach(() => {
    // Each test gets a fresh module so the OAuth token cache is empty.
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('POSTs client_credentials to the OAuth endpoint and returns a Bearer-authenticated GraphQL response', async () => {
    let oauthBody: unknown = null
    let gqlAuthHeader: string | null = null
    let gqlBody: unknown = null
    server.use(
      http.post(PH_OAUTH_URL, async ({ request }) => {
        oauthBody = await request.json()
        return HttpResponse.json(TOKEN_BODY)
      }),
      http.post(PH_GQL_URL, async ({ request }) => {
        gqlAuthHeader = request.headers.get('authorization')
        gqlBody = await request.json()
        return HttpResponse.json({
          data: { posts: { edges: [{ node: makePost() }] } },
        })
      })
    )

    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()

    expect(products).toHaveLength(1)
    expect(oauthBody).toEqual({
      client_id: 'ph_id',
      client_secret: 'ph_secret',
      grant_type: 'client_credentials',
    })
    expect(gqlAuthHeader).toBe(`Bearer ${TOKEN_BODY.access_token}`)

    // GraphQL body shape: query string + variables { postedAfter: ISO string }
    const body = gqlBody as { query: string; variables: { postedAfter: string } }
    expect(body.query).toContain('posts(first: 20')
    expect(body.query).toContain('order: RANKING')
    expect(body.query).toContain('postedAfter:')
    expect(typeof body.variables.postedAfter).toBe('string')
    // postedAfter must be a valid ISO date — parseable by Date.parse
    expect(Number.isNaN(Date.parse(body.variables.postedAfter))).toBe(false)
  })

  it('transforms a PH post into the Product shape (with tagline, votes_count, topics)', async () => {
    server.use(
      mockOAuth(),
      mockGraphQL([
        {
          node: makePost({
            id: 'abc123',
            name: 'Second Brain',
            tagline: 'A digital brain for your notes',
            description: 'Capture everything, recall anything.',
            url: 'https://www.producthunt.com/posts/second-brain',
            votesCount: 250,
            commentsCount: 42,
            createdAt: '2024-05-20T08:30:00.000Z',
            topics: {
              edges: [
                { node: { name: 'Note Taking', slug: 'note-taking' } },
                { node: { name: 'AI', slug: 'ai' } },
                { node: { name: 'Productivity', slug: 'productivity' } },
              ],
            },
            media: [
              { url: 'https://ph-files.imgix.net/xyz/brain.png', type: 'image' },
            ],
          }),
        },
      ])
    )

    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()

    expect(products).toHaveLength(1)
    const p = products[0]!
    expect(p).toEqual({
      id: 'ph_abc123',
      url: 'https://www.producthunt.com/posts/second-brain',
      title: 'Second Brain',
      tags: ['Note Taking', 'AI', 'Productivity'],
      comments_count: 42,
      points_count: 250,
      image_url: 'https://ph-files.imgix.net/xyz/brain.png',
      published_at: Date.parse('2024-05-20T08:30:00.000Z'),
      source: 'producthunt',
      description: 'Capture everything, recall anything.',
      tagline: 'A digital brain for your notes',
      votes_count: 250,
      topics: ['Note Taking', 'AI', 'Productivity'],
    })
  })

  it('returns multiple products in GraphQL response order', async () => {
    server.use(
      mockOAuth(),
      mockGraphQL([
        { node: makePost({ id: 'p1', name: 'First' }) },
        { node: makePost({ id: 'p2', name: 'Second' }) },
        { node: makePost({ id: 'p3', name: 'Third' }) },
      ])
    )

    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()

    expect(products).toHaveLength(3)
    expect(products.map((p) => p.id)).toEqual(['ph_p1', 'ph_p2', 'ph_p3'])
    expect(products.map((p) => p.title)).toEqual(['First', 'Second', 'Third'])
    // Source field is attached at runtime; Product type doesn't declare it,
    // so use toMatchObject (partial match) to assert it without a cast.
    expect(products[0]).toMatchObject({ source: 'producthunt' })
    expect(products[1]).toMatchObject({ source: 'producthunt' })
    expect(products[2]).toMatchObject({ source: 'producthunt' })
  })

  it('uses image_url from the first media entry and "" when media is empty/missing', async () => {
    // Third post is built by hand (without makePost) so `media` is truly
    // absent — verifies the optional-chain fallback path.
    const { media: _omit, ...postWithoutMedia } = makePost({ id: 'missing-media' })
    void _omit
    server.use(
      mockOAuth(),
      mockGraphQL([
        { node: makePost({ id: 'has-media', media: [{ url: 'https://cdn.example/1.jpg', type: 'image' }] }) },
        { node: makePost({ id: 'no-media', media: [] }) },
        { node: postWithoutMedia },
      ])
    )
    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()
    expect(products[0]!.image_url).toBe('https://cdn.example/1.jpg')
    expect(products[1]!.image_url).toBe('')
    expect(products[2]!.image_url).toBe('')
  })

  it('defaults missing tagline / description / counts to empty string / 0', async () => {
    server.use(
      mockOAuth(),
      mockGraphQL([
        {
          node: makePost({
            id: 'sparse',
            tagline: null as unknown as string,
            description: null as unknown as string,
            votesCount: null as unknown as number,
            commentsCount: null as unknown as number,
            topics: { edges: [] },
          }),
        },
      ])
    )

    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()

    expect(products[0]).toEqual({
      id: 'ph_sparse',
      url: 'https://www.producthunt.com/posts/awesome-product',
      title: 'Awesome Product',
      tags: [],
      comments_count: 0,
      points_count: 0,
      image_url: 'https://ph-files.imgix.net/abc/cover.jpg?auto=format',
      published_at: Date.parse('2024-01-15T10:00:00.000Z'),
      source: 'producthunt',
      description: '',
      tagline: '',
      votes_count: 0,
      topics: [],
    })
  })

  it('truncates description to 200 characters', async () => {
    const longDescription = 'x'.repeat(500)
    server.use(
      mockOAuth(),
      mockGraphQL([{ node: makePost({ id: 'long', description: longDescription }) }])
    )

    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()

    expect(products[0]!.description).toHaveLength(200)
    expect(products[0]!.description).toBe('x'.repeat(200))
  })

  it('uses the provided date (YYYY-MM-DD) as the start-of-day UTC postedAfter', async () => {
    let gqlBody: unknown = null
    server.use(
      mockOAuth(),
      http.post(PH_GQL_URL, async ({ request }) => {
        gqlBody = await request.json()
        return HttpResponse.json({ data: { posts: { edges: [] } } })
      })
    )

    const { fetchProductHunt } = await import('./producthunt')
    await fetchProductHunt({ date: '2024-05-20' })

    const body = gqlBody as { variables: { postedAfter: string } }
    expect(body.variables.postedAfter).toBe('2024-05-20T00:00:00.000Z')
  })

  it('returns [] when the GraphQL response has no posts', async () => {
    server.use(
      mockOAuth(),
      mockGraphQL([])
    )

    const { fetchProductHunt } = await import('./producthunt')
    const products = await fetchProductHunt()

    expect(products).toEqual([])
  })

  it('caches the OAuth token across multiple fetchProductHunt calls', async () => {
    let oauthCalls = 0
    server.use(
      http.post(PH_OAUTH_URL, () => {
        oauthCalls++
        return HttpResponse.json(TOKEN_BODY)
      }),
      mockGraphQL([{ node: makePost() }])
    )

    const { fetchProductHunt } = await import('./producthunt')
    await fetchProductHunt()
    await fetchProductHunt()
    await fetchProductHunt()

    expect(oauthCalls).toBe(1)
  })

  it('throws UpstreamError when PH credentials are missing', async () => {
    // Strip PH creds — UPSTASH vars stay present so env.ts still parses.
    delete process.env.PRODUCTHUNT_CLIENT_ID
    delete process.env.PRODUCTHUNT_CLIENT_SECRET

    // Note: we don't mock the OAuth endpoint. If creds were present, the test
    // would hit the unmocked URL and msw would throw onUnhandledRequest. The
    // UpstreamError must short-circuit before that.
    vi.resetModules()
    const { fetchProductHunt } = await import('./producthunt')

    // Use structural match + message check: vi.resetModules() re-evaluates
    // producthunt.ts, so the UpstreamError class instance is from a different
    // module than the one we statically imported above. instanceof is therefore
    // unreliable across that boundary — match on the error's own fields.
    await expect(fetchProductHunt()).rejects.toMatchObject({
      name: 'UpstreamError',
      source: 'producthunt',
      message: 'missing credentials',
    })
  })

  it('throws UpstreamError on GraphQL HTTP 5xx', async () => {
    server.use(
      mockOAuth(),
      http.post(PH_GQL_URL, () => new HttpResponse(null, { status: 502, statusText: 'Bad Gateway' }))
    )

    const { fetchProductHunt } = await import('./producthunt')
    await expect(fetchProductHunt()).rejects.toMatchObject({
      name: 'UpstreamError',
      source: 'producthunt',
    })
  })

  it('throws UpstreamError when GraphQL response includes an `errors` field', async () => {
    server.use(
      mockOAuth(),
      http.post(PH_GQL_URL, () =>
        HttpResponse.json({
          errors: [{ message: 'Rate limit exceeded: complexity budget exhausted' }],
        })
      )
    )

    const { fetchProductHunt } = await import('./producthunt')
    await expect(fetchProductHunt()).rejects.toMatchObject({
      name: 'UpstreamError',
      source: 'producthunt',
    })
  })
})
