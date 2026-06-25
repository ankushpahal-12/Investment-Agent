// ─── NewsAPI Integration ──────────────────────────────────────────────────────
// Uses https://newsapi.org/v2/ directly (fetch-based, no SDK needed)
// NEWS_API_KEY is already in .env

const NEWS_API_BASE = 'https://newsapi.org/v2'
import { fetchWithRetry } from '../utils/rateLimiter'

if (!process.env.NEWS_API_KEY) {
    console.warn('⚠️  NEWS_API_KEY is missing from environment variables.')
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsArticle {
    title: string
    description: string | null
    content: string | null
    url: string
    publishedAt: string
    source: { name: string }
    author: string | null
}

export interface NewsAPIResponse {
    articles: NewsArticle[]
    totalResults: number
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function fetchNewsAPI(
    endpoint: string,
    params: Record<string, string>
): Promise<NewsAPIResponse> {
    const key = process.env.NEWS_API_KEY
    if (!key) throw new Error('NEWS_API_KEY is missing')

    const url = new URL(`${NEWS_API_BASE}/${endpoint}`)
    url.searchParams.set('apiKey', key)
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
    }

    const res = await fetchWithRetry(url.toString(), {
        headers: { 'User-Agent': 'InvestmentAgent/1.0' },
        next: { revalidate: 1800 },
    } as RequestInit, { maxRetries: 2, baseDelayMs: 1000 })

    if (!res.ok) {
        if (res.status === 429) throw new Error('NewsAPI rate limit hit. Try again later.')
        if (res.status === 401) throw new Error('NewsAPI key is invalid.')
        throw new Error(`NewsAPI returned ${res.status}`)
    }

    const data = await res.json()

    if (data.status === 'error') {
        throw new Error(`NewsAPI error: ${data.message}`)
    }

    return {
        articles: (data.articles ?? []).filter(
            (a: NewsArticle) => a.title && !a.title.includes('[Removed]')
        ),
        totalResults: data.totalResults ?? 0,
    }
}

// ─── Named exports (used by News Agent) ──────────────────────────────────────

/**
 * Fetch latest news for a company
 */
export async function fetchCompanyNews(
    companyName: string,
    maxArticles = 10
): Promise<NewsAPIResponse> {
    try {
        const result = await fetchNewsAPI('everything', {
            q: `"${companyName}" stock investment`,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: String(maxArticles),
            from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        })
        return result
    } catch (err) {
        console.warn(`NewsAPI fetch failed for "${companyName}":`, err)
        return { articles: [], totalResults: 0 }
    }
}

/**
 * Fetch top business headlines (general market news)
 */
export async function fetchBusinessHeadlines(): Promise<NewsAPIResponse> {
    try {
        return await fetchNewsAPI('top-headlines', {
            category: 'business',
            language: 'en',
            pageSize: '5',
        })
    } catch (err) {
        console.warn('Business headlines fetch failed:', err)
        return { articles: [], totalResults: 0 }
    }
}

// ─── Sentiment Scoring (rule-based, no LLM) ───────────────────────────────────

const POSITIVE_WORDS = [
    'growth', 'profit', 'beat', 'record', 'surge', 'rise', 'gain', 'strong',
    'revenue', 'earnings', 'dividend', 'upgrade', 'buy', 'outperform', 'rally',
    'bullish', 'success', 'expand', 'launch', 'win', 'acquisition', 'partnership',
    'milestone', 'breakthrough', 'innovation', 'positive', 'recovery', 'exceeds',
]

const NEGATIVE_WORDS = [
    'loss', 'decline', 'drop', 'fall', 'miss', 'cut', 'layoff', 'downgrade',
    'sell', 'underperform', 'lawsuit', 'fraud', 'scandal', 'investigation',
    'recall', 'warning', 'risk', 'concern', 'debt', 'deficit', 'crisis',
    'crash', 'bankruptcy', 'fine', 'penalty', 'disappointing', 'miss',
]

export function scoreArticleSentiment(article: NewsArticle): number {
    const text = [article.title, article.description, article.content]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

    let score = 0
    for (const word of POSITIVE_WORDS) {
        const matches = (text.match(new RegExp(`\\b${word}`, 'g')) ?? []).length
        score += matches * 10
    }
    for (const word of NEGATIVE_WORDS) {
        const matches = (text.match(new RegExp(`\\b${word}`, 'g')) ?? []).length
        score -= matches * 10
    }

    // Clamp to -100 / +100
    return Math.max(-100, Math.min(100, score))
}

export function computeOverallSentiment(articles: NewsArticle[]): {
    sentiment: 'positive' | 'negative' | 'mixed'
    sentimentScore: number
    bullishPoints: string[]
    bearishPoints: string[]
} {
    if (articles.length === 0) {
        return { sentiment: 'mixed', sentimentScore: 0, bullishPoints: [], bearishPoints: [] }
    }

    const scored = articles.map(a => ({ article: a, score: scoreArticleSentiment(a) }))
    const avg = Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length)

    const bullishPoints = scored
        .filter(a => a.score > 20)
        .slice(0, 4)
        .map(a => a.article.title)

    const bearishPoints = scored
        .filter(a => a.score < -20)
        .slice(0, 4)
        .map(a => a.article.title)

    const sentiment = avg > 15 ? 'positive' : avg < -15 ? 'negative' : 'mixed'

    return { sentiment, sentimentScore: avg, bullishPoints, bearishPoints }
}
