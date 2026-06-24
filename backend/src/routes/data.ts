import { Hono } from 'hono'
import configJson from '../../public/data/config.json' with { type: 'json' }

const data = new Hono()

// GET /config.json — returns the static RemoteConfig
data.get('/config.json', (c) => {
  return c.json(configJson)
})

export default data
