import type { Conference } from '../../types'

const BASE_URL = 'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences'

// List of available topics in the confs.tech repo
const TOPICS = ['javascript', 'python', 'ruby', 'go', 'rust', 'java', 'kotlin',
  'swift', 'dotnet', 'php', 'cpp', 'scala', 'elixir', 'clojure', 'haskell',
  'erlang', 'elm', 'data', 'general', 'devops', 'security', 'ai', 'cloud',
  'web', 'mobile', 'iot', 'blockchain', 'gaming', 'tech']

export async function fetchConfsTech(opts?: { tags?: string[] }): Promise<Conference[]> {
  const tag = opts?.tags?.[0] || ''
  const topics = tag ? [tag] : ['general'] // default to 'general' if no tag
  const currentYear = new Date().getFullYear()
  const now = Date.now()

  const conferences: Conference[] = []

  for (const topic of topics) {
    // Try upcoming.json first, then current year
    const filesToFetch = ['upcoming.json', `${currentYear}.json`]
    for (const file of filesToFetch) {
      try {
        const res = await fetch(`${BASE_URL}/${topic}/${file}`)
        if (!res.ok) continue // skip missing files
        const items = await res.json() as any[]
        for (const conf of items) {
          const startDateMs = conf.startDate ? Date.parse(conf.startDate) : 0
          if (startDateMs < now) continue // skip past conferences
          const endDateMs = conf.endDate ? Date.parse(conf.endDate) : 0
          conferences.push({
            id: `${conf.name}@${conf.city || 'online'}@${conf.startDate}`,
            url: conf.url || '',
            title: conf.name || '',
            tags: [topic],
            comments_count: 0, points_count: 0, image_url: '',
            published_at: startDateMs,
            start_date: startDateMs,
            end_date: endDateMs,
            online: conf.online ?? false,
            city: conf.city,
            country: conf.country,
          } as Conference)
        }
      } catch { /* skip failed fetches */ }
    }
  }

  // Sort by start_date ascending
  conferences.sort((a, b) => a.start_date - b.start_date)
  return conferences
}
