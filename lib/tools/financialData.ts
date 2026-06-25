// ─── Legacy financial data module ────────────────────────────────────────────
// This file is retained for compatibility but is no longer the primary
// financial data source. Finnhub is now used instead (see lib/tools/finnhub.ts)
// The smartDetectCompany / getFinancialMetrics functions are still exported
// for backward compatibility.

const BASE_URL = 'https://www.alphavantage.co/query'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FinancialMetrics {
    ticker: string
    exchange: 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE' | 'OTHER'
    marketCap: string
    peRatio: number
    eps: number
    revenue: string
    profitMargin: number
    debtToEquity: number
    yoyGrowth: number
    high52Week: string
    low52Week: string
    currency: 'INR' | 'USD'
    dataSource: 'alphavantage' | 'tavily_fallback'
}
export interface GlobalMarketData {
    currentPrice: string
    currency: 'INR' | 'USD'
    exchange: string
    marketCap: string
    marketCapRank: string        // e.g. "Top 10 in India" or "Top 50 globally"
    sharePrice52High: string
    sharePrice52Low: string
    priceChangeToday: string        // e.g. "+1.2%"
    priceChangePct: number
    volume: string        // today's trading volume
    avgVolume: string        // average volume
    beta: number        // volatility vs market
    dividendYield: string
    outstandingShares: string
    floatShares: string        // publicly tradeable shares
    globalRank: string        // how big vs world
    sectorRank: string        // rank within its sector
}

export interface FinancialMetrics {
    ticker: string
    exchange: 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE' | 'OTHER'
    marketCap: string
    peRatio: number
    eps: number
    revenue: string
    profitMargin: number
    debtToEquity: number
    yoyGrowth: number
    high52Week: string
    low52Week: string
    currency: 'INR' | 'USD'
    dataSource: 'alphavantage' | 'tavily_fallback'
    globalMarket: GlobalMarketData    // ← new
}
// ─── Indian company detector ──────────────────────────────────────────────────

const INDIAN_COMPANIES: Record<string, { ticker: string; exchange: 'NSE' | 'BSE' }> = {
    'reliance': { ticker: 'RELIANCE', exchange: 'NSE' },
    'reliance industries': { ticker: 'RELIANCE', exchange: 'NSE' },
    'tcs': { ticker: 'TCS', exchange: 'NSE' },
    'tata consultancy': { ticker: 'TCS', exchange: 'NSE' },
    'infosys': { ticker: 'INFY', exchange: 'NSE' },
    'wipro': { ticker: 'WIPRO', exchange: 'NSE' },
    'hdfc bank': { ticker: 'HDFCBANK', exchange: 'NSE' },
    'hdfc': { ticker: 'HDFCBANK', exchange: 'NSE' },
    'icici bank': { ticker: 'ICICIBANK', exchange: 'NSE' },
    'icici': { ticker: 'ICICIBANK', exchange: 'NSE' },
    'sbi': { ticker: 'SBIN', exchange: 'NSE' },
    'state bank': { ticker: 'SBIN', exchange: 'NSE' },
    'bajaj finance': { ticker: 'BAJFINANCE', exchange: 'NSE' },
    'adani': { ticker: 'ADANIENT', exchange: 'NSE' },
    'adani enterprises': { ticker: 'ADANIENT', exchange: 'NSE' },
    'asian paints': { ticker: 'ASIANPAINT', exchange: 'NSE' },
    'hul': { ticker: 'HINDUNILVR', exchange: 'NSE' },
    'hindustan unilever': { ticker: 'HINDUNILVR', exchange: 'NSE' },
    'itc': { ticker: 'ITC', exchange: 'NSE' },
    'maruti': { ticker: 'MARUTI', exchange: 'NSE' },
    'maruti suzuki': { ticker: 'MARUTI', exchange: 'NSE' },
    'ola': { ticker: 'OLA', exchange: 'NSE' },
    'zomato': { ticker: 'ZOMATO', exchange: 'NSE' },
    'paytm': { ticker: 'PAYTM', exchange: 'NSE' },
    'nykaa': { ticker: 'NYKAA', exchange: 'NSE' },
    'tata motors': { ticker: 'TATAMOTORS', exchange: 'NSE' },
    'tata steel': { ticker: 'TATASTEEL', exchange: 'NSE' },
    'tata': { ticker: 'TCS', exchange: 'NSE' },
    'airtel': { ticker: 'BHARTIARTL', exchange: 'NSE' },
    'bharti airtel': { ticker: 'BHARTIARTL', exchange: 'NSE' },
    'kotak': { ticker: 'KOTAKBANK', exchange: 'NSE' },
    'kotak mahindra': { ticker: 'KOTAKBANK', exchange: 'NSE' },
    'axis bank': { ticker: 'AXISBANK', exchange: 'NSE' },
    'sun pharma': { ticker: 'SUNPHARMA', exchange: 'NSE' },
    'dr reddy': { ticker: 'DRREDDY', exchange: 'NSE' },
    'cipla': { ticker: 'CIPLA', exchange: 'NSE' },
    'ongc': { ticker: 'ONGC', exchange: 'NSE' },
    'ntpc': { ticker: 'NTPC', exchange: 'NSE' },
    'power grid': { ticker: 'POWERGRID', exchange: 'NSE' },
    'nestle india': { ticker: 'NESTLEIND', exchange: 'NSE' },
    'ultratech': { ticker: 'ULTRACEMCO', exchange: 'NSE' },
    'larsen': { ticker: 'LT', exchange: 'NSE' },
    'l&t': { ticker: 'LT', exchange: 'NSE' },
    'dmart': { ticker: 'DMART', exchange: 'NSE' },
    'avenue supermarts': { ticker: 'DMART', exchange: 'NSE' },
    'zydus': { ticker: 'ZYDUSLIFE', exchange: 'NSE' },
    'zydus lifesciences': { ticker: 'ZYDUSLIFE', exchange: 'NSE' },
    'trent': { ticker: 'TRENT', exchange: 'NSE' },
    'pidilite': { ticker: 'PIDILITIND', exchange: 'NSE' },
    'dabur': { ticker: 'DABUR', exchange: 'NSE' },
    'godrej': { ticker: 'GODREJCP', exchange: 'NSE' },
    'havells': { ticker: 'HAVELLS', exchange: 'NSE' },
    'berger paints': { ticker: 'BERGEPAINT', exchange: 'NSE' },
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function detectIndianCompanyWithAI(companyName: string): Promise<{
    isIndian: boolean
    ticker: string
    exchange: 'NSE' | 'BSE' | null
    confidence: 'high' | 'medium' | 'low'
}> {
    try {
        // Note: financialData.ts no longer calls LLM directly.
        // Indian company detection now relies on the INDIAN_COMPANIES map only.
        // Finnhub is used for all financial data.
        console.warn(`AI Indian detection skipped — no LLM in this module`)
        return { isIndian: false, ticker: '', exchange: null, confidence: 'low' }
    }
    catch (error) {
        console.warn('AI detection failed:', error)
        return { isIndian: false, ticker: '', exchange: null, confidence: 'low' }
    }
}
export async function smartDetectCompany(companyName: string): Promise<{
    isIndian: boolean
    ticker: string
    exchange: 'NSE' | 'BSE' | null
}> {
    const key = companyName.toLowerCase().trim()
    if (INDIAN_COMPANIES[key]) {
        console.log(`Layer 1 hit: "${companyName}" found in map`)
        return {
            isIndian: true,
            ticker: INDIAN_COMPANIES[key].ticker,
            exchange: INDIAN_COMPANIES[key].exchange,
        }
    }
    for (const [name, data] of Object.entries(INDIAN_COMPANIES)) {
        if (key.includes(name) || name.includes(key)) {
            console.log(`Layer 1 partial hit: "${companyName}" → "${name}"`)
            return { isIndian: true, ticker: data.ticker, exchange: data.exchange }
        }
    }

    console.log(`Layer 2 hit: "${companyName}" → calling AI assistant`)

    const aiResult = await detectIndianCompanyWithAI(companyName)
    if (aiResult.isIndian && aiResult.confidence !== 'low') {
        if (aiResult.ticker) {
            console.log(`Layer 2 hit: AI identified "${companyName}" → ${aiResult.ticker}`)
            return {
                isIndian: true,
                ticker: aiResult.ticker,
                exchange: aiResult.exchange,
            }
        }
        console.log(`Layer 2 Layer 2: AI says Indian but no ticker — searching NSE`)
        const nseTickerResult = await searchNSETicker(companyName)
        if (nseTickerResult) {
            return { isIndian: true, ticker: nseTickerResult, exchange: 'NSE' }
        }
    }
    console.log(`Layer 3: "${companyName}" → No match found`)
    return { isIndian: false, ticker: '', exchange: null }
}
// ─── Fetch Indian financial data via NSE India API ────────────────────────────
async function searchNSETicker(companyName: string): Promise<string> {
    try {
        const response = await fetch(
            `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(companyName)}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'Referer': 'https://www.nseindia.com',
                },
            }
        )
        if (!response.ok) throw new Error(`NSE search returned ${response.status}`)
        const data = await response.json()
        const symbols = data?.symbols ?? []
        if (symbols.length === 0) {
            console.warn(`NSE seach found no ticker for "${companyName}"`)
            return ''
        }
        const ticker = symbols[0]?.symbol ?? ''
        console.log(`NSE found ticker for "${companyName}": ${ticker}`)
        return ticker
    }
    catch (error) {
        console.warn(`NSE seach failed for ${companyName}`, error);
        return ''
    }
}

async function fetchIndianFinancials(
    ticker: string,
    companyName: string
): Promise<FinancialMetrics> {
    try {
        // NSE India public API — no key needed
        const response = await fetch(
            `https://www.nseindia.com/api/quote-equity?symbol=${ticker}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'Referer': 'https://www.nseindia.com',
                },
                next: { revalidate: 3600 }
            }
        )

        if (!response.ok) {
            throw new Error(`NSE API returned ${response.status}`)
        }

        const data = await response.json()
        const priceInfo = (data?.priceInfo ?? {}) as Record<string, unknown>
        const meta = (data?.metadata ?? {}) as Record<string, unknown>
        return {
            ticker,
            exchange: 'NSE',
            currency: 'INR',
            marketCap: meta.pdSectorPe ? `₹${meta.pdSectorPe}` : 'N/A',
            peRatio: parseFloat(String(priceInfo['pdSymbolPe']) ?? '0') || 0,
            eps: parseFloat(String(priceInfo['eps']) ?? '0') || 0,
            revenue: 'N/A',   // NSE doesn't expose revenue directly
            profitMargin: 0,
            debtToEquity: 0,
            yoyGrowth: 0,
            high52Week: String((priceInfo['weekHighLow'] as Record<string, unknown>)?.['max'] ?? 'N/A'),
            low52Week: String((priceInfo['weekHighLow'] as Record<string, unknown>)?.['min'] ?? 'N/A'),
            dataSource: 'alphavantage',
            globalMarket: buildIndianGlobalMarket(data, ticker),
        }

    } catch (error) {
        console.warn(` NSE API failed for ${ticker}. Falling back to Tavily.`, error)
        return fetchIndianFinancialsFallback(companyName, ticker)
    }
}

// ─── Tavily fallback for Indian stocks ───────────────────────────────────────
function emptyGlobalMarket(currency: 'INR' | 'USD'): GlobalMarketData {
    return {
        currentPrice: 'N/A',
        currency,
        exchange: 'N/A',
        marketCap: 'N/A',
        marketCapRank: 'N/A',
        sharePrice52High: 'N/A',
        sharePrice52Low: 'N/A',
        priceChangeToday: 'N/A',
        priceChangePct: 0,
        volume: 'N/A',
        avgVolume: 'N/A',
        beta: 0,
        dividendYield: 'N/A',
        outstandingShares: 'N/A',
        floatShares: 'N/A',
        globalRank: 'N/A',
        sectorRank: 'N/A',
    }
}
async function fetchIndianFinancialsFallback(
    companyName: string,
    ticker: string
): Promise<FinancialMetrics> {
    console.log(`Using regex fallback for Indian company: ${companyName} (Tavily removed)`)

    try {
        // Tavily has been removed — return sensible defaults
        const allText = ''

        let marketCap = 'N/A'
        let peRatio = 0
        let eps = 0
        const revenue = 'See research report'
        let currentPrice = 'N/A'
        const priceChange = 'N/A'
        const priceChangePct = 0
        let high52Week = 'N/A'
        let low52Week = 'N/A'

        // No LLM calls in this module — use regex only
        try {
            const peMatch = allText.match(/P\/E\s*(?:ratio)?\s*(?:of|:)?\s*([\d.]+)/i)
            const epsMatch = allText.match(/EPS\s*(?:of|:)?\s*(?:Rs\.?|₹)?\s*([\d.]+)/i)
            const mcMatch = allText.match(/market\s*cap\s*(?:of|:)?\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*(crore|lakh|billion|trillion)?/i)
            const priceMatch = allText.match(/(?:share price|current price|ltp|nse price)[:\s]*(?:Rs\.?|₹)?\s*([\d,]+\.?\d*)/i)
            const high52Match = allText.match(/52[\s-]*week\s*high[:\s]*(?:Rs\.?|₹)?\s*([\d,]+\.?\d*)/i)
            const low52Match = allText.match(/52[\s-]*week\s*low[:\s]*(?:Rs\.?|₹)?\s*([\d,]+\.?\d*)/i)

            if (peMatch) peRatio = parseFloat(peMatch[1])
            if (epsMatch) eps = parseFloat(epsMatch[1])
            if (mcMatch) marketCap = `₹${mcMatch[1]} ${mcMatch[2] ?? ''}`.trim()
            if (priceMatch) currentPrice = `₹${priceMatch[1].replace(/,/g, '')}`
            if (high52Match) high52Week = `₹${high52Match[1].replace(/,/g, '')}`
            if (low52Match) low52Week = `₹${low52Match[1].replace(/,/g, '')}`
        } catch {
            // Leave defaults
        }

        return {
            ticker,
            exchange: 'NSE',
            currency: 'INR',
            marketCap,
            peRatio,
            eps,
            revenue,
            profitMargin: 0,
            debtToEquity: 0,
            yoyGrowth: 0,
            high52Week,
            low52Week,
            dataSource: 'tavily_fallback',
            globalMarket: {
                currentPrice,
                currency: 'INR',
                exchange: 'NSE',
                marketCap,
                marketCapRank: 'N/A',
                sharePrice52High: high52Week,
                sharePrice52Low: low52Week,
                priceChangeToday: priceChange,
                priceChangePct,
                volume: 'N/A',
                avgVolume: 'N/A',
                beta: 0,
                dividendYield: 'N/A',
                outstandingShares: 'N/A',
                floatShares: 'N/A',
                globalRank: 'N/A',
                sectorRank: 'N/A',
            },
        }

    } catch {
        // Last resort — return empty but valid object so agents don't crash
        console.warn(`All financial sources failed for ${companyName}. Returning empty metrics.`)
        return {
            ticker,
            exchange: 'NSE',
            currency: 'INR',
            marketCap: 'N/A',
            peRatio: 0,
            eps: 0,
            revenue: 'N/A',
            profitMargin: 0,
            debtToEquity: 0,
            yoyGrowth: 0,
            high52Week: 'N/A',
            low52Week: 'N/A',
            dataSource: 'tavily_fallback',
            globalMarket: emptyGlobalMarket('INR'),
        }
    }
}

// ─── Alpha Vantage fetcher (US stocks) ───────────────────────────────────────

async function fetchFromAlphaVantage(
    params: Record<string, string>
): Promise<Record<string, unknown>> {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY
    if (!apiKey) {
        throw new Error('ALPHA_VANTAGE_API_KEY is missing. US stock analysis is unavailable.')
    }
    const url = new URL(BASE_URL)
    url.searchParams.set('apikey', apiKey)
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
    }

    const response = await fetch(url.toString(), { next: { revalidate: 3600 } })

    if (!response.ok) {
        if (response.status === 401) throw new Error('Alpha Vantage key invalid.')
        if (response.status === 429) throw new Error('Alpha Vantage rate limit hit.')
        throw new Error(`Alpha Vantage returned ${response.status}`)
    }

    const data = await response.json()

    if (data['Error Message']) throw new Error(`${data['Error Message']}`)
    if (data['Note']) throw new Error('Alpha Vantage rate limit. Wait 1 min.')
    if (data['Information']) throw new Error('Alpha Vantage daily limit reached.')

    return data
}

async function searchTicker(companyName: string): Promise<string> {
    const data = await fetchFromAlphaVantage({ function: 'SYMBOL_SEARCH', keywords: companyName })
    const matches = data['bestMatches'] as Array<Record<string, string>> | undefined
    if (!matches || matches.length === 0) return companyName.toUpperCase().slice(0, 5)
    return matches[0]['1. symbol']
}

function safeNumber(value: unknown, fallback = 0): number {
    const n = parseFloat(String(value))
    return isNaN(n) ? fallback : n
}

function formatLargeNumber(value: unknown): string {
    const n = parseFloat(String(value))
    if (isNaN(n)) return 'N/A'
    if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    return `$${n.toLocaleString()}`
}
function classifyMarketCapGlobally(marketCapRaw: number, currency: 'INR' | 'USD'): string {
    const usd = currency === 'INR' ? marketCapRaw / 83 : marketCapRaw
    if (usd >= 1_000_000_000_000) return 'Mega cap · Top 10 globally (>$1T)'
    if (usd >= 200_000_000_000) return 'Large cap · Top 100 globally (>$200B)'
    if (usd >= 50_000_000_000) return 'Large cap · Top 500 globally (>$50B)'
    if (usd >= 10_000_000_000) return 'Mid cap · Notable globally (>$10B)'
    if (usd >= 2_000_000_000) return 'Mid cap · Regional player (>$2B)'
    if (usd >= 300_000_000) return 'Small cap (<$300M)'
    return 'Micro cap (<$300M)'
}
function classifyIndianMarketCap(marketCapCrore: number): string {
    if (marketCapCrore >= 1_000_000) return 'Mega cap · Top 5 in India (>₹10L Cr)'
    if (marketCapCrore >= 200_000) return 'Large cap · Nifty 50 range (>₹2L Cr)'
    if (marketCapCrore >= 50_000) return 'Large cap · NSE top 100 (>₹50K Cr)'
    if (marketCapCrore >= 10_000) return 'Mid cap · NSE 150 range (>₹10K Cr)'
    if (marketCapCrore >= 5_000) return 'Small cap (>₹5K Cr)'
    return 'Micro cap (<₹5K Cr)'
}

function formatVolume(value: unknown): string {
    const n = parseFloat(String(value))
    if (isNaN(n)) return 'N/A'
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B shares`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M shares`
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K shares`
    return `${n} shares`
}

function buildUSGlobalMarket(
    overview: Record<string, unknown>,
    quoteData: Record<string, unknown>
): GlobalMarketData {
    const quote = (quoteData['Global Quote'] ?? {}) as Record<string, string>
    const price = parseFloat(quote['05. price'] ?? '0')
    const change = parseFloat(quote['09. change'] ?? '0')
    const changePct = parseFloat((quote['10. change percent'] ?? '0%').replace('%', ''))
    const volume = quote['06. volume'] ?? '0'
    const marketCapN = parseFloat(String(overview['MarketCapitalization'] ?? '0'))
    return {
        currentPrice: price ? `$${price.toFixed(2)}` : 'N/A',
        currency: 'USD',
        exchange: String(overview['Exchange'] ?? 'NASDAQ'),
        marketCap: formatLargeNumber(overview['MarketCapitalization']),
        marketCapRank: classifyMarketCapGlobally(marketCapN, 'USD'),
        sharePrice52High: `$${overview['52WeekHigh'] ?? 'N/A'}`,
        sharePrice52Low: `$${overview['52WeekLow'] ?? 'N/A'}`,
        priceChangeToday: change >= 0 ? `+${change.toFixed(2)}` : `${change.toFixed(2)}`,
        priceChangePct: parseFloat(changePct.toFixed(2)),
        volume: formatVolume(volume),
        avgVolume: formatVolume(overview['SharesFloat']),
        beta: parseFloat(String(overview['Beta'] ?? '1')),
        dividendYield: overview['DividendYield']
            ? `${(parseFloat(String(overview['DividendYield'])) * 100).toFixed(2)}%`
            : '0%',
        outstandingShares: formatVolume(overview['SharesOutstanding']),
        floatShares: formatVolume(overview['SharesFloat']),
        globalRank: classifyMarketCapGlobally(marketCapN, 'USD'),
        sectorRank: `${overview['Sector'] ?? 'N/A'} sector · P/E ${overview['ForwardPE'] ?? 'N/A'} forward`,
    }
}

function buildIndianGlobalMarket(
    nseData: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ticker: string
): GlobalMarketData {
    const priceInfo = (nseData['priceInfo'] ?? {}) as Record<string, unknown>
    const metadata = (nseData['metadata'] ?? {}) as Record<string, unknown>
    const secInfo = (nseData['securityInfo'] ?? {}) as Record<string, unknown>

    const price = parseFloat(String(priceInfo['lastPrice'] ?? '0'))
    const change = parseFloat(String(priceInfo['change'] ?? '0'))
    const changePct = parseFloat(String(priceInfo['pChange'] ?? '0'))
    const high52 = (priceInfo['weekHighLow'] as Record<string, unknown>)?.['max'] ?? 'N/A'
    const low52 = (priceInfo['weekHighLow'] as Record<string, unknown>)?.['min'] ?? 'N/A'

    // Market cap in crores from NSE
    const mcCroreRaw = parseFloat(String(metadata['pdSectorPe'] ?? '0'))
    const mcCrore = isNaN(mcCroreRaw) ? 0 : mcCroreRaw

    // Outstanding shares from securityInfo
    const outstanding = String(secInfo['issuedCap'] ?? '0')
    return {
        currentPrice: price ? `₹${price.toLocaleString('en-IN')}` : 'N/A',
        currency: 'INR',
        exchange: 'NSE',
        marketCap: mcCrore ? `₹${mcCrore.toLocaleString('en-IN')} Cr` : 'N/A',
        marketCapRank: classifyIndianMarketCap(mcCrore),
        sharePrice52High: `₹${high52}`,
        sharePrice52Low: `₹${low52}`,
        priceChangeToday: change >= 0 ? `+₹${change.toFixed(2)}` : `-₹${Math.abs(change).toFixed(2)}`,
        priceChangePct: parseFloat(changePct.toFixed(2)),
        volume: formatVolume(priceInfo['totalTradedVolume']),
        avgVolume: formatVolume(priceInfo['totalTradedVolume']),
        beta: 0,    // NSE doesn't expose beta directly
        dividendYield: 'See annual report',
        outstandingShares: formatVolume(outstanding),
        floatShares: 'N/A',
        globalRank: classifyMarketCapGlobally(mcCrore * 10_000_000, 'INR'),
        sectorRank: `${String(metadata['pdSectorInd'] ?? 'N/A')} · NSE listed`,
    }
}

async function fetchUSFinancials(companyName: string): Promise<FinancialMetrics> {
    const ticker = await searchTicker(companyName)
    const [overview, quoteData] = await Promise.all([
        fetchFromAlphaVantage({ function: 'Overview', symbol: ticker }),
        fetchFromAlphaVantage({ function: 'GLOBAL_QUOTE', symbol: ticker }),
    ])
    if (!overview['Symbol']) {
        throw new Error(`No data found for "${companyName}" on Alpha Vantage.`)
    }

    let yoyGrowth = 0
    try {
        const income = await fetchFromAlphaVantage({ function: 'INCOME_STATEMENT', symbol: ticker })
        const reports = income['annualReports'] as Array<Record<string, string>> | undefined
        if (reports && reports.length >= 2) {
            const latest = parseFloat(reports[0]['totalRevenue'] ?? '0')
            const previous = parseFloat(reports[1]['totalRevenue'] ?? '1')
            yoyGrowth = parseFloat(((latest - previous) / previous * 100).toFixed(2))
        }
    } catch {
        console.warn('Could not fetch income statement. YoY growth set to 0.')
    }

    return {
        ticker,
        exchange: 'NASDAQ',
        currency: 'USD',
        marketCap: formatLargeNumber(overview['MarketCapitalization']),
        peRatio: safeNumber(overview['PERatio']),
        eps: safeNumber(overview['EPS']),
        revenue: formatLargeNumber(overview['RevenueTTM']),
        profitMargin: parseFloat((safeNumber(overview['ProfitMargin']) * 100).toFixed(2)),
        debtToEquity: safeNumber(overview['DebtToEquityRatio'] ?? overview['DebtToEquity']),
        yoyGrowth,
        high52Week: String(overview['52WeekHigh'] ?? 'N/A'),
        low52Week: String(overview['52WeekLow'] ?? 'N/A'),
        dataSource: 'alphavantage',
        globalMarket: buildUSGlobalMarket(overview, quoteData),
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getFinancialMetrics(companyName: string): Promise<FinancialMetrics> {
    const { isIndian, ticker, exchange } = await smartDetectCompany(companyName)

    if (isIndian) {
        console.log(`🇮🇳 Detected Indian company: ${companyName} → ${ticker} (${exchange})`)
        return fetchIndianFinancials(ticker, companyName)
    }

    console.log(`🇺🇸 Detected US company: ${companyName} → fetching from Alpha Vantage`)
    return fetchUSFinancials(companyName)
}