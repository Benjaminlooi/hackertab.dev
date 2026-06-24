import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchLobsters } from './lobsters'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Lobsters</title>
    <link>https://lobste.rs/</link>
    <description>Computing-focused community centered around link aggregation and discussion</description>
    <item>
      <title>First post about Rust</title>
      <link>https://lobste.rs/s/abc123</link>
      <guid>https://lobste.rs/s/abc123</guid>
      <pubDate>Thu, 18 Jun 2026 12:04:00 -0500</pubDate>
      <comments>https://lobste.rs/s/abc123</comments>
      <category>programming</category>
      <category>rust</category>
    </item>
    <item>
      <title>Second post, single tag</title>
      <link>https://lobste.rs/s/def456</link>
      <guid>https://lobste.rs/s/def456</guid>
      <pubDate>Fri, 19 Jun 2026 09:30:00 -0500</pubDate>
      <comments>https://lobste.rs/s/def456</comments>
      <category>distributed</category>
    </item>
  </channel>
</rss>`

describe('fetchLobsters', () => {
  it('fetches daily RSS feed and transforms to Article[]', async () => {
    server.use(
      http.get('https://lobste.rs/top/1d.rss', () => {
        return new HttpResponse(SAMPLE_XML, {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchLobsters({ range: 'daily' })

    expect(articles).toHaveLength(2)
    expect(articles[0]).toEqual({
      id: 'https://lobste.rs/s/abc123',
      url: 'https://lobste.rs/s/abc123',
      title: 'First post about Rust',
      tags: ['programming', 'rust'],
      comments_count: 0,
      points_count: 0,
      image_url: '',
      published_at: Date.parse('Thu, 18 Jun 2026 12:04:00 -0500'),
      source: 'lobsters',
      description: '',
    })
    expect(articles[1]!.tags).toEqual(['distributed'])
    expect(typeof articles[0]!.published_at).toBe('number')
    expect(articles[0]!.published_at).toBeGreaterThan(0)
  })

  it('maps range to correct endpoint path', async () => {
    const seen: string[] = []
    server.use(
      http.get('https://lobste.rs/top/1w.rss', ({ request }) => {
        seen.push(new URL(request.url).pathname)
        return new HttpResponse(SAMPLE_XML, { headers: { 'Content-Type': 'application/rss+xml' } })
      })
    )

    await fetchLobsters({ range: 'weekly' })
    expect(seen).toContain('/top/1w.rss')
  })

  it('uses default RSS endpoint when no range provided', async () => {
    const seen: string[] = []
    server.use(
      http.get('https://lobste.rs/rss', ({ request }) => {
        seen.push(new URL(request.url).pathname)
        return new HttpResponse(SAMPLE_XML, { headers: { 'Content-Type': 'application/rss+xml' } })
      })
    )

    await fetchLobsters()
    expect(seen).toContain('/rss')
  })

  it('uses monthly endpoint when range=monthly', async () => {
    const seen: string[] = []
    server.use(
      http.get('https://lobste.rs/top/1m.rss', ({ request }) => {
        seen.push(new URL(request.url).pathname)
        return new HttpResponse(SAMPLE_XML, { headers: { 'Content-Type': 'application/rss+xml' } })
      })
    )

    await fetchLobsters({ range: 'monthly' })
    expect(seen).toContain('/top/1m.rss')
  })

  it('throws on malformed XML', async () => {
    server.use(
      http.get('https://lobste.rs/top/1d.rss', () => {
        return new HttpResponse('not xml at all <broken', {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      })
    )

    await expect(fetchLobsters({ range: 'daily' })).rejects.toThrow()
  })

  it('throws on HTTP error status', async () => {
    server.use(
      http.get('https://lobste.rs/top/1d.rss', () => {
        return new HttpResponse(null, { status: 500 })
      })
    )

    await expect(fetchLobsters({ range: 'daily' })).rejects.toThrow()
  })
})
