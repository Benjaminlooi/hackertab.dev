import { redis } from './upstash'

const DEFAULT_TTL = 900 // 15 minutes in seconds

/**
 * Cache-aside helper. On cache hit, returns cached value.
 * On cache miss, calls fetcher, stores result, returns it.
 * On Redis failure, falls through to fetcher (never throws on cache error).
 * Does NOT cache null/undefined results (they're treated as misses).
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  // Try cache read — graceful on failure
  try {
    const hit = await redis.get<T>(key)
    if (hit !== null && hit !== undefined) {
      return hit
    }
  } catch (err) {
    // Redis down — log and fall through to fetcher
    console.warn(`[cache] read failed for key "${key}":`, err)
  }

  // Cache miss — fetch fresh data
  const fresh = await fetcher()

  // Don't cache null/undefined
  if (fresh === null || fresh === undefined) {
    return fresh
  }

  // Write to cache — graceful on failure
  try {
    await redis.set(key, fresh, { ex: ttl })
  } catch (err) {
    console.warn(`[cache] write failed for key "${key}":`, err)
  }

  return fresh
}
