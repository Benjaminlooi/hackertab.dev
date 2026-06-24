import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'

// Origins allowed to call the API. The web app runs on localhost during dev
// (Vite default 5173, alternative 3000) and hackertab.dev in production. The
// browser extension runs on a stable per-extension origin keyed by the
// extension id (same id for Chrome and Firefox, different protocol prefix).
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://hackertab.dev',
  'chrome-extension://ocoipcahhaedjhnpoanfflhbdcpmalmp',
  'moz-extension://ocoipcahhaedjhnpoanfflhbdcpmalmp',
]

export const corsMiddleware: MiddlewareHandler = cors({
  origin: (origin) => {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      return origin
    }
    // No ACAO header is emitted for same-origin / untrusted origins, which
    // causes the browser to block the response. Credentials are never sent
    // (we don't use cookies — auth headers are passed explicitly per request).
    return null as unknown as string
  },
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
  allowHeaders: ['Accept', 'Content-Type', 'Authorization'],
  maxAge: 600,
})
