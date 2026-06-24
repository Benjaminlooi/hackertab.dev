import type { Article } from '../../types'
import { UpstreamError } from '../../middleware/error'
import { env } from '../env'

// Reddit JSON endpoints went OAuth-only on 2026-05-28 — unauthenticated
// https://www.reddit.com/r/.../top.json requests are now rejected. This client
// obtains a short-lived bearer token via the client-credentials grant and uses
// https://oauth.reddit.com for data fetches.
const OAUTH_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'
const OAUTH_API_BASE = 'https://oauth.reddit.com'
const USER_AGENT = 'hackertab-backend/1.0'

// Map frontend tag labels (whatever the user picked in the UI) to the actual
// subreddit name we hit. Values are the canonical subreddit slug — the value
// is also used as the Article tag. Unknown / missing tags fall back to
// r/programming.
const SUBREDDIT_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  react: 'reactjs',
  rust: 'rust',
  go: 'golang',
  java: 'java',
  kotlin: 'kotlin',
  swift: 'swift',
  cpp: 'cpp',
  csharp: 'csharp',
  php: 'php',
  ruby: 'ruby',
  elixir: 'elixir',
  scala: 'scala',
  haskell: 'haskell',
  clojure: 'clojure',
  lua: 'lua',
  django: 'django',
  flask: 'flask',
  nodejs: 'nodejs',
  vue: 'vuejs',
  angular: 'angular',
  svelte: 'svelte',
  nextjs: 'nextjs',
  aws: 'aws',
  gcp: 'googlecloud',
  azure: 'azure',
  docker: 'docker',
  kubernetes: 'kubernetes',
  devops: 'devops',
  ml: 'MachineLearning',
  ai: 'artificial',
  webdev: 'webdev',
  linux: 'linux',
}

// Reddit `t` parameter — only the three windows we support.
const RANGE_TO_T: Record<'daily' | 'weekly' | 'monthly', 'day' | 'week' | 'month'> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
}

export type FetchRedditOptions = {
  tags?: string[]
  range?: 'daily' | 'weekly' | 'monthly'
}

type RedditTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

type RedditChild = {
  data: {
    id: string
    title: string
    permalink: string
    num_comments?: number
    ups?: number
    downs?: number
    thumbnail?: string
    selftext?: string
    created_utc: number
  }
}

type RedditListing = {
  data?: {
    children?: RedditChild[]
  }
}

// Module-level token cache. Reddit access tokens are valid for 1 hour; we
// refresh 60s early to avoid edge-of-expiry 401s. Reusing the token across
// requests keeps us well under the 100 QPM per-client rate limit.
let cachedToken: { token: string; expiresAt: number } | null = null

function toBase64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64')
}

function thumbnailToUrl(thumbnail: string | undefined): string {
  if (!thumbnail) return ''
  return thumbnail.startsWith('http') ? thumbnail : ''
}

export async function fetchReddit(opts: FetchRedditOptions = {}): Promise<Article[]> {
  const token = await getRedditToken()
  const tag = opts.tags?.[0] ?? 'programming'
  const subreddit = SUBREDDIT_MAP[tag] ?? 'programming'
  const range = opts.range ?? 'daily'
  const t = RANGE_TO_T[range]

  const res = await fetch(
    `${OAUTH_API_BASE}/r/${subreddit}/top.json?limit=25&t=${t}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
    },
  )

  if (!res.ok) {
    throw new UpstreamError('reddit', `API error: ${res.status}`)
  }

  const payload = (await res.json()) as RedditListing
  const posts = payload.data?.children?.map((child) => child.data) ?? []

  return posts.map(
    (p): Article => ({
      id: p.id,
      url: `https://reddit.com${p.permalink}`,
      title: p.title,
      tags: [subreddit],
      comments_count: p.num_comments ?? 0,
      points_count: (p.ups ?? 0) - (p.downs ?? 0),
      image_url: thumbnailToUrl(p.thumbnail),
      published_at: (p.created_utc ?? 0) * 1000,
      source: 'reddit',
      description: (p.selftext ?? '').slice(0, 200),
    }),
  )
}

async function getRedditToken(): Promise<string> {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) {
    throw new UpstreamError('reddit', 'missing OAuth credentials')
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const credentials = toBase64(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`)
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    throw new UpstreamError('reddit', `OAuth token fetch failed: ${res.status}`)
  }

  const data = (await res.json()) as RedditTokenResponse
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

// Test-only — clears the in-process token cache. Production callers should
// never need to invoke this; it exists so unit tests can exercise the
// OAuth-then-data flow with a clean slate.
export function __resetRedditTokenCacheForTests(): void {
  cachedToken = null
}
