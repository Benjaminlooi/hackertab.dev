import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchHackerNews } from './hackernews'

describe('fetchHackerNews', () => {
  it('fetches top stories and transforms to Article[]', async () => {
    server.use(
      http.get('https://hacker-news.firebaseio.com/v0/topstories.json*', () => {
        return HttpResponse.json([1, 2])
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/1.json', () => {
        return HttpResponse.json({ id: 1, type: 'story', title: 'Test Story 1', url: 'https://example.com/1', score: 100, time: 1700000000, descendants: 50 })
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/2.json', () => {
        return HttpResponse.json({ id: 2, type: 'story', title: 'Ask HN: Question', url: undefined, score: 42, time: 1700000100, descendants: 10 })
      })
    )

    const articles = await fetchHackerNews()

    expect(articles).toHaveLength(2)
    expect(articles[0]).toEqual({
      id: '1', url: 'https://example.com/1', title: 'Test Story 1',
      tags: [], comments_count: 50, points_count: 100, image_url: '',
      published_at: 1700000000000, source: 'hackernews',
      canonical_url: 'https://news.ycombinator.com/item?id=1', description: ''
    })
    // Ask HN post with no url — should use canonical_url
    expect(articles[1]!.url).toBe('https://news.ycombinator.com/item?id=2')
    expect(articles[1]!.canonical_url).toBe('https://news.ycombinator.com/item?id=2')
  })

  it('skips failed item fetches (returns shorter array, not throw)', async () => {
    server.use(
      http.get('https://hacker-news.firebaseio.com/v0/topstories.json*', () => {
        return HttpResponse.json([1, 2])
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/1.json', () => {
        return new HttpResponse(null, { status: 404 })
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/2.json', () => {
        return HttpResponse.json({ id: 2, type: 'story', title: 'OK', url: 'https://ok.com', score: 1, time: 1700000000, descendants: 0 })
      })
    )

    const articles = await fetchHackerNews()
    expect(articles).toHaveLength(1)
    expect(articles[0]!.title).toBe('OK')
  })

  it('skips job stories (only returns type=story)', async () => {
    server.use(
      http.get('https://hacker-news.firebaseio.com/v0/topstories.json*', () => {
        return HttpResponse.json([1, 2])
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/1.json', () => {
        return HttpResponse.json({ id: 1, type: 'job', title: 'Job Posting', url: 'https://jobs.com', score: 1, time: 1700000000 })
      }),
      http.get('https://hacker-news.firebaseio.com/v0/item/2.json', () => {
        return HttpResponse.json({ id: 2, type: 'story', title: 'Real Story', url: 'https://story.com', score: 5, time: 1700000000, descendants: 0 })
      })
    )

    const articles = await fetchHackerNews()
    expect(articles).toHaveLength(1)
    expect(articles[0]!.title).toBe('Real Story')
  })
})
