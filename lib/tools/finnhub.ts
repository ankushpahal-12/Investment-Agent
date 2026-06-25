// ─── Finnhub API Integration ──────────────────────────────────────────────────
// Uses the official 'finnhub' npm package (already in package.json)
// Provides: company profile, stock quote, financial metrics, news
import { callWithRetry } from '../utils/rateLimiter'

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const finnhub = require('finnhub') as {
    DefaultApi: new (apiKey: string) => {
        symbolSearch(q: string, opts: object, cb: (e: unknown, d: any, r: unknown) => void): void
        companyProfile2(opts: { symbol: string }, cb: (e: unknown, d: any, r: unknown) => void): void
        quote(symbol: string, cb: (e: unknown, d: any, r: unknown) => void): void
        companyBasicFinancials(symbol: string, metric: string, cb: (e: unknown, d: any, r: unknown) => void): void
        companyNews(symbol: string, from: string, to: string, cb: (e: unknown, d: any, r: unknown) => void): void
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const API_KEY = process.env.FINNHUB_API_KEY ?? process.env.FINHUB_API_KEY ?? ''

if (!API_KEY) {
    console.warn('⚠️  FINNHUB_API_KEY or FINHUB_API_KEY is missing from environment variables.')
}

// ─── Singleton client ─────────────────────────────────────────────────────────

function getClient() {
    return new finnhub.DefaultApi(API_KEY)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinnhubProfile {
    ticker: string
    name: string
    exchange: string
    industry: string
    sector: string
    country: string
    currency: string
    marketCapitalization: number   // in millions USD
    shareOutstanding: number
    logo: string
    weburl: string
    ipo: string
    finnhubIndustry: string
}

export interface FinnhubQuote {
    c: number   // current price
    d: number   // change
    dp: number  // percent change
    h: number   // high of day
    l: number   // low of day
    o: number   // open
    pc: number  // previous close
    t: number   // timestamp
}

export interface FinnhubMetrics {
    '52WeekHigh': number
    '52WeekLow': number
    'peBasicExclExtraTTM': number
    'epsTTM': number
    'revenueTTM': number
    'revenueGrowthTTMYoy': number
    'grossMarginTTM': number
    'netProfitMarginTTM': number
    'totalDebt': number
    'totalDebtToEquity': number
    'beta': number
    'dividendYieldIndicatedAnnual': number
    'marketCapitalization': number
    [key: string]: number | string | undefined
}

export interface FinnhubNewsItem {
    category: string
    datetime: number
    headline: string
    id: number
    image: string
    related: string
    source: string
    summary: string
    url: string
}

// ─── Helper: promisify Finnhub callbacks ─────────────────────────────────────

function call<T>(fn: (cb: (err: unknown, data: T, res: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
        fn((err, data) => {
            if (err) reject(err)
            else resolve(data)
        })
    })
}

// ─── Helper to clean ticker suffixes ─────────────────────────────────────────
export function cleanTicker(ticker: string): string {
    return ticker.includes('.') ? ticker.split('.')[0] : ticker
}

// ─── Ticker Resolver ─────────────────────────────────────────────────────────
// Searches Finnhub for a ticker symbol given a company name

export async function resolveTicker(companyName: string): Promise<string> {
    try {
        const client = getClient()
        const data = await callWithRetry(() => call<{ result: Array<{ symbol: string; description: string; type: string }> }>(
            (cb) => client.symbolSearch(companyName, {}, cb)
        ), { maxRetries: 2, baseDelayMs: 500 })
        const results = data?.result ?? []

        // Prefer common equity results
        const equity = results.find(r => r.type === 'Common Stock') ?? results[0]
        if (equity?.symbol) {
            const resolvedSymbol = cleanTicker(equity.symbol)
            console.log(`Finnhub resolved "${companyName}" → ${resolvedSymbol} (original: ${equity.symbol})`)
            return resolvedSymbol
        }

        // Fallback: best-guess from name
        return companyName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
    } catch (err) {
        console.warn(`Ticker resolution failed for "${companyName}":`, err)
        return companyName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
    }
}

// ─── Company Profile ──────────────────────────────────────────────────────────

export async function getCompanyProfile(ticker: string): Promise<FinnhubProfile | null> {
    const cleanSymbol = cleanTicker(ticker)
    try {
        const client = getClient()
        const data = await callWithRetry(() => call<FinnhubProfile>((cb) => client.companyProfile2({ symbol: cleanSymbol }, cb)), { maxRetries: 2, baseDelayMs: 500 })
        if (!data?.ticker && !data?.name) return null
        return data
    } catch (err) {
        console.warn(`Company profile failed for ${cleanSymbol}:`, err)
        return null
    }
}

// ─── Stock Quote ──────────────────────────────────────────────────────────────

export async function getStockQuote(ticker: string): Promise<FinnhubQuote | null> {
    const cleanSymbol = cleanTicker(ticker)
    try {
        const client = getClient()
        const data = await callWithRetry(() => call<FinnhubQuote>((cb) => client.quote(cleanSymbol, cb)), { maxRetries: 2, baseDelayMs: 500 })
        if (!data || data.c === 0) return null
        return data
    } catch (err) {
        console.warn(`Stock quote failed for ${cleanSymbol}:`, err)
        return null
    }
}

// ─── Basic Financial Metrics ──────────────────────────────────────────────────

export async function getBasicFinancials(ticker: string): Promise<{ metric: FinnhubMetrics } | null> {
    const cleanSymbol = cleanTicker(ticker)
    try {
        const client = getClient()
        const data = await callWithRetry(() => call<{ metric: FinnhubMetrics }>(
            (cb) => client.companyBasicFinancials(cleanSymbol, 'all', cb)
        ), { maxRetries: 2, baseDelayMs: 500 })
        return data
    } catch (err) {
        console.warn(`Basic financials failed for ${cleanSymbol}:`, err)
        return null
    }
}

// ─── Company News ─────────────────────────────────────────────────────────────

export async function getCompanyNews(ticker: string, days = 7): Promise<FinnhubNewsItem[]> {
    const cleanSymbol = cleanTicker(ticker)
    try {
        const client = getClient()
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - days)

        const fromStr = from.toISOString().split('T')[0]
        const toStr = to.toISOString().split('T')[0]

        const data = await callWithRetry(() => call<FinnhubNewsItem[]>(
            (cb) => client.companyNews(cleanSymbol, fromStr, toStr, cb)
        ), { maxRetries: 2, baseDelayMs: 500 })
        return Array.isArray(data) ? data.slice(0, 10) : []
    } catch (err) {
        console.warn(`Company news failed for ${cleanSymbol}:`, err)
        return []
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatMarketCap(capInMillions: number, currency = 'USD'): string {
    if (!capInMillions || capInMillions === 0) return 'N/A'
    const symbol = currency === 'INR' ? '₹' : '$'
    if (capInMillions >= 1_000_000) return `${symbol}${(capInMillions / 1_000_000).toFixed(2)}T`
    if (capInMillions >= 1_000) return `${symbol}${(capInMillions / 1_000).toFixed(2)}B`
    return `${symbol}${capInMillions.toFixed(0)}M`
}

export function classifyMarketCap(capInMillionsUSD: number): string {
    if (capInMillionsUSD >= 1_000_000) return 'Mega cap · Top 10 globally (>$1T)'
    if (capInMillionsUSD >= 200_000) return 'Large cap · Top 100 globally (>$200B)'
    if (capInMillionsUSD >= 50_000) return 'Large cap · Top 500 globally (>$50B)'
    if (capInMillionsUSD >= 10_000) return 'Mid cap · Notable globally (>$10B)'
    if (capInMillionsUSD >= 2_000) return 'Mid cap · Regional player (>$2B)'
    if (capInMillionsUSD >= 300) return 'Small cap (>$300M)'
    return 'Micro cap (<$300M)'
}
