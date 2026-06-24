import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchGithubTrending } from './githubTrending'
import { UpstreamError } from '../../middleware/error'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(__dirname, '../../test/fixtures/github-trending.html')

const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8')

const TRENDING_DAILY_PATH = 'https://github.com/trending/python'
const TRENDING_NOLANG_PATH = 'https://github.com/trending'
const TRENDING_WEEKLY_PATH = 'https://github.com/trending/typescript'

const TRENDING_DAILY = `${TRENDING_DAILY_PATH}?since=daily`
const TRENDING_NOLANG = `${TRENDING_NOLANG_PATH}?since=daily`
const TRENDING_WEEKLY = `${TRENDING_WEEKLY_PATH}?since=weekly`

describe('fetchGithubTrending()', () => {
  it('scrapes the fixture HTML and transforms 2 repos into Repository[]', async () => {
    server.use(
      http.get(TRENDING_DAILY_PATH, () => {
        return new HttpResponse(fixtureHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      })
    )

    const before = Date.now()
    const repos = await fetchGithubTrending({ tags: ['python'], range: 'daily' })
    const after = Date.now()

    expect(repos).toHaveLength(2)

    const [react, v] = repos
    expect(react).toBeDefined()
    expect(v).toBeDefined()

    expect(react).toMatchObject({
      id: 'facebook/react',
      url: 'https://github.com/facebook/react',
      title: 'facebook/react',
      owner: 'facebook',
      name: 'react',
      technology: 'JavaScript',
      tags: ['JavaScript'],
      stars_count: 220000,
      points_count: 220000,
      forks_count: 45000,
      stars_in_range: 100,
      comments_count: 0,
      image_url: '',
      source: 'github',
      description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces',
    })
    expect(react?.published_at).toBeGreaterThanOrEqual(before)
    expect(react?.published_at).toBeLessThanOrEqual(after)

    expect(v).toMatchObject({
      id: 'vlang/v',
      url: 'https://github.com/vlang/v',
      title: 'vlang/v',
      owner: 'vlang',
      name: 'v',
      technology: 'V',
      tags: ['V'],
      stars_count: 35000,
      points_count: 35000,
      forks_count: 2000,
      stars_in_range: 50,
      source: 'github',
    })
  })

  it('builds the URL without a language segment when tags is empty', async () => {
    let requestedUrl = ''
    server.use(
      http.get(TRENDING_NOLANG_PATH, ({ request }) => {
        requestedUrl = request.url
        return new HttpResponse(fixtureHtml, { status: 200 })
      })
    )

    await fetchGithubTrending({ range: 'daily' })

    expect(requestedUrl).toBe(TRENDING_NOLANG)
  })

  it('uses range=weekly when supplied', async () => {
    let requestedUrl = ''
    server.use(
      http.get(TRENDING_WEEKLY_PATH, ({ request }) => {
        requestedUrl = request.url
        return new HttpResponse(fixtureHtml, { status: 200 })
      })
    )

    await fetchGithubTrending({ tags: ['typescript'], range: 'weekly' })

    expect(requestedUrl).toBe(TRENDING_WEEKLY)
  })

  it('throws UpstreamError("github-trending", "blocked by anti-bot") on 403', async () => {
    server.use(
      http.get(TRENDING_DAILY_PATH, () => {
        return new HttpResponse('Forbidden', { status: 403, statusText: 'Forbidden' })
      })
    )

    await expect(
      fetchGithubTrending({ tags: ['python'], range: 'daily' })
    ).rejects.toBeInstanceOf(UpstreamError)

    try {
      await fetchGithubTrending({ tags: ['python'], range: 'daily' })
    } catch (err) {
      expect((err as UpstreamError).source).toBe('github-trending')
      expect((err as UpstreamError).message).toBe('blocked by anti-bot')
    }
  })

  it('throws UpstreamError on other non-OK responses (e.g. 500)', async () => {
    server.use(
      http.get(TRENDING_DAILY_PATH, () => {
        return new HttpResponse('Internal Server Error', { status: 500, statusText: 'Server Error' })
      })
    )

    await expect(
      fetchGithubTrending({ tags: ['python'], range: 'daily' })
    ).rejects.toMatchObject({
      name: 'UpstreamError',
      source: 'github-trending',
      message: expect.stringContaining('500'),
    })
  })

  it('returns [] when the HTML body has no <article class="Box-row">', async () => {
    server.use(
      http.get(TRENDING_DAILY_PATH, () => {
        return new HttpResponse('<html><body><p>No trending repos</p></body></html>', {
          status: 200,
        })
      })
    )

    const repos = await fetchGithubTrending({ tags: ['python'], range: 'daily' })
    expect(repos).toEqual([])
  })

  it('returns [] when the HTML body is completely empty', async () => {
    server.use(
      http.get(TRENDING_DAILY_PATH, () => {
        return new HttpResponse('', { status: 200 })
      })
    )

    const repos = await fetchGithubTrending({ tags: ['python'], range: 'daily' })
    expect(repos).toEqual([])
  })

  it('skips a repo when its <h2 a> is missing or malformed', async () => {
    const brokenHtml = `<html><body>
<article class="Box-row">
  <h2><a href="/not-a-valid-name">no-slash-here</a></h2>
</article>
<article class="Box-row">
  <h2><a href="/owner/repo">owner / repo</a></h2>
  <p class="col-9">valid</p>
  <span itemprop="programmingLanguage">Go</span>
  <a href="/owner/repo/stargazers">10</a>
  <span class="d-inline-block float-sm-right">1 stars today</span>
  <a href="/owner/repo/forks">0</a>
</article>
</body></html>`

    server.use(
      http.get(TRENDING_DAILY_PATH, () => new HttpResponse(brokenHtml, { status: 200 }))
    )

    const repos = await fetchGithubTrending({ tags: ['python'], range: 'daily' })
    expect(repos).toHaveLength(1)
    expect(repos[0]).toMatchObject({
      id: 'owner/repo',
      owner: 'owner',
      name: 'repo',
      technology: 'Go',
      stars_count: 10,
    })
  })

  it('falls back to technology "Unknown" and 0 stars when fields are missing', async () => {
    const sparseHtml = `<html><body>
<article class="Box-row">
  <h2><a href="/owner/sparse">owner / sparse</a></h2>
</article>
</body></html>`

    server.use(
      http.get(TRENDING_DAILY_PATH, () => new HttpResponse(sparseHtml, { status: 200 }))
    )

    const repos = await fetchGithubTrending({ tags: ['python'], range: 'daily' })
    expect(repos).toHaveLength(1)
    expect(repos[0]).toMatchObject({
      id: 'owner/sparse',
      technology: 'Unknown',
      tags: [],
      stars_count: 0,
      forks_count: 0,
      stars_in_range: 0,
      description: '',
    })
  })
})
