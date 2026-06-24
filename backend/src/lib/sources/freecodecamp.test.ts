import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchFreeCodeCamp } from './freecodecamp'

const RSS_URL = 'https://www.freecodecamp.org/news/rss/'

const VALID_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>freeCodeCamp.org</title>
    <link>https://www.freecodecamp.org/news</link>
    <description>News</description>
    <item>
      <title>How to Learn AI in 2026</title>
      <link>https://www.freecodecamp.org/news/learn-ai-2026/</link>
      <guid isPermaLink="false">6a39b4a8a46b9ad44f07cee5</guid>
      <category>Artificial Intelligence</category>
      <category>Python</category>
      <dc:creator>Jane Doe</dc:creator>
      <pubDate>Mon, 22 Jun 2026 21:30:00 +0000</pubDate>
      <media:content url="https://cdn.hashnode.com/res/hashnode/image/upload/v123/foo.png" medium="image" />
      <content:encoded><![CDATA[<p>Full article body with <strong>HTML</strong> markup and links.</p><p>More text here for testing the description truncation logic in the source client.</p>]]></content:encoded>
    </item>
    <item>
      <title>Understanding JavaScript Closures</title>
      <link>https://www.freecodecamp.org/news/js-closures/</link>
      <guid isPermaLink="false">7b50c5b9b57cae55e18ddf6</guid>
      <category>JavaScript</category>
      <dc:creator>John Smith</dc:creator>
      <pubDate>Sun, 21 Jun 2026 10:00:00 +0000</pubDate>
      <media:content url="https://cdn.hashnode.com/res/hashnode/image/upload/v456/bar.jpg" medium="image" />
      <content:encoded><![CDATA[<p>Closures explained with examples.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

describe('fetchFreeCodeCamp', () => {
  it('fetches RSS, parses items, transforms to Article[]', async () => {
    server.use(
      http.get(RSS_URL, () => {
        return new HttpResponse(VALID_RSS, {
          headers: { 'content-type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchFreeCodeCamp()

    expect(articles).toHaveLength(2)

    // First article — multiple categories (array), media:content URL, RFC822 pubDate
    expect(articles[0]).toEqual({
      id: '6a39b4a8a46b9ad44f07cee5',
      url: 'https://www.freecodecamp.org/news/learn-ai-2026/',
      title: 'How to Learn AI in 2026',
      tags: ['Artificial Intelligence', 'Python'],
      comments_count: 0,
      points_count: 0,
      image_url: 'https://cdn.hashnode.com/res/hashnode/image/upload/v123/foo.png',
      published_at: Date.parse('Mon, 22 Jun 2026 21:30:00 +0000'),
      source: 'freecodecamp',
      description:
        'Full article body with HTML markup and links.More text here for testing the description truncation logic in the source client.',
    })

    // Second article — single category (string), different author
    expect(articles[1]).toEqual({
      id: '7b50c5b9b57cae55e18ddf6',
      url: 'https://www.freecodecamp.org/news/js-closures/',
      title: 'Understanding JavaScript Closures',
      tags: ['JavaScript'],
      comments_count: 0,
      points_count: 0,
      image_url: 'https://cdn.hashnode.com/res/hashnode/image/upload/v456/bar.jpg',
      published_at: Date.parse('Sun, 21 Jun 2026 10:00:00 +0000'),
      source: 'freecodecamp',
      description: 'Closures explained with examples.',
    })
  })

  it('returns image_url="" when media:content is missing', async () => {
    const noMediaRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>freeCodeCamp.org</title>
    <link>https://www.freecodecamp.org/news</link>
    <description>News</description>
    <item>
      <title>No Media Article</title>
      <link>https://www.freecodecamp.org/news/no-media/</link>
      <guid isPermaLink="false">abc123</guid>
      <category>Web Dev</category>
      <dc:creator>Solo Author</dc:creator>
      <pubDate>Mon, 22 Jun 2026 21:30:00 +0000</pubDate>
      <content:encoded><![CDATA[<p>No image here.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

    server.use(
      http.get(RSS_URL, () => {
        return new HttpResponse(noMediaRss, {
          headers: { 'content-type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchFreeCodeCamp()

    expect(articles).toHaveLength(1)
    expect(articles[0]!.image_url).toBe('')
  })

  it('falls back to media:thumbnail when media:content is missing', async () => {
    const thumbnailRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>freeCodeCamp.org</title>
    <link>https://www.freecodecamp.org/news</link>
    <description>News</description>
    <item>
      <title>Thumbnail Only Article</title>
      <link>https://www.freecodecamp.org/news/thumb/</link>
      <guid isPermaLink="false">thumb001</guid>
      <category>Tech</category>
      <dc:creator>Author</dc:creator>
      <pubDate>Mon, 22 Jun 2026 21:30:00 +0000</pubDate>
      <media:thumbnail url="https://cdn.hashnode.com/res/hashnode/image/upload/v789/thumb.png" />
      <content:encoded><![CDATA[<p>Thumbnail fallback test.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

    server.use(
      http.get(RSS_URL, () => {
        return new HttpResponse(thumbnailRss, {
          headers: { 'content-type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchFreeCodeCamp()

    expect(articles).toHaveLength(1)
    expect(articles[0]!.image_url).toBe(
      'https://cdn.hashnode.com/res/hashnode/image/upload/v789/thumb.png'
    )
  })

  it('truncates description to 200 chars after stripping HTML', async () => {
    const longHtml = 'a'.repeat(50) + '<br/>' + 'b'.repeat(50) + '<p>x</p>' + 'c'.repeat(200)
    const longRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>freeCodeCamp.org</title>
    <link>https://www.freecodecamp.org/news</link>
    <description>News</description>
    <item>
      <title>Long Article</title>
      <link>https://www.freecodecamp.org/news/long/</link>
      <guid isPermaLink="false">long001</guid>
      <category>Test</category>
      <dc:creator>Author</dc:creator>
      <pubDate>Mon, 22 Jun 2026 21:30:00 +0000</pubDate>
      <content:encoded><![CDATA[${longHtml}]]></content:encoded>
    </item>
  </channel>
</rss>`

    server.use(
      http.get(RSS_URL, () => {
        return new HttpResponse(longRss, {
          headers: { 'content-type': 'application/rss+xml' },
        })
      })
    )

    const articles = await fetchFreeCodeCamp()

    expect(articles).toHaveLength(1)
    // 50 a + 50 b + "x" + first 99 c = 200 chars (no HTML tags in stripped result)
    expect(articles[0]!.description).toHaveLength(200)
    expect(articles[0]!.description).not.toMatch(/<[^>]+>/)
  })

  it('throws on malformed XML', async () => {
    server.use(
      http.get(RSS_URL, () => {
        return new HttpResponse('<rss><channel><item><title>Unclosed', {
          headers: { 'content-type': 'application/rss+xml' },
        })
      })
    )

    await expect(fetchFreeCodeCamp()).rejects.toThrow()
  })

  it('accepts an ignored tags parameter', async () => {
    server.use(
      http.get(RSS_URL, () => {
        return new HttpResponse(VALID_RSS, {
          headers: { 'content-type': 'application/rss+xml' },
        })
      })
    )

    // FreeCodeCamp RSS does not support tag filtering — param must be ignored
    const articles = await fetchFreeCodeCamp({ tags: ['Python', 'JavaScript'] })
    expect(articles).toHaveLength(2)
  })
})
