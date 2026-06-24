import { describe, it, expect } from 'vitest'
import data from './data'

describe('GET /data/config.json', () => {
  it('returns 200 with tags array', async () => {
    const res = await data.request('/config.json')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('tags')
    expect(Array.isArray(body.tags)).toBe(true)
    expect(body.tags.length).toBeGreaterThanOrEqual(30)
  })

  it('each tag has label, value, category fields', async () => {
    const res = await data.request('/config.json')
    const body = await res.json()
    for (const tag of body.tags) {
      expect(tag).toHaveProperty('label')
      expect(typeof tag.label).toBe('string')
      expect(tag).toHaveProperty('value')
      expect(typeof tag.value).toBe('string')
      expect(tag).toHaveProperty('category')
      expect(typeof tag.category).toBe('string')
    }
  })

  it('includes ads_fetch_delay_ms', async () => {
    const res = await data.request('/config.json')
    const body = await res.json()
    expect(body).toHaveProperty('ads_fetch_delay_ms')
    expect(body.ads_fetch_delay_ms).toBe(1750)
  })

  it('does NOT include paywall field', async () => {
    const res = await data.request('/config.json')
    const body = await res.json()
    expect(body).not.toHaveProperty('paywall')
  })

  it('includes popular languages (javascript, python, rust, go, react)', async () => {
    const res = await data.request('/config.json')
    const body = await res.json()
    const values = body.tags.map((t: any) => t.value)
    expect(values).toContain('javascript')
    expect(values).toContain('python')
    expect(values).toContain('rust')
    expect(values).toContain('go')
    expect(values).toContain('react')
  })
})
