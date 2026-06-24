import * as cheerio from 'cheerio'
import type { Repository } from '../../types'
import { UpstreamError } from '../../middleware/error'

const GITHUB_TRENDING_BASE = 'https://github.com/trending'

export type FetchGithubTrendingOptions = {
  tags?: string[]
  range?: string
}

const VALID_RANGES = new Set(['daily', 'weekly', 'monthly'])

/**
 * Scrapes https://github.com/trending and maps each <article class="Box-row">
 * row to the shared Repository shape used by the rest of the backend.
 *
 * GitHub's trending page has no official JSON API, so we fall back to HTML
 * scraping with cheerio. The page's class names change periodically, so each
 * repo is parsed in its own try/catch — a single broken row is skipped instead
 * of taking down the whole feed. Only full-page fetch / parse failures
 * (anti-bot 403, non-OK HTTP) bubble up as UpstreamError so the route handler
 * can return 502 to the frontend.
 */
export async function fetchGithubTrending(
  opts: FetchGithubTrendingOptions = {}
): Promise<Repository[]> {
  const language = opts?.tags?.[0] || ''
  const rawRange = opts?.range || 'daily'
  const range = VALID_RANGES.has(rawRange) ? rawRange : 'daily'
  const url = language
    ? `${GITHUB_TRENDING_BASE}/${encodeURIComponent(language)}?since=${range}`
    : `${GITHUB_TRENDING_BASE}?since=${range}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'hackertab-backend/1.0' },
  })
  if (res.status === 403) {
    throw new UpstreamError('github-trending', 'blocked by anti-bot')
  }
  if (!res.ok) {
    throw new UpstreamError('github-trending', `HTTP ${res.status}`)
  }
  const html = await res.text()
  const $ = cheerio.load(html)

  const repos: Repository[] = []
  $('article.Box-row').each((_idx, el) => {
    try {
      const $el = $(el)
      const href = $el.find('h2 a').first().attr('href') || ''
      const fullName = href.replace(/^\//, '')
      const parts = fullName.split('/')
      const owner = parts[0]
      const name = parts[1]
      if (!owner || !name) return

      const description = $el.find('p.col-9').first().text().trim()
      const technology = $el.find('span[itemprop="programmingLanguage"]').first().text().trim()
      const starsText = $el.find('a[href$="/stargazers"]').first().text().trim()
      const stars_count = parseInt(starsText.replace(/,/g, ''), 10) || 0
      const starsRangeText = $el
        .find('span.d-inline-block.float-sm-right')
        .first()
        .text()
        .trim()
      const stars_in_range = parseInt(starsRangeText.replace(/,/g, ''), 10) || 0
      const forksText = $el.find('a[href$="/forks"]').first().text().trim()
      const forks_count = parseInt(forksText.replace(/,/g, ''), 10) || 0

      repos.push({
        id: fullName,
        url: `https://github.com/${fullName}`,
        title: fullName,
        tags: technology ? [technology] : [],
        comments_count: 0,
        points_count: stars_count,
        image_url: '',
        published_at: Date.now(),
        technology: technology || 'Unknown',
        stars_count,
        source: 'github',
        description,
        owner,
        forks_count,
        stars_in_range,
        name,
      })
    } catch {
      // Skip this row — GitHub's class names shift frequently and a single
      // broken article should not poison the whole feed.
    }
  })

  return repos
}
