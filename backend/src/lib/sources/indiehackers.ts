import type { Article } from '../../types'
import { env } from '../env'
import { UpstreamError } from '../../middleware/error'

const ALGOLIA_APP_ID = 'OFCNCOG2CU'
const ALGOLIA_ENDPOINT = `https://${ALGOLIA_APP_ID}-1.algolianet.com/1/indexes/searchable_posts/query`
const HITS_PER_PAGE = 30
const SOURCE = 'indiehackers'
const DESCRIPTION_MAX = 200

type AlgoliaHit = {
  objectID?: string
  title?: string
  url?: string
  tags?: string[]
  createdAt?: number
  voteCount?: number
  commentCount?: number
  heroImage?: string
  subtitle?: string
}

type AlgoliaResponse = {
  hits?: AlgoliaHit[]
}

function buildParams(tags?: string[]): string {
  const params = new URLSearchParams()
  params.set('hitsPerPage', String(HITS_PER_PAGE))
  if (tags && tags.length > 0 && tags[0]) {
    params.set('tagFilters', `[${tags[0]}]`)
  }
  return params.toString()
}

function hitToArticle(hit: AlgoliaHit): Article {
  const createdAtSeconds = typeof hit.createdAt === 'number' ? hit.createdAt : 0
  return {
    id: hit.objectID ?? '',
    url: hit.url ?? '',
    title: hit.title ?? '',
    tags: Array.isArray(hit.tags) ? hit.tags : [],
    comments_count: typeof hit.commentCount === 'number' ? hit.commentCount : 0,
    points_count: typeof hit.voteCount === 'number' ? hit.voteCount : 0,
    image_url: hit.heroImage ?? '',
    published_at: createdAtSeconds ? createdAtSeconds * 1000 : 0,
    source: SOURCE,
    description: (hit.subtitle ?? '').slice(0, DESCRIPTION_MAX),
  }
}

export async function fetchIndieHackers(opts?: { tags?: string[] }): Promise<Article[]> {
  const key = env.INDIEHACKERS_ALGOLIA_KEY
  if (!key) {
    throw new UpstreamError(SOURCE, 'missing Algolia key')
  }

  const res = await fetch(ALGOLIA_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ params: buildParams(opts?.tags) }),
  })

  if (!res.ok) {
    throw new UpstreamError(SOURCE, `Algolia error: ${res.status}`)
  }

  const json = (await res.json()) as AlgoliaResponse
  const hits = Array.isArray(json.hits) ? json.hits : []
  return hits.map(hitToArticle)
}
