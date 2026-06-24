import { HTTPException } from 'hono/http-exception'
import type { ErrorHandler } from 'hono'

// Thrown by source clients when an upstream API fails (4xx/5xx/network).
// The global error handler converts this into a 502 so the frontend knows
// the failure is on the source side, not in our route logic.
export class UpstreamError extends Error {
  constructor(
    public source: string,
    message: string,
  ) {
    super(message)
    this.name = 'UpstreamError'
  }
}

export const errorHandler: ErrorHandler = (err, c) => {
  // Expected, thrown errors (validation, 401, 404, etc.)
  if (err instanceof HTTPException) {
    const status = err.status
    const message = err.message
    return c.json({ error: message }, status)
  }

  // Upstream API failures -> 502 Bad Gateway
  if (err instanceof UpstreamError) {
    return c.json({ error: 'upstream_unavailable', source: err.source }, 502)
  }

  // Unexpected -> log full stack, return generic 500 with no internals
  console.error('[unhandled]', err)
  return c.json({ error: 'internal_server_error' }, 500)
}
