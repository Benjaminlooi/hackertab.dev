import type { Article } from '../../types'

// A valid Article matching the frontend's shape at src/types/index.ts:43-46
export const articleFixture: Article = {
  id: 'test-id',
  url: 'https://example.com/article',
  title: 'Test Article',
  tags: ['javascript'],
  comments_count: 5,
  points_count: 42,
  image_url: '',
  published_at: 1700000000000,
  source: 'hackernews',
  canonical_url: 'https://news.ycombinator.com/item?id=test',
  description: 'A test article',
}
