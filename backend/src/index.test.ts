import { describe, it, expect } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import app from './index'

describe('Hono app entry', () => {
  it('GET /health returns { ok: true }', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('GET /unknown-route returns 404 JSON', async () => {
    const res = await app.request('/nonexistent-path')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not_found')
    expect(body.path).toBe('/nonexistent-path')
  })

  it('CORS allows localhost:5173 origin', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('CORS rejects unknown origin (no ACAO header)', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('HTTPException returns its status and message as JSON', async () => {
    // We need a test route that throws — create a temp app variant
    const { Hono } = await import('hono')
    const testApp = new Hono()
    testApp.get('/throw-502', () => {
      throw new HTTPException(502, { message: 'upstream failed' })
    })
    testApp.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
      }
      return c.json({ error: 'internal' }, 500)
    })
    const res = await testApp.request('/throw-502')
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('upstream failed')
  })

  it('UpstreamError returns 502 with source field', async () => {
    const { Hono } = await import('hono')
    const { UpstreamError, errorHandler } = await import('./middleware/error')
    const testApp = new Hono()
    testApp.get('/throw-upstream', () => {
      throw new UpstreamError('reddit', '429 rate limited')
    })
    testApp.onError(errorHandler)
    const res = await testApp.request('/throw-upstream')
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ error: 'upstream_unavailable', source: 'reddit' })
  })
})
