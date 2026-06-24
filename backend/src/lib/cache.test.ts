import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Redis module
vi.mock('../lib/upstash', () => {
  const mockGet = vi.fn()
  const mockSet = vi.fn()
  return {
    redis: {
      get: mockGet,
      set: mockSet,
    },
  }
})

import { redis } from './upstash'
import { cached } from './cache'

describe('cached() helper', () => {
  const fetcher = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached value on hit and does NOT call fetcher', async () => {
    ;(redis.get as any).mockResolvedValueOnce({ cached: true })
    fetcher.mockResolvedValue({ fresh: true })

    const result = await cached('test-key', fetcher)

    expect(result).toEqual({ cached: true })
    expect(redis.get).toHaveBeenCalledWith('test-key')
    expect(fetcher).not.toHaveBeenCalled()
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('calls fetcher on cache miss and writes to cache', async () => {
    ;(redis.get as any).mockResolvedValueOnce(null)
    fetcher.mockResolvedValueOnce({ fresh: true })
    ;(redis.set as any).mockResolvedValueOnce('OK')

    const result = await cached('test-key', fetcher)

    expect(result).toEqual({ fresh: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(redis.set).toHaveBeenCalledWith('test-key', { fresh: true }, { ex: 900 })
  })

  it('does NOT cache null results', async () => {
    ;(redis.get as any).mockResolvedValueOnce(null)
    fetcher.mockResolvedValueOnce(null)

    const result = await cached('test-key', fetcher)

    expect(result).toBeNull()
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('falls through to fetcher on Redis read failure (never throws)', async () => {
    ;(redis.get as any).mockRejectedValueOnce(new Error('Redis connection refused'))
    fetcher.mockResolvedValueOnce({ fresh: true })
    ;(redis.set as any).mockResolvedValueOnce('OK')

    const result = await cached('test-key', fetcher)

    expect(result).toEqual({ fresh: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('falls through gracefully on Redis write failure', async () => {
    ;(redis.get as any).mockResolvedValueOnce(null)
    fetcher.mockResolvedValueOnce({ fresh: true })
    ;(redis.set as any).mockRejectedValueOnce(new Error('Redis write failed'))

    const result = await cached('test-key', fetcher)

    expect(result).toEqual({ fresh: true })
  })

  it('uses custom TTL when provided', async () => {
    ;(redis.get as any).mockResolvedValueOnce(null)
    fetcher.mockResolvedValueOnce({ fresh: true })
    ;(redis.set as any).mockResolvedValueOnce('OK')

    await cached('test-key', fetcher, 3600)

    expect(redis.set).toHaveBeenCalledWith('test-key', { fresh: true }, { ex: 3600 })
  })

  it('fetcher called once, cache hit on second call (verifies counter)', async () => {
    ;(redis.get as any).mockResolvedValueOnce(null).mockResolvedValueOnce({ fresh: true })
    fetcher.mockResolvedValueOnce({ fresh: true })
    ;(redis.set as any).mockResolvedValueOnce('OK')

    // First call: miss → fetcher called
    await cached('counter-key', fetcher)
    // Second call: hit → fetcher NOT called
    await cached('counter-key', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
