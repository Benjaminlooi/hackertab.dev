import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './setup'

describe('test harness', () => {
  it('passes a trivial assertion', () => {
    expect(1).toBe(1)
  })

  it('mocks an HTTP call via msw', async () => {
    server.use(
      http.get('https://example.com/test', () => {
        return HttpResponse.json({ ok: true })
      })
    )
    const res = await fetch('https://example.com/test')
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('fails on unmocked request (msw onUnhandledRequest: error)', async () => {
    // This test intentionally calls an unmocked URL — we expect msw to throw
    await expect(fetch('https://unmocked.example.com/fail')).rejects.toThrow()
  })
})
