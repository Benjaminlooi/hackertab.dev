# Hackertab Backend

A Hono + TypeScript backend that reproduces the data API of `api.hackertab.dev` for the [hackertab.dev](https://github.com/medyo/hackertab.dev) browser extension. Aggregates developer news from 12 sources, cached on Upstash Redis, deployable for free on Vercel Hobby.

## Setup

### Prerequisites

1. **Node.js 20+** — check with `node -v`
2. **Vercel CLI** — `npm i -g vercel` (for local dev and deployment)
3. **Upstash Redis** — create a free database via the [Vercel Marketplace](https://vercel.com/marketplace/upstash) (Hobby tier: 256MB, 10K commands/day)

### Environment variables

Create a `.env.local` file (or set env vars in the Vercel dashboard):

| Variable | Required | Description |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL (from Vercel Marketplace integration) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |
| `REDDIT_CLIENT_ID` | No | Reddit OAuth client ID (register at reddit.com/prefs/apps as "script" type) |
| `REDDIT_CLIENT_SECRET` | No | Reddit OAuth client secret |
| `PRODUCTHUNT_CLIENT_ID` | No | Product Hunt OAuth client ID (register at producthunt.com/v2/oauth/applications) |
| `PRODUCTHUNT_CLIENT_SECRET` | No | Product Hunt OAuth client secret |
| `INDIEHACKERS_ALGOLIA_KEY` | No | Algolia public read key for IndieHackers search |

Required vars must be set — the server fails fast on missing Upstash credentials. Optional OAuth vars degrade gracefully (the source returns `UpstreamError` → 502 with `{ error: 'upstream_unavailable', source: 'reddit' }`).

### Install

```bash
cd backend
npm install
```

### Local dev

```bash
npm run dev  # runs `vercel dev` — matches production runtime, pulls env from Vercel project
```

The backend runs at `http://localhost:3000/`.

### Deploy

```bash
npm run deploy  # runs `vercel --prod`
```

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Health check → `{ ok: true }` |
| GET | `/engine/feeds?source={}&tags={}` | Articles from 9 sources (hackernews, devto, hashnode, lobsters, freecodecamp, medium, hackernoon, reddit, indiehackers) |
| GET | `/engine/repos?range={}&tags={}` | GitHub trending repositories (daily/weekly/monthly) |
| GET | `/engine/conferences?tags={}` | Tech conferences from confs.tech dataset |
| GET | `/engine/products?date={}` | Product Hunt products (YYYY-MM-DD date format) |
| GET | `/engine/v2/feed?tags={}&limit={}&next={}` | Aggregated feed (v1 stub — returns empty pages) |
| GET | `/engine/rss_info/?url={}` | RSS feed metadata (stub) |
| GET | `/engine/remote_feed?feedUrl={}` | Remote RSS proxy (stub) |
| GET | `/engine/ads/adaptive_v2?keywords={}` | Ads (stub — returns `[]`) |
| GET | `/data/config.json` | Remote config (tags list, ads_fetch_delay_ms) |

## Pointing the frontend at this backend

In the hackertab.dev frontend, set `VITE_API_URL` in your `.env` file:

```bash
VITE_API_URL=http://localhost:3000/  # for local dev
# or
VITE_API_URL=https://your-deployed-backend.vercel.app/  # for production
```

## Testing

```bash
cd backend
npm test  # runs vitest — all unit + integration tests
npm run typecheck  # tsc --noEmit
```

## Architecture

- **Framework**: [Hono](https://hono.dev) — lightweight web framework, TypeScript-first, runs on Vercel serverless
- **Runtime**: Vercel Hobby (Node.js 20, Fluid Compute)
- **Cache**: [Upstash Redis](https://upstash.com) — 15-minute TTL on upstream API responses
- **Validation**: `@hono/zod-validator` — Zod schemas for query params
- **Testing**: Vitest + [msw](https://mswjs.io) — TDD with mocked upstream HTTP

```
backend/
├── src/
│   ├── index.ts              # Hono app entry (CORS, error handler, route mounting)
│   ├── routes/
│   │   ├── engine.ts         # /engine/* routes
│   │   └── data.ts           # /data/config.json
│   ├── lib/
│   │   ├── env.ts            # Zod-validated env vars
│   │   ├── upstash.ts        # Redis client
│   │   ├── cache.ts          # cached() helper (15-min TTL)
│   │   └── sources/          # 12 upstream source clients
│   ├── middleware/
│   │   ├── cors.ts
│   │   └── error.ts          # UpstreamError, errorHandler
│   ├── types/index.ts        # TypeScript types matching frontend contract
│   └── test/                 # Vitest + msw harness
├── public/data/config.json   # Static RemoteConfig (tags list)
├── package.json
├── tsconfig.json
└── vercel.json
```
