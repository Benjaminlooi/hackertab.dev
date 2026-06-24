import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { fetchConfsTech } from './confsTech'

const BASE_URL = 'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences'

describe('fetchConfsTech()', () => {
  // Use next year for "upcoming" dates so they stay in the future relative to
  // the wall clock; the implementation filters out any conf whose startDate
  // is before `Date.now()`.
  const currentYear = new Date().getFullYear()
  const pastDate = `${currentYear - 1}-06-01`
  const earlyFutureDate = `${currentYear + 1}-03-15`
  const lateFutureDate = `${currentYear + 1}-09-20`

  it('fetches python upcoming.json, filters past conferences, sorts ascending by start_date', async () => {
    server.use(
      http.get(`${BASE_URL}/python/upcoming.json`, () => {
        return HttpResponse.json([
          {
            name: 'Past PyConf',
            url: 'https://past.example.com',
            startDate: pastDate,
            endDate: pastDate,
            online: false,
            city: 'Berlin',
            country: 'Germany',
          },
          {
            name: 'Late PyConf',
            url: 'https://late.example.com',
            startDate: lateFutureDate,
            endDate: lateFutureDate,
            online: true,
            city: 'Tokyo',
            country: 'Japan',
          },
          {
            name: 'Early PyConf',
            url: 'https://early.example.com',
            startDate: earlyFutureDate,
            endDate: earlyFutureDate,
            online: false,
            city: 'Paris',
            country: 'France',
          },
        ])
      }),
      // The current-year file may not exist for a given topic; implementation
      // treats 404 as "skip".
      http.get(`${BASE_URL}/python/${currentYear}.json`, () => {
        return new HttpResponse(null, { status: 404 })
      }),
    )

    const confs = await fetchConfsTech({ tags: ['python'] })

    // 1 past filtered out, 2 upcoming remain
    expect(confs).toHaveLength(2)
    expect(confs.find((c) => c.title === 'Past PyConf')).toBeUndefined()

    // Sorted ascending by start_date: March (Early) before September (Late)
    expect(confs[0]!.title).toBe('Early PyConf')
    expect(confs[1]!.title).toBe('Late PyConf')
    expect(confs[0]!.start_date).toBeLessThan(confs[1]!.start_date)
  })

  it('returns an empty array when the topic files are missing (404)', async () => {
    server.use(
      http.get(`${BASE_URL}/general/upcoming.json`, () => {
        return new HttpResponse(null, { status: 404 })
      }),
      http.get(`${BASE_URL}/general/${currentYear}.json`, () => {
        return new HttpResponse(null, { status: 404 })
      }),
    )

    // No tag -> default topic is 'general'
    const confs = await fetchConfsTech()
    expect(confs).toEqual([])
  })

  it('transforms confs.tech fields to the Conference shape', async () => {
    const startMs = Date.parse(earlyFutureDate)
    const endMs = Date.parse(earlyFutureDate)
    server.use(
      http.get(`${BASE_URL}/python/upcoming.json`, () => {
        return HttpResponse.json([
          {
            name: 'TransformConf',
            url: 'https://transform.example.com',
            startDate: earlyFutureDate,
            endDate: earlyFutureDate,
            online: false,
            city: 'Lisbon',
            country: 'Portugal',
          },
        ])
      }),
      http.get(`${BASE_URL}/python/${currentYear}.json`, () => {
        return new HttpResponse(null, { status: 404 })
      }),
    )

    const confs = await fetchConfsTech({ tags: ['python'] })
    expect(confs).toHaveLength(1)

    const c = confs[0]!
    expect(c.title).toBe('TransformConf')
    expect(c.url).toBe('https://transform.example.com')
    expect(c.start_date).toBe(startMs)
    expect(c.end_date).toBe(endMs)
    expect(c.online).toBe(false)
    expect(c.city).toBe('Lisbon')
    expect(c.country).toBe('Portugal')
    expect(c.tags).toEqual(['python'])
  })
})
