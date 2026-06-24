import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchHashnode } from './hashnode'

const HASHNODE_GQL_URL = 'https://gql.hashnode.com'

type PostOverrides = {
  id?: string
  title?: string
  slug?: string
  url?: string
  publishedAt?: string
  brief?: string | null
  responseCount?: number | null
  coverImage?: { url: string } | null
  tags?: Array<{ name: string; slug: string }> | null
  author?: { username: string; name: string }
}

const makePost = (overrides: PostOverrides = {}) => ({
  id: 'post-1',
  title: 'Hello Hashnode',
  slug: 'hello-hashnode',
  url: 'https://hashnode.com/post/hello-hashnode',
  publishedAt: '2024-01-15T10:00:00.000Z',
  brief: 'A short summary',
  responseCount: 5,
  coverImage: { url: 'https://cdn.hashnode.com/cover1.jpg' },
  tags: [
    { name: 'javascript', slug: 'javascript' },
    { name: 'react', slug: 'react' },
  ],
  author: { username: 'u1', name: 'User One' },
  ...overrides,
})

describe('fetchHashnode()', () => {
  it('POSTs GraphQL to gql.hashnode.com and transforms 2 posts to Article[]', async () => {
    let receivedBody: unknown = null
    server.use(
      http.post(HASHNODE_GQL_URL, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          data: {
            feed: {
              edges: [
                {
                  node: makePost({
                    id: 'p1',
                    title: 'First Post',
                    url: 'https://example.com/p1',
                  }),
                },
                {
                  node: makePost({
                    id: 'p2',
                    title: 'Second Post',
                    url: 'https://example.com/p2',
                    responseCount: 12,
                    brief: 'Second brief',
                    tags: [{ name: 'typescript', slug: 'typescript' }],
                  }),
                },
              ],
            },
          },
        })
      })
    )

    const articles = await fetchHashnode({})

    expect(articles).toHaveLength(2)

    const [first, second] = articles
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    expect(first).toMatchObject({
      id: 'p1',
      url: 'https://example.com/p1',
      title: 'First Post',
      tags: ['javascript', 'react'],
      comments_count: 5,
      points_count: 0,
      image_url: 'https://cdn.hashnode.com/cover1.jpg',
      source: 'hashnode',
      description: 'A short summary',
    })
    expect(first?.published_at).toBe(Date.parse('2024-01-15T10:00:00.000Z'))

    expect(second).toMatchObject({
      id: 'p2',
      title: 'Second Post',
      tags: ['typescript'],
      comments_count: 12,
      points_count: 0,
      source: 'hashnode',
      description: 'Second brief',
    })

    // Verify GraphQL request body shape: query (string) + variables { first: 30 }
    expect(receivedBody).toMatchObject({
      query: expect.any(String),
      variables: { first: 30 },
    })
    const body = receivedBody as { query: string }
    expect(body.query).toContain('feed')
    expect(body.query).toContain('Post')
  })

  it('throws on 500 upstream error', async () => {
    server.use(
      http.post(HASHNODE_GQL_URL, () => {
        return new HttpResponse('Internal Server Error', { status: 500 })
      })
    )

    await expect(fetchHashnode({})).rejects.toThrow(/500/)
  })

  it('returns [] when the feed has no edges', async () => {
    server.use(
      http.post(HASHNODE_GQL_URL, () => {
        return HttpResponse.json({ data: { feed: { edges: [] } } })
      })
    )

    const articles = await fetchHashnode({})
    expect(articles).toEqual([])
  })

  it('uses empty string for missing coverImage and missing brief; [] for missing tags', async () => {
    server.use(
      http.post(HASHNODE_GQL_URL, () => {
        return HttpResponse.json({
          data: {
            feed: {
              edges: [
                {
                  node: makePost({
                    id: 'p3',
                    coverImage: null,
                    brief: null,
                    tags: null,
                    responseCount: null,
                  }),
                },
              ],
            },
          },
        })
      })
    )

    const articles = await fetchHashnode({})
    expect(articles).toHaveLength(1)
    expect(articles[0]).toMatchObject({
      id: 'p3',
      image_url: '',
      description: '',
      tags: [],
      comments_count: 0,
      points_count: 0,
      source: 'hashnode',
    })
  })

  it('accepts an optional tags argument without changing the request body', async () => {
    let receivedBody: unknown = null
    server.use(
      http.post(HASHNODE_GQL_URL, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ data: { feed: { edges: [] } } })
      })
    )

    await fetchHashnode({ tags: ['javascript', 'react'] })

    expect(receivedBody).toMatchObject({
      variables: { first: 30 },
    })
  })
})
