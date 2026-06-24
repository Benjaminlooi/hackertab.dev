import type { Article } from '../../types'

const HASHNODE_GQL_URL = 'https://gql.hashnode.com'

const FEED_QUERY = `query Feed($first: Int!) {
  feed(first: $first, filter: { type: COMMUNITY }) {
    edges {
      node {
        ... on Post {
          id title slug url publishedAt
          brief
          responseCount
          coverImage { url }
          tags { name slug }
          author { username name }
        }
      }
    }
  }
}`

type HashnodeTag = { name?: string | null; slug?: string | null }
type HashnodeCoverImage = { url?: string | null } | null | undefined
type HashnodeAuthor = { username?: string | null; name?: string | null }
type HashnodePost = {
  id: string
  title: string
  slug?: string
  url: string
  publishedAt: string
  brief?: string | null
  responseCount?: number | null
  coverImage?: HashnodeCoverImage
  tags?: HashnodeTag[] | null
  author?: HashnodeAuthor
}

type HashnodeEdge = { node: HashnodePost }
type HashnodeResponse = {
  data?: { feed?: { edges?: HashnodeEdge[] | null } | null } | null
}

export type FetchHashnodeOptions = { tags?: string[] }

/**
 * Fetches the Hashnode community feed via the public GraphQL API and maps each
 * Post node to the shared Article shape used by the rest of the backend.
 *
 * The `tags` option is accepted for API consistency with other sources but is
 * not yet threaded into the query — the community feed is a single tag-less
 * stream.
 */
export async function fetchHashnode(
  _opts: FetchHashnodeOptions = {}
): Promise<Article[]> {
  const res = await fetch(HASHNODE_GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: FEED_QUERY,
      variables: { first: 30 },
    }),
  })

  if (!res.ok) {
    throw new Error(`hashnode upstream error: HTTP ${res.status}`)
  }

  const json = (await res.json()) as HashnodeResponse
  const edges = json.data?.feed?.edges ?? []
  return edges.map(({ node }) => postToArticle(node))
}

function postToArticle(post: HashnodePost): Article {
  return {
    id: post.id,
    url: post.url,
    title: post.title,
    tags: (post.tags ?? [])
      .map((t) => t.name)
      .filter((n): n is string => Boolean(n)),
    comments_count: post.responseCount ?? 0,
    points_count: 0,
    image_url: post.coverImage?.url ?? '',
    published_at: Date.parse(post.publishedAt),
    source: 'hashnode',
    description: post.brief ?? '',
  }
}
