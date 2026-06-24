import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchMedium } from './medium'

const MEDIUM_FEED = 'https://medium.com/feed/tag'

// Minimal RSS feed XML matching the shape documented in the task spec.
// Two items: one with media:thumbnail + multiple categories + CDATA body,
// one with no media and a single category.
const rssWithTwoItems = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>Medium Tag Feed: python</title>
    <item>
      <title>How to use Python with FastAPI</title>
      <link>https://medium.com/@user1/fastapi-python-1a2b3c</link>
      <guid isPermaLink="true">https://medium.com/@user1/fastapi-python-1a2b3c</guid>
      <category>Programming</category>
      <category>Python</category>
      <category>API</category>
      <dc:creator><![CDATA[Author One]]></dc:creator>
      <pubDate>Mon, 22 Jun 2026 21:30:00 +0000</pubDate>
      <media:thumbnail url="https://cdn-images-1.medium.com/max/1024/img1.jpg" />
      <content:encoded><![CDATA[<p>First article <strong>body</strong> with HTML.</p>]]></content:encoded>
    </item>
    <item>
      <title>Decorators in Python Explained</title>
      <link>https://medium.com/@user2/decorators-python-4d5e6f</link>
      <guid>https://medium.com/@user2/decorators-python-4d5e6f</guid>
      <category>Python</category>
      <pubDate>Sun, 21 Jun 2026 10:00:00 +0000</pubDate>
      <content:encoded><![CDATA[<p>Second article body — no image, single category.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

function mockRss(xml: string) {
  return http.get(`${MEDIUM_FEED}/:tag`, () => {
    return new HttpResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  })
}

describe('fetchMedium()', () => {
  it('transforms Medium RSS items into the Article[] shape', async () => {
    server.use(mockRss(rssWithTwoItems))

    const articles = await fetchMedium({ tags: ['python'] })

    expect(articles).toHaveLength(2)

    // First item — full transformation
    const a = articles[0]!
    expect(a.id).toBe('https://medium.com/@user1/fastapi-python-1a2b3c')
    expect(a.url).toBe('https://medium.com/@user1/fastapi-python-1a2b3c')
    expect(a.title).toBe('How to use Python with FastAPI')
    expect(a.source).toBe('medium')
    expect(a.canonical_url).toBe(a.url)
    expect(a.comments_count).toBe(0)
    expect(a.points_count).toBe(0)
    expect(a.image_url).toBe('https://cdn-images-1.medium.com/max/1024/img1.jpg')
    expect(a.published_at).toBe(Date.parse('Mon, 22 Jun 2026 21:30:00 +0000'))
    expect(a.tags).toEqual(['Programming', 'Python', 'API'])
  })

  it('returns multiple articles in feed order', async () => {
    server.use(mockRss(rssWithTwoItems))

    const articles = await fetchMedium({ tags: ['python'] })

    expect(articles).toHaveLength(2)
    expect(articles[0]!.title).toBe('How to use Python with FastAPI')
    expect(articles[1]!.title).toBe('Decorators in Python Explained')
  })

  it('normalizes a single <category> into a string array', async () => {
    server.use(mockRss(rssWithTwoItems))

    const articles = await fetchMedium({ tags: ['python'] })

    // Second item has a single <category> — should still be a string[].
    expect(articles[1]!.tags).toEqual(['Python'])
  })

  it('returns image_url="" when media:thumbnail is missing', async () => {
    server.use(mockRss(rssWithTwoItems))

    const articles = await fetchMedium({ tags: ['python'] })

    // Second item has no media:thumbnail and no media:content.
    expect(articles[1]!.image_url).toBe('')
  })

  it('falls back to media:content url when media:thumbnail is missing', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <item>
      <title>Fallback image test</title>
      <link>https://medium.com/@u/fallback</link>
      <guid>https://medium.com/@u/fallback</guid>
      <pubDate>Mon, 22 Jun 2026 00:00:00 +0000</pubDate>
      <media:content url="https://cdn-images-1.medium.com/fallback.jpg" />
    </item>
  </channel>
</rss>`
    server.use(mockRss(xml))

    const articles = await fetchMedium({ tags: ['python'] })

    expect(articles[0]!.image_url).toBe('https://cdn-images-1.medium.com/fallback.jpg')
  })

  it('strips HTML tags from the description', async () => {
    server.use(mockRss(rssWithTwoItems))

    const articles = await fetchMedium({ tags: ['python'] })

    // The first item's body contains <p>...<strong>body</strong>...</p> — all tags should be gone.
    expect(articles[0]!.description).not.toMatch(/<[^>]+>/)
    expect(articles[0]!.description).toContain('First article')
    expect(articles[0]!.description).toContain('body')
  })

  it('truncates description to 200 characters', async () => {
    const longBody = '<p>' + 'x'.repeat(500) + '</p>'
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <item>
      <title>Long body</title>
      <link>https://medium.com/@u/long</link>
      <guid>https://medium.com/@u/long</guid>
      <pubDate>Mon, 22 Jun 2026 00:00:00 +0000</pubDate>
      <content:encoded><![CDATA[${longBody}]]></content:encoded>
    </item>
  </channel>
</rss>`
    server.use(mockRss(xml))

    const articles = await fetchMedium({ tags: ['python'] })

    expect(articles[0]!.description).toHaveLength(200)
  })

  it('uses "programming" as the default tag when no tags are provided', async () => {
    let requestedTag = ''
    server.use(
      http.get(`${MEDIUM_FEED}/:tag`, ({ params }) => {
        requestedTag = String(params['tag'])
        return new HttpResponse(rssWithTwoItems, { status: 200 })
      })
    )

    await fetchMedium()

    expect(requestedTag).toBe('programming')
  })

  it('encodes the requested tag in the URL', async () => {
    let requestedPath = ''
    server.use(
      http.get(`${MEDIUM_FEED}/:tag`, ({ request }) => {
        requestedPath = new URL(request.url).pathname
        return new HttpResponse(rssWithTwoItems, { status: 200 })
      })
    )

    await fetchMedium({ tags: ['web dev'] })

    // msw decodes path params for us, so assert the raw path was encoded.
    expect(requestedPath).toBe('/feed/tag/web%20dev')
  })

  it('uses the first tag when multiple tags are provided', async () => {
    let requestedTag = ''
    server.use(
      http.get(`${MEDIUM_FEED}/:tag`, ({ params }) => {
        requestedTag = String(params['tag'])
        return new HttpResponse(rssWithTwoItems, { status: 200 })
      })
    )

    await fetchMedium({ tags: ['python', 'javascript', 'rust'] })

    expect(requestedTag).toBe('python')
  })

  it('throws when the upstream returns 404 (invalid tag)', async () => {
    server.use(
      http.get(`${MEDIUM_FEED}/:tag`, () => {
        return new HttpResponse(null, { status: 404, statusText: 'Not Found' })
      })
    )

    await expect(fetchMedium({ tags: ['this-tag-does-not-exist'] })).rejects.toThrow(
      /Medium RSS error: 404/
    )
  })

  it('returns an empty array when the feed has no items', async () => {
    const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
  </channel>
</rss>`
    server.use(mockRss(emptyFeed))

    const articles = await fetchMedium({ tags: ['python'] })

    expect(articles).toEqual([])
  })
})
