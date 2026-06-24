import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchHackerNoon } from './hackernoon'

const MAIN_FEED = 'https://hackernoon.com/feed'
const TAGGED_FEED = 'https://hackernoon.com/tagged/python/feed'

// Helper: build a HackerNoon RSS feed XML string from a list of items
function buildFeed(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>HackerNoon</title>
    <link>https://hackernoon.com</link>
    <description>How hackers start their afternoons.</description>
    ${items.join('\n')}
  </channel>
</rss>`
}

function buildItem(opts: {
  title?: string
  link?: string
  guid?: string
  pubDate?: string
  creator?: string
  thumbnail?: string
  categories?: string[]
  contentHtml?: string
}): string {
  const title = opts.title ?? 'Sample HackerNoon Article'
  const link = opts.link ?? 'https://hackernoon.com/sample-article?source=rss'
  const guid = opts.guid ?? 'https://hackernoon.com/sample-article'
  const pubDate = opts.pubDate ?? 'Tue, 23 Jun 2026 16:00:04 GMT'
  const creator = opts.creator ?? 'Jane Author'
  const thumbnail = opts.thumbnail ?? 'https://cdn.hackernoon.com/images/sample.jpg'
  const categories = opts.categories ?? ['blockchain', 'crypto']
  const contentHtml = opts.contentHtml ?? '<p>Article body content goes here.</p>'

  const cats = categories.map((c) => `<category>${c}</category>`).join('')
  return `<item>
    <title>${title}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${guid}</guid>
    ${cats}
    <dc:creator>${creator}</dc:creator>
    <pubDate>${pubDate}</pubDate>
    <media:thumbnail url="${thumbnail}" />
    <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
  </item>`
}

describe('fetchHackerNoon()', () => {
  it('transforms a HackerNoon article into the Article shape (main feed)', async () => {
    const item = buildItem({
      title: 'How to Build a HackerNoon Client',
      link: 'https://hackernoon.com/how-to-build-a-hackernoon-client?source=rss',
      guid: 'https://hackernoon.com/how-to-build-a-hackernoon-client',
      pubDate: 'Tue, 23 Jun 2026 16:00:04 GMT',
      creator: 'Jane Author',
      thumbnail: 'https://cdn.hackernoon.com/images/abc.jpg',
      categories: ['javascript', 'webdev'],
    })
    server.use(
      http.get(MAIN_FEED, () =>
        HttpResponse.xml(buildFeed([item]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      )
    )

    const articles = await fetchHackerNoon()

    expect(articles).toHaveLength(1)
    const a = articles[0]!
    expect(a.id).toBe('https://hackernoon.com/how-to-build-a-hackernoon-client')
    expect(a.url).toBe('https://hackernoon.com/how-to-build-a-hackernoon-client?source=rss')
    expect(a.title).toBe('How to Build a HackerNoon Client')
    expect(a.source).toBe('hackernoon')
    expect(a.comments_count).toBe(0)
    expect(a.points_count).toBe(0)
    expect(a.image_url).toBe('https://cdn.hackernoon.com/images/abc.jpg')
    expect(a.published_at).toBe(Date.parse('Tue, 23 Jun 2026 16:00:04 GMT'))
  })

  it('fetches the tagged feed when a tag is provided', async () => {
    let requestedUrl = ''
    const item1 = buildItem({
      title: 'Python Article One',
      link: 'https://hackernoon.com/python-article-one?source=rss',
      guid: 'https://hackernoon.com/python-article-one',
      categories: ['python'],
    })
    const item2 = buildItem({
      title: 'Python Article Two',
      link: 'https://hackernoon.com/python-article-two?source=rss',
      guid: 'https://hackernoon.com/python-article-two',
      categories: ['python', 'django'],
    })
    server.use(
      http.get(TAGGED_FEED, ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.xml(buildFeed([item1, item2]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchHackerNoon({ tags: ['python'] })

    expect(requestedUrl).toBe(TAGGED_FEED)
    expect(articles).toHaveLength(2)
    expect(articles[0]!.title).toBe('Python Article One')
    expect(articles[1]!.title).toBe('Python Article Two')
    expect(articles[0]!.source).toBe('hackernoon')
    expect(articles[1]!.source).toBe('hackernoon')
  })

  it('fetches the main feed when no tags are provided', async () => {
    let requestedUrl = ''
    server.use(
      http.get(MAIN_FEED, ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.xml(buildFeed([]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchHackerNoon()

    expect(requestedUrl).toBe(MAIN_FEED)
    expect(articles).toEqual([])
  })

  it('collects multiple <category> elements into a string array', async () => {
    const item = buildItem({
      title: 'Multi-Category Article',
      link: 'https://hackernoon.com/multi-cat?source=rss',
      guid: 'https://hackernoon.com/multi-cat',
      categories: ['blockchain', 'crypto', 'web3', 'ethereum'],
    })
    server.use(
      http.get(MAIN_FEED, () =>
        HttpResponse.xml(buildFeed([item]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      )
    )

    const articles = await fetchHackerNoon()

    expect(articles[0]!.tags).toEqual(['blockchain', 'crypto', 'web3', 'ethereum'])
  })

  it('handles a single <category> as a one-element array', async () => {
    const item = buildItem({
      title: 'Single Category Article',
      link: 'https://hackernoon.com/single-cat?source=rss',
      guid: 'https://hackernoon.com/single-cat',
      categories: ['python'],
    })
    server.use(
      http.get(MAIN_FEED, () =>
        HttpResponse.xml(buildFeed([item]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      )
    )

    const articles = await fetchHackerNoon()

    expect(articles[0]!.tags).toEqual(['python'])
  })

  it('strips HTML tags from content:encoded and truncates description to 200 chars', async () => {
    const longHtml = '<p>' + 'x'.repeat(500) + '</p>'
    const item = buildItem({
      title: 'Long Content Article',
      link: 'https://hackernoon.com/long?source=rss',
      guid: 'https://hackernoon.com/long',
      contentHtml: longHtml,
    })
    server.use(
      http.get(MAIN_FEED, () =>
        HttpResponse.xml(buildFeed([item]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      )
    )

    const articles = await fetchHackerNoon()

    const desc = articles[0]!.description!
    expect(desc).toHaveLength(200)
    expect(desc).not.toContain('<')
    expect(desc).not.toContain('>')
  })

  it('returns an empty string for description when content:encoded is missing', async () => {
    const itemXml = `<item>
      <title>No Content Article</title>
      <link>https://hackernoon.com/no-content?source=rss</link>
      <guid isPermaLink="true">https://hackernoon.com/no-content</guid>
      <pubDate>Tue, 23 Jun 2026 16:00:04 GMT</pubDate>
    </item>`
    server.use(
      http.get(MAIN_FEED, () =>
        HttpResponse.xml(buildFeed([itemXml]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      )
    )

    const articles = await fetchHackerNoon()

    expect(articles[0]!.description).toBe('')
  })

  it('returns empty image_url when media:thumbnail is missing', async () => {
    const itemXml = `<item>
      <title>No Thumbnail Article</title>
      <link>https://hackernoon.com/no-thumb?source=rss</link>
      <guid isPermaLink="true">https://hackernoon.com/no-thumb</guid>
      <pubDate>Tue, 23 Jun 2026 16:00:04 GMT</pubDate>
    </item>`
    server.use(
      http.get(MAIN_FEED, () =>
        HttpResponse.xml(buildFeed([itemXml]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      )
    )

    const articles = await fetchHackerNoon()

    expect(articles[0]!.image_url).toBe('')
  })

  it('throws when the tagged feed returns a 404', async () => {
    server.use(
      http.get('https://hackernoon.com/tagged/nonexistent-tag/feed', () =>
        new HttpResponse(null, { status: 404, statusText: 'Not Found' })
      )
    )

    await expect(
      fetchHackerNoon({ tags: ['nonexistent-tag'] })
    ).rejects.toThrow('HackerNoon API error: 404')
  })

  it('throws when the main feed returns a 500', async () => {
    server.use(
      http.get(MAIN_FEED, () =>
        new HttpResponse(null, { status: 500, statusText: 'Server Error' })
      )
    )

    await expect(fetchHackerNoon()).rejects.toThrow('HackerNoon API error: 500')
  })

  it('uses only the first tag when multiple tags are provided', async () => {
    let requestedUrl = ''
    server.use(
      http.get('https://hackernoon.com/tagged/react/feed', ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.xml(buildFeed([]), {
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      })
    )

    await fetchHackerNoon({ tags: ['react', 'redux', 'javascript'] })

    expect(requestedUrl).toBe('https://hackernoon.com/tagged/react/feed')
  })
})
