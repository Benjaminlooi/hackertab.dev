// Data-model type contracts copied from the frontend.
// Source: src/types/index.ts (lines 31-112), src/features/*/types/index.ts
// React/UI-only types (SearchEngineType, SelectedCard, SupportedCardType,
// CardPropsType, BaseItemPropsType, CardSettingsType, Option, DNDDuration) are
// intentionally omitted — they reference React and are not needed in the
// backend data layer.

export type BaseEntry = {
  id: string
  url: string
  title: string
  tags: Array<string>
  comments_count: number
  points_count: number
  image_url: string
  published_at: number
  description?: string
}

export type Article = BaseEntry & {
  source: string
  canonical_url?: string
}

export type Product = BaseEntry & {
  tagline: string
  votes_count: number
  topics: Array<string>
}

export type FeedItem = {
  title: string
  id: string
  url: string
  date: Date
  image: string
  tags: Array<string>
}

export type ArticleFeedItemData = FeedItem & {
  type: 'post'
  source: string
}

export type ProductHuntFeedItemData = FeedItem & {
  type: 'producthunt'
  tagline: string
  votes_count: number
  comments: number
}

export type GithubFeedItemData = FeedItem & {
  type: 'github'
  stars: number
  stars_in_range: number
  forks: number
  programmingLanguage: string
  description?: string
}

export type AdFeedItemData = {
  id: string
  type: 'ad'
}

export type FeedItemData =
  | ArticleFeedItemData
  | GithubFeedItemData
  | ProductHuntFeedItemData
  | AdFeedItemData

export type Repository = BaseEntry & {
  technology: string
  stars_count: number
  source: string
  description: string
  owner: string
  forks_count: number
  stars_in_range: number
  name: string
}

export type Conference = BaseEntry & {
  start_date: number
  end_date: number
  tags: string[]
  online: Boolean
  city?: string
  country?: string
}

// Ad types — copied from src/features/adv/types/index.ts
type CommonAdFields = {
  id: string
  link: string
  sponsored_by?: string
  source?: 'house-ad' | 'external'
}

type AdStyle = {
  bg_color: string
  text_color: string
  cta_bg_color?: string
  cta_text_color?: string
}

type SmallImageAd = CommonAdFields & {
  type: 'small-img'
  title: string
  description: string
  logoUrl?: string
  imageUrl: string
  cta_text: string
  style: AdStyle
}

type LargeImageAd = CommonAdFields & {
  type: 'large-img'
  title: string
  description: string
  link: string
  imageUrl: string
}

export type StickyAd = CommonAdFields & {
  type: 'sticky-ad'
  title: string
  imageUrl: string
  condition?: string
  cta_text: string
  style: AdStyle
  dismissible?: boolean
}

export type Ad = SmallImageAd | LargeImageAd | StickyAd

// RemoteConfig types — copied from src/features/remoteConfig/types/index.ts
export type Tag = {
  label: string
  value: string
  category?: string
}

export type RemoteConfig = {
  tags: Tag[]
  ads_fetch_delay_ms?: number
  paywall?: {
    id: string
    enabled: boolean
    header_cta: string
    cta_url: string
    cta: string
    lead_description: string
    caption: string
    header_image: string
    features: string[]
  }
}

// Hits — src/features/hits/types/index.ts
export type Streak = {
  streak: number
}

// Changelog — src/features/changelog/types/index.ts
export type Version = {
  name: string
  published_at: string
  body: string
  html_url: string
}

// Auth — src/features/auth/types/index.ts
export type User = {
  id: string
  name: string
  connectedAt?: string
  imageURL?: string
  streak?: number
  isSupporter?: boolean
}

// Bookmarks — src/features/bookmarks/types/index.ts
export type BookmarkedPost = {
  title: string
  source: string
  url: string
  sourceType: 'rss' | 'supported'
}
