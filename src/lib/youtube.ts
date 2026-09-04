import { youTubeIdFromUrl, type VideoInfo } from './course-schema';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const SERPAPI_URL = 'https://serpapi.com/search';

// Minimal shapes for the YouTube Data API v3 responses we use.
interface YtSearchItem {
  id?: { videoId?: string };
}
interface YtSearchResponse {
  items?: YtSearchItem[];
}
interface YtThumbnail {
  url?: string;
}
interface YtVideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, YtThumbnail | undefined>;
  };
  statistics?: { viewCount?: string; likeCount?: string };
  contentDetails?: { duration?: string };
}
interface YtVideoResponse {
  items?: YtVideoItem[];
}

interface SerpThumbnail {
  static?: string;
  rich?: string;
}
interface SerpVideoResult {
  title?: string;
  link?: string;
  video_id?: string;
  channel?: { name?: string } | string;
  published_date?: string;
  views?: number | string;
  length?: string;
  thumbnail?: SerpThumbnail | string;
}
interface SerpSearchResponse {
  error?: string;
  video_results?: SerpVideoResult[];
}

/*
 * Answers per query, for the lifetime of the server process.
 *
 * Worth having because a video search costs quota, and the same query comes up
 * whenever a course is re-enriched.
 *
 * Only *answers* are cached. A search that failed is not an answer: when
 * SerpAPI returned 429 "account has run out of searches", caching that as "no
 * video for this query" meant the lesson stayed videoless for the rest of the
 * process even after a working key was configured — the fix would have looked
 * like it did nothing. A provider that is down or out of credit is a fact
 * about right now, not about the query.
 */
const cache = new Map<string, VideoInfo | null>();

/** No result, and why: nothing matched, or the search never ran. */
type SearchOutcome = { ok: true; video: VideoInfo | null } | { ok: false };

/** A caller's own keys, preferred over the operator's when present. */
export type ProviderKeys = { youtubeKey?: string | null; serpApiKey?: string | null };

/**
 * Find the single best YouTube video for a query.
 *
 * Strategy: take the top relevance results, score them on relevance + popularity
 * + engagement + a duration sweet spot, and return the highest scorer. YouTube
 * Data API is preferred when configured; SerpAPI is used as a fallback.
 */
export async function findBestVideo(query: string, keys: ProviderKeys = {}): Promise<VideoInfo | null> {
  const q = query.trim();
  if (!q) return null;

  const youtubeKey = keys.youtubeKey || process.env.YOUTUBE_API_KEY;
  const serpApiKey = keys.serpApiKey || process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY;

  /* Keyed by query and by whose key answered it. Two users with different keys
     can get different results, and one user's empty result must not become the
     other's. */
  const cacheKey = `${youtubeKey ? 'y' : ''}${serpApiKey ? `s${serpApiKey.slice(-6)}` : ''}|${q}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  let best: VideoInfo | null = null;
  /* Starts false so that "no provider is configured" is also not cached: a key
     added later must take effect without a restart. */
  let answered = false;

  if (youtubeKey) {
    const outcome = await findViaYouTubeApi(q, youtubeKey);
    if (outcome.ok) {
      answered = true;
      best = outcome.video;
    }
  }

  if (!best && serpApiKey) {
    const outcome = await findViaSerpApi(q, serpApiKey);
    if (outcome.ok) {
      answered = true;
      best = outcome.video;
    }
  }

  if (answered) cache.set(cacheKey, best);
  return best;
}

async function findViaYouTubeApi(q: string, apiKey: string): Promise<SearchOutcome> {
  try {
    const search = new URL(SEARCH_URL);
    search.searchParams.set('part', 'snippet');
    search.searchParams.set('type', 'video');
    search.searchParams.set('q', q);
    search.searchParams.set('maxResults', '8');
    search.searchParams.set('videoEmbeddable', 'true');
    search.searchParams.set('safeSearch', 'strict');
    search.searchParams.set('key', apiKey);

    const searchRes = await fetch(search, { cache: 'no-store' });
    if (!searchRes.ok) {
      console.error('YouTube search failed:', searchRes.status, await safeText(searchRes));
      return { ok: false };
    }

    const searchJson = (await searchRes.json()) as YtSearchResponse;
    const order = (searchJson.items ?? [])
      .map((it) => it.id?.videoId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (order.length === 0) return { ok: true, video: null };

    const videos = new URL(VIDEOS_URL);
    videos.searchParams.set('part', 'snippet,statistics,contentDetails');
    videos.searchParams.set('id', order.join(','));
    videos.searchParams.set('key', apiKey);

    const videosRes = await fetch(videos, { cache: 'no-store' });
    if (!videosRes.ok) {
      console.error('YouTube videos lookup failed:', videosRes.status, await safeText(videosRes));
      return { ok: false };
    }

    const videosJson = (await videosRes.json()) as YtVideoResponse;
    const candidates = (videosJson.items ?? []).map((v) => {
      const durationSeconds = parseIsoDuration(v.contentDetails?.duration ?? 'PT0S');
      const views = toNumber(v.statistics?.viewCount);
      const likes = toNumber(v.statistics?.likeCount);
      const rank = order.indexOf(v.id);
      const thumbnails = v.snippet?.thumbnails ?? {};
      const info: VideoInfo = {
        id: v.id,
        title: v.snippet?.title ?? 'Untitled',
        channel: v.snippet?.channelTitle ?? 'Unknown channel',
        url: `https://www.youtube.com/watch?v=${v.id}`,
        embedUrl: `https://www.youtube.com/embed/${v.id}`,
        thumbnail:
          thumbnails.medium?.url ??
          thumbnails.high?.url ??
          thumbnails.default?.url ??
          `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        durationSeconds,
        views,
        publishedAt: v.snippet?.publishedAt ?? '',
      };
      return { info, score: scoreVideo({ views, likes, durationSeconds, rank }) };
    });

    if (candidates.length === 0) return { ok: true, video: null };

    candidates.sort((a, b) => b.score - a.score);
    return { ok: true, video: candidates[0].info };
  } catch (err) {
    console.error('YouTube lookup error:', err);
    return { ok: false };
  }
}

async function findViaSerpApi(q: string, apiKey: string): Promise<SearchOutcome> {
  try {
    const search = new URL(SERPAPI_URL);
    search.searchParams.set('engine', 'youtube');
    search.searchParams.set('search_query', q);
    search.searchParams.set('gl', 'us');
    search.searchParams.set('api_key', apiKey);

    const res = await fetch(search, { cache: 'no-store' });
    if (!res.ok) {
      console.error('SerpAPI YouTube search failed:', res.status, await safeText(res));
      return { ok: false };
    }

    const json = (await res.json()) as SerpSearchResponse;
    if (json.error) {
      /* Includes "account has run out of searches" — a fact about the key,
         not about the query, and it must not be remembered as one. */
      console.error('SerpAPI YouTube search error:', json.error);
      return { ok: false };
    }

    const candidates = (json.video_results ?? [])
      .slice(0, 8)
      .map((item, rank) => {
        const info = serpResultToVideoInfo(item);
        if (!info) return null;
        return {
          info,
          score: scoreVideo({
            views: info.views,
            likes: 0,
            durationSeconds: info.durationSeconds,
            rank,
          }),
        };
      })
      .filter((item): item is { info: VideoInfo; score: number } => item !== null);

    if (candidates.length === 0) return { ok: true, video: null };

    candidates.sort((a, b) => b.score - a.score);
    return { ok: true, video: candidates[0].info };
  } catch (err) {
    console.error('SerpAPI YouTube lookup error:', err);
    return { ok: false };
  }
}

function serpResultToVideoInfo(item: SerpVideoResult): VideoInfo | null {
  const id = item.video_id || youTubeIdFromUrl(item.link ?? '');
  if (!id) return null;

  return {
    id,
    title: item.title ?? 'Untitled',
    channel: channelName(item.channel),
    url: item.link ?? `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    thumbnail: thumbnailUrl(item.thumbnail, id),
    durationSeconds: parseClockDuration(item.length ?? ''),
    views: parseViewCount(item.views),
    publishedAt: item.published_date ?? '',
  };
}

/** Combine relevance, a focused-length sweet spot, engagement and popularity into one score. */
function scoreVideo(args: { views: number; likes: number; durationSeconds: number; rank: number }): number {
  const { views, likes, durationSeconds, rank } = args;

  // YouTube/SerpAPI already return results by relevance; reward earlier positions.
  const relevance = Math.max(0, 8 - Math.max(rank, 0)) / 8;

  // Popularity, log-compressed. Kept as a light tiebreaker only so a giant
  // multi-hour "full course" video cannot win on views alone.
  const popularity = Math.min(1, Math.log10(views + 1) / 7);

  // Engagement: likes per view, normalized against a healthy ~5% ratio.
  const engagement = views > 0 ? Math.min(1, likes / views / 0.05) : 0;

  // Favor a focused single lesson over multi-hour courses.
  const mins = durationSeconds / 60;
  let duration: number;
  if (mins >= 3 && mins <= 20) duration = 1;
  else if (mins > 20 && mins <= 35) duration = 0.65;
  else if (mins >= 1.5 && mins < 3) duration = 0.6;
  else if (mins > 35 && mins <= 60) duration = 0.3;
  else duration = 0.08;

  return relevance * 0.4 + duration * 0.3 + engagement * 0.2 + popularity * 0.1;
}

function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function channelName(channel: SerpVideoResult['channel']): string {
  if (typeof channel === 'string') return channel;
  return channel?.name ?? 'Unknown channel';
}

function thumbnailUrl(thumbnail: SerpVideoResult['thumbnail'], id: string): string {
  if (!thumbnail) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  if (typeof thumbnail === 'string') return thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return thumbnail?.static ?? thumbnail?.rich ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function parseClockDuration(value: string): number {
  const parts = value
    .trim()
    .split(':')
    .map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseViewCount(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const match = value.toLowerCase().replace(/,/g, '').match(/([\d.]+)\s*([kmb])?/);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  const suffix = match[2];
  const multiplier = suffix === 'b' ? 1_000_000_000 : suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
  return Math.round(amount * multiplier);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
