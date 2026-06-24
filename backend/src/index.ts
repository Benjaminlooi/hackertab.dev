import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import type { Env } from './lib/env'
import engine from './routes/engine'
import data from './routes/data'

const app = new Hono<{ Bindings: Env }>()

// Global middleware (order matters)
app.use('*', logger())
app.use('*', corsMiddleware)

// Health check
app.get('/health', (c) => c.json({ ok: true }))

app.route('/engine', engine)
app.route('/data', data)

// 404 fallback
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404))

// Error handler
app.onError(errorHandler)

export default app
