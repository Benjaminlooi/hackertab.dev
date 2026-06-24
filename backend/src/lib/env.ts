import { z } from 'zod'

const EnvSchema = z.object({
  // Required — cache layer
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Optional — Reddit OAuth (endpoint degrades to UpstreamError if missing)
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),

  // Optional — Product Hunt OAuth
  PRODUCTHUNT_CLIENT_ID: z.string().optional(),
  PRODUCTHUNT_CLIENT_SECRET: z.string().optional(),

  // Optional — IndieHackers Algolia search (public read-only API key;
  // endpoint degrades to UpstreamError if missing)
  INDIEHACKERS_ALGOLIA_KEY: z.string().optional(),

  // Optional — runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)
