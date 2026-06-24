import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

// env.ts reads process.env at module load — we must isolate per test via dynamic import + module cache reset

describe('env validation', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('parses valid env with all vars', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token123'
    process.env.REDDIT_CLIENT_ID = 'reddit_id'
    process.env.REDDIT_CLIENT_SECRET = 'reddit_secret'
    process.env.PRODUCTHUNT_CLIENT_ID = 'ph_id'
    process.env.PRODUCTHUNT_CLIENT_SECRET = 'ph_secret'

    vi.resetModules()
    const { env } = await import('./env')
    expect(env.UPSTASH_REDIS_REST_URL).toBe('https://upstash.example.com')
    expect(env.REDDIT_CLIENT_ID).toBe('reddit_id')
    expect(env.NODE_ENV).toBe('test') // vitest sets NODE_ENV=test
  })

  it('throws ZodError when UPSTASH_REDIS_REST_URL is missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    vi.resetModules()
    await expect(import('./env')).rejects.toThrow()
  })

  it('throws when UPSTASH_REDIS_REST_URL is not a valid URL', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'not-a-url'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token123'

    vi.resetModules()
    await expect(import('./env')).rejects.toThrow()
  })

  it('succeeds with only required vars (OAuth optional)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token123'
    delete process.env.REDDIT_CLIENT_ID
    delete process.env.REDDIT_CLIENT_SECRET
    delete process.env.PRODUCTHUNT_CLIENT_ID
    delete process.env.PRODUCTHUNT_CLIENT_SECRET

    vi.resetModules()
    const { env } = await import('./env')
    expect(env.REDDIT_CLIENT_ID).toBeUndefined()
  })
})
