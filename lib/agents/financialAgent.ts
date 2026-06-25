// ─── Financial Agent ──────────────────────────────────────────────────────────
// Data sources: Finnhub (stock quote + basic financials)
// NO LLM call — pure data fetching + scoring logic
// Stores financial summary in RAG for Decision Agent context

import { AgentState, FinancialData } from '../../types'
import {
    getStockQuote,
    getBasicFinancials,
    formatMarketCap,
    classifyMarketCap,
    resolveTicker,
    FinnhubMetrics,
} from '../tools/finnhub'
import { addDocumentsToRAG, buildFinancialDoc } from '../rag/vectorStore'

// ─── Safe numeric helpers ────────────────────────────────────────────────────

/** Safely parse a metric value to number; returns fallback if undefined/NaN */
function safeNum(value: number | string | undefined, fallback = 0): number {
    if (typeof value === 'number' && !isNaN(value)) return value
    if (typeof value === 'string') {
        const n = parseFloat(value)
        return isNaN(n) ? fallback : n
    }
    return fallback
}

/** Safely parse a metric value to number or null; returns null if undefined/NaN */
function safeNumOrNull(value: number | string | undefined): number | null {
    if (typeof value === 'number' && !isNaN(value)) return value
    if (typeof value === 'string') {
        const n = parseFloat(value)
        return isNaN(n) ? null : n
    }
    return null
}

/** Round a number to 2 decimal places */
function round2(n: number): number {
    return Math.round(n * 100) / 100
}

// ─── Financial Health Scoring (rule-based, no LLM) ────────────────────────────

function scoreFinancialHealth(
    peRatio: number | null,
    profitMargin: number | null,
    yoyGrowth: number | null,
    debtToEquity: number | null,
    beta: number | null
): { healthSummary: string; valuationComment: string; revenueComment: string } {

    // Valuation comment
    let valuationComment: string
    if (peRatio === null || peRatio <= 0) valuationComment = 'P/E unavailable — further research needed.'
    else if (peRatio < 15)  valuationComment = `Low P/E of ${peRatio}× — potential undervaluation or value trap.`
    else if (peRatio < 25)  valuationComment = `Moderate P/E of ${peRatio}× — fairly valued stock.`
    else if (peRatio < 40)  valuationComment = `Elevated P/E of ${peRatio}× — growth premium priced in.`
    else                    valuationComment = `High P/E of ${peRatio}× — market pricing strong future growth.`

    // Revenue comment
    let revenueComment: string
    if (yoyGrowth === null)       revenueComment = 'YoY growth data unavailable.'
    else if (yoyGrowth > 20)      revenueComment = `Strong YoY growth of ${yoyGrowth.toFixed(1)}% — accelerating business.`
    else if (yoyGrowth > 5)       revenueComment = `Steady YoY growth of ${yoyGrowth.toFixed(1)}%.`
    else if (yoyGrowth >= 0)      revenueComment = `Modest growth of ${yoyGrowth.toFixed(1)}% — stable but slow.`
    else                          revenueComment = `Revenue declined ${Math.abs(yoyGrowth).toFixed(1)}% YoY — watch closely.`

    // Health items
    const items: string[] = []
    if (profitMargin === null)  items.push('profit margin unavailable')
    else if (profitMargin > 20) items.push(`Strong margin (${profitMargin.toFixed(1)}%)`)
    else if (profitMargin > 0)  items.push(`Positive margin (${profitMargin.toFixed(1)}%)`)
    else                        items.push(`Negative margin (${profitMargin.toFixed(1)}%)`)

    if (debtToEquity === null)    items.push('leverage data unavailable')
    else if (debtToEquity < 0.5)  items.push('low leverage')
    else if (debtToEquity < 1.5)  items.push('moderate debt load')
    else                          items.push('high leverage — monitor debt')

    if (beta === null)   items.push('volatility data unavailable')
    else if (beta < 0.8) items.push('defensive low-beta stock')
    else if (beta > 1.5) items.push('high-volatility stock (high beta)')

    return {
        healthSummary: items.join('; ') + '.',
        valuationComment,
        revenueComment,
    }
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function financialAgent(
    state: AgentState
): Promise<Partial<AgentState>> {

    console.log(`Financial Agent starting for: ${state.company}`)

    try {
        // Use ticker resolved by Research Agent (already in state), or resolve now
        const ticker = state.ticker ?? await resolveTicker(state.company)

        // Parallel: fetch live quote + key financial ratios from Finnhub
        const [quote, financials] = await Promise.all([
            getStockQuote(ticker),
            getBasicFinancials(ticker),
        ])

        // Guardrail check: If both returned null, abort immediately
        if (!quote && !financials) {
            throw new Error(`Financial Agent failed to fetch both stock quote and basic financials for ticker "${ticker}". This typically indicates an invalid API key, lack of access permissions, or rate-limiting.`)
        }

        // ── Metric values (all safely cast) ────────────────────────────────────────────────
        // Cast to FinnhubMetrics so TypeScript knows all field shapes
        const m = (financials?.metric ?? {}) as Partial<FinnhubMetrics>

        const currentPriceRaw  = safeNumOrNull(quote?.c)
        const priceChangeRaw   = safeNumOrNull(quote?.d)
        const priceChangePct   = quote?.dp !== undefined && quote?.dp !== null ? round2(safeNum(quote?.dp)) : null

        const currentPrice = currentPriceRaw !== null ? `$${currentPriceRaw.toFixed(2)}` : 'N/A'
        const priceChange  = currentPriceRaw !== null && priceChangeRaw !== null
            ? (priceChangeRaw >= 0
                ? `+$${priceChangeRaw.toFixed(2)}`
                : `-$${Math.abs(priceChangeRaw).toFixed(2)}`)
            : 'N/A'

        // Market cap comes in millions USD from Finnhub
        const mcMillions   = safeNumOrNull(m['marketCapitalization'])
        const marketCap    = mcMillions !== null ? formatMarketCap(mcMillions) : 'N/A'
        const globalRank   = mcMillions !== null ? classifyMarketCap(mcMillions) : 'N/A'

        // Key ratios
        const peRatio      = safeNumOrNull(m['peBasicExclExtraTTM']) !== null ? round2(safeNum(m['peBasicExclExtraTTM'])) : null
        const eps          = safeNumOrNull(m['epsTTM']) !== null ? round2(safeNum(m['epsTTM'])) : null

        // Revenue — Finnhub returns it in USD (not millions), divide to format
        const revUSD       = safeNumOrNull(m['revenueTTM'])
        const revenue      = revUSD !== null && revUSD > 0 ? formatMarketCap(revUSD / 1_000_000) : 'N/A'

        // Margins and growth
        const profitMargin   = safeNumOrNull(m['netProfitMarginTTM']) !== null ? round2(safeNum(m['netProfitMarginTTM'])) : null
        const yoyGrowthRaw   = safeNumOrNull(m['revenueGrowthTTMYoy'])
        const yoyGrowth      = yoyGrowthRaw !== null ? round2(yoyGrowthRaw * 100) : null   // Finnhub gives it as decimal (0.12 = 12%)
        const debtToEquity   = safeNumOrNull(m['totalDebtToEquity']) !== null ? round2(safeNum(m['totalDebtToEquity'])) : null
        const beta           = safeNumOrNull(m['beta']) !== null ? round2(safeNum(m['beta'], 1)) : null

        // 52-week range
        const high52Raw = safeNumOrNull(m['52WeekHigh'])
        const low52Raw  = safeNumOrNull(m['52WeekLow'])
        const high52Week = high52Raw !== null ? `$${high52Raw.toFixed(2)}` : 'N/A'
        const low52Week  = low52Raw  !== null ? `$${low52Raw.toFixed(2)}`  : 'N/A'

        // Dividend yield
        const divRaw       = safeNumOrNull(m['dividendYieldIndicatedAnnual'])
        const dividendYield = divRaw !== null ? `${divRaw.toFixed(2)}%` : '0%'

        // Outstanding shares estimate (market cap / price)
        const outstandingShares = mcMillions !== null && currentPriceRaw !== null && currentPriceRaw > 0
            ? formatMarketCap((mcMillions * 1_000_000) / currentPriceRaw / 1_000_000)
            : 'N/A'

        // ── Health scoring ────────────────────────────────────────────────────
        const { healthSummary, valuationComment, revenueComment } =
            scoreFinancialHealth(peRatio, profitMargin, yoyGrowth, debtToEquity, beta)

        // ── Assemble result ───────────────────────────────────────────────────
        const financialData: FinancialData = {
            ticker,
            exchange: 'NASDAQ',
            currency: 'USD',
            currentPrice,
            priceChange,
            priceChangePct,
            marketCap,
            globalRank,
            peRatio,
            eps,
            revenue,
            profitMargin,
            debtToEquity,
            yoyGrowth,
            high52Week,
            low52Week,
            dividendYield,
            beta,
            volume: 'N/A',
            outstandingShares,
            dataSource: 'finnhub',
            healthSummary,
            valuationComment,
            revenueComment,
        }

        // ── Ingest into RAG ───────────────────────────────────────────────────
        const ragDoc = buildFinancialDoc(
            state.company,
            financialData as unknown as Record<string, unknown>
        )
        await addDocumentsToRAG([ragDoc])

        console.log(`Financial Agent done — ${ticker} @ ${currentPrice} | P/E: ${peRatio} | Market Cap: ${marketCap}`)

        return { financialData, ticker, error: undefined }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Financial Agent failed:', message)

        return {
            financialData: {
                ticker: 'N/A',
                exchange: 'OTHER',
                currency: 'USD',
                currentPrice: 'N/A',
                priceChange: 'N/A',
                priceChangePct: null,
                marketCap: 'N/A',
                globalRank: 'N/A',
                peRatio: null,
                eps: null,
                revenue: 'N/A',
                profitMargin: null,
                debtToEquity: null,
                yoyGrowth: null,
                high52Week: 'N/A',
                low52Week: 'N/A',
                dividendYield: 'N/A',
                beta: null,
                volume: 'N/A',
                outstandingShares: 'N/A',
                dataSource: 'finnhub',
                healthSummary: 'Financial data unavailable',
                valuationComment: 'N/A',
                revenueComment: 'N/A',
            },
            error: `Financial Agent: ${message}`,
        }
    }
}