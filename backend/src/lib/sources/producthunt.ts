import type { Product } from '../../types'
import { env } from '../env'
import { UpstreamError } from '../../middleware/error'

// Product Hunt API v2 — Client-Only OAuth + GraphQL.
//
// We POST client_id/client_secret/grant_type=client_credentials to
// /v2/oauth/token, receive a short-lived bearer token, then send it
// as `Authorization: Bearer <token>` to /v2/api/graphql.
//
// Rate limit: 6250 complexity points / 15 min. The token cache keeps
// the same bearer across calls until ~30s before expiry to avoid
// burning the OAuth endpoint every request.

const PH_OAUTH_URL = 'https://api.producthunt.com/v2/oauth/token'
const PH_GQL_URL = 'https://api.producthunt.com/v2/api/graphql'

const POSTS_QUERY = `query Posts($postedAfter: DateTime!) {
  posts(first: 20, order: RANKING, postedAfter: $postedAfter) {
    edges {
      node {
        id
        name
        slug
        tagline
        description
        url
        website
        votesCount
        commentsCount
        createdAt
        topics(first: 5) { edges { node { name slug } } }
        media { url type }
      }
    }
  }
}`

type PHTopic = { name?: string | null; slug?: string | null }
type PHMedia = { url?: string | null; type?: string | null } | null | undefined
type PHPost = {
  id: string
  name: string
  slug?: string
  tagline: string
  description: string | null
  url: string
  website?: string | null
  votesCount: number
  commentsCount: number
  createdAt: string
  topics: { edges: Array<{ node: PHTopic }> }
  media?: PHMedia[] | null
}

type PHOAuthResponse = {
  access_token?: string
  expires_in?: number
}

type PHGqlResponse = {
  data?: { posts?: { edges?: Array<{ node: PHPost }> | null } | null } | null
  errors?: Array<{ message?: string }> | null
}

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | null = null

// Refresh the bearer 30s before it actually expires so a slow in-flight
// request can't accidentally reuse an expired token.
const EXPIRY_SKEW_MS = 30_000

export type FetchProductHuntOpts = { date?: string }

/**
 * Resets the in-process OAuth token cache. Exposed for tests so each
 * test can start from a guaranteed-clean state without resetting
 * the entire module graph.
 */
export function __resetProductHuntTokenCache(): void {
  tokenCache = null
}

async function fetchAccessToken(): Promise<string> {
  const clientId = env.PRODUCTHUNT_CLIENT_ID
  const clientSecret = env.PRODUCTHUNT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new UpstreamError('producthunt', 'missing credentials')
  }

  const res = await fetch(PH_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    throw new UpstreamError('producthunt', `oauth http ${res.status}`)
  }

  const body = (await res.json()) as PHOAuthResponse
  if (!body.access_token || !body.expires_in) {
    throw new UpstreamError('producthunt', 'oauth response missing access_token or expires_in')
  }

  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000 - EXPIRY_SKEW_MS,
  }
  return body.access_token
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token
  }
  return fetchAccessToken()
}

function computePostedAfter(opts?: FetchProductHuntOpts): string {
  // YYYY-MM-DD -> midnight UTC of that day. Falls back to "24h ago" so
  // a no-arg call still returns a recent daily top list.
  if (opts?.date) {
    return `${opts.date}T00:00:00.000Z`
  }
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
}

function readTopicNames(edges: Array<{ node: PHTopic }> | undefined | null): string[] {
  if (!edges) return []
  return edges
    .map((e) => e.node?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
}

function toProduct(post: PHPost): Product {
  const topicNames = readTopicNames(post.topics?.edges)
  const votes = post.votesCount || 0
  const comments = post.commentsCount || 0
  // The shared `Product` type omits `source` (it lives on `Article`), but
  // the frontend card for Product Hunt still needs to know which source a
  // card came from. We attach it at runtime and cast — the field is present
  // on the wire and consumed by callers regardless of the type declaration.
  return {
    id: `ph_${post.id}`,
    url: post.url,
    title: post.name,
    tags: topicNames,
    comments_count: comments,
    points_count: votes,
    image_url: post.media?.[0]?.url || '',
    published_at: Date.parse(post.createdAt),
    source: 'producthunt',
    description: (post.description || '').slice(0, 200),
    tagline: post.tagline || '',
    votes_count: votes,
    topics: topicNames,
  } as Product
}

/**
 * Fetches the daily top Product Hunt posts via Client-Only OAuth + GraphQL
 * and maps each `posts.edges.node` to the shared Product shape.
 *
 * The caller-supplied `date` (YYYY-MM-DD) is converted to the start-of-day
 * UTC `postedAfter` filter. Without `date`, the call uses a 24h-ago window
 * so the result still represents "today's top" in the local server TZ.
 */
export async function fetchProductHunt(
  opts?: FetchProductHuntOpts
): Promise<Product[]> {
  const token = await getAccessToken()
  const postedAfter = computePostedAfter(opts)

  const res = await fetch(PH_GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: POSTS_QUERY,
      variables: { postedAfter },
    }),
  })

  if (!res.ok) {
    throw new UpstreamError('producthunt', `graphql http ${res.status}`)
  }

  const json = (await res.json()) as PHGqlResponse

  if (json.errors && json.errors.length > 0) {
    const firstMessage = json.errors[0]?.message ?? 'unknown error'
    throw new UpstreamError('producthunt', `graphql error: ${firstMessage}`)
  }

  const edges = json.data?.posts?.edges ?? []
  return edges.map((e) => toProduct(e.node))
}
