'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
// ─── Types ───────────────────────────────────────────────────────────────────

interface ResearchData {
    overview: string
    sector: string
    CEO: string
    founded: string
    headquarters: string
    products: string[]
    competitors: string[]
    businessModel: string
    employeeCount: string
    keyStrengths: string[]
}

interface FinancialData {
    ticker: string
    exchange: string
    currency: string
    currentPrice: string
    priceChange: string
    priceChangePct: number
    marketCap: string
    globalRank: string
    peRatio: number
    eps: number
    revenue: string
    profitMargin: number
    debtToEquity: number
    yoyGrowth: number
    high52Week: string
    low52Week: string
    dividendYield: string
    beta: number
    volume: string
    outstandingShares: string
    healthSummary: string
    valuationComment: string
    revenueComment: string
}

interface NewsData {
    headlines: string[]
    sentiment: 'positive' | 'negative' | 'mixed'
    sentimentScore: number
    summary: string
    bullishPoints: string[]
    bearishPoints: string[]
    recentEvents: string[]
    mediaAttention: string
}

interface RiskData {
    risks: string[]
    opportunities: string[]
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH'
    riskScore: number
    macroRisks: string[]
    competitiveRisks: string[]
    financialRisks: string[]
    moatStrength: string
    moatComment: string
    esgFlags: string[]
}

interface Verdict {
    decision: 'INVEST' | 'PASS'
    confidence: number
    horizon: string
    targetPrice: string
    reasoning: string
    bullCase: string
    bearCase: string
    keyMetrics: string[]
    watchlist: string[]
    alternativePick: string | null
    analystRating: string
    disclaimer: string
}

interface ValuationData {
    intrinsicValue: number
    currentPrice: number
    valuationGapPct: number
    wacc: number
    revenueGrowthRate: number
    terminalGrowthRate: number
    assumptions: string
    formulaApplied: string
}

interface ReportData {
    company: string
    verdict?: Verdict
    research?: ResearchData
    financial?: FinancialData
    news?: NewsData
    risk?: RiskData
    valuation?: ValuationData
    researchData?: ResearchData
    financialData?: FinancialData
    newsData?: NewsData
    riskData?: RiskData
    valuationData?: ValuationData
    data?: {
        verdict?: Verdict
        research?: ResearchData
        financial?: FinancialData
        news?: NewsData
        risk?: RiskData
        valuation?: ValuationData
    }
    error?: string
    ragContext?: string
    ragQuality?: {
        totalChunks: number
        tables: number
        footnotes: number
        textBlocks: number
        avgRelevanceScore: number
        queriesIssued: number
        sourcesUsed: string
    }
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = ['Overview', 'Financials', 'Valuation', 'News', 'Risks', 'Decision', 'SEC Sources', 'Trend'] as const
type Tab = typeof TABS[number]

// ─── Small reusable components ────────────────────────────────────────────────

function Badge({
    children,
    color = 'gray'
}: {
    children: React.ReactNode
    color?: 'green' | 'red' | 'blue' | 'amber' | 'gray' | 'purple'
}) {
    const styles: Record<string, string> = {
        green: 'bg-green-50  text-green-800',
        red: 'bg-red-50    text-red-800',
        blue: 'bg-blue-50   text-blue-800',
        amber: 'bg-amber-50  text-amber-800',
        gray: 'bg-gray-100  text-gray-700',
        purple: 'bg-purple-50 text-purple-800',
    }
    return (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles[color]}`}>
            {children}
        </span>
    )
}

function MetricCard({
    label,
    value,
    sub,
    highlight
}: {
    label: string
    value: string
    sub?: string
    highlight?: 'green' | 'red'
}) {
    return (
        <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className={`text-base font-medium ${highlight === 'green' ? 'text-green-700' :
                highlight === 'red' ? 'text-red-700' : 'text-gray-900'
                }`}>
                {value}
            </p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    )
}

function SectionCard({
    title,
    icon,
    children
}: {
    title: string
    icon: string
    children: React.ReactNode
}) {
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <p className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                <span>{icon}</span>{title}
            </p>
            {children}
        </div>
    )
}

// ─── Tab content components ───────────────────────────────────────────────────

function OverviewTab({ research }: { research: ResearchData }) {
    return (
        <div>
            <SectionCard title="Company overview" icon="🏢">
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    {research.overview}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {[
                        { label: 'CEO', value: research.CEO },
                        { label: 'Founded', value: research.founded },
                        { label: 'Headquarters', value: research.headquarters },
                        { label: 'Employees', value: research.employeeCount },
                        { label: 'Sector', value: research.sector },
                    ].map(row => (
                        <div key={row.label} className="flex justify-between border-b border-gray-50 py-1.5">
                            <span className="text-gray-400">{row.label}</span>
                            <span className="text-gray-900 font-medium text-right max-w-[160px] sm:max-w-[200px] truncate" title={row.value ?? ''}>
                                {row.value ?? 'N/A'}
                            </span>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard title="Business model" icon="💡">
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    {research.businessModel}
                </p>
                <div>
                    <p className="text-xs text-gray-400 mb-2">Key products & services</p>
                    <div className="flex flex-wrap gap-2">
                        {research.products?.map((p, i) => (
                            <Badge key={i} color="blue">{p}</Badge>
                        ))}
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Competitive strengths" icon="⚡">
                <ul className="space-y-2">
                    {research.keyStrengths?.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-green-600 mt-0.5 flex-shrink-0">✓</span>
                            {s}
                        </li>
                    ))}
                </ul>
                <div className="mt-4">
                    <p className="text-xs text-gray-400 mb-2">Main competitors</p>
                    <div className="flex flex-wrap gap-2">
                        {research.competitors?.map((c, i) => (
                            <Badge key={i} color="gray">{c}</Badge>
                        ))}
                    </div>
                </div>
            </SectionCard>
        </div>
    )
}

function ValuationTab({ valuation }: { valuation: ValuationData | undefined }) {
    if (!valuation || !valuation.intrinsicValue) {
        return (
            <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4 text-center">
                <p className="text-sm text-gray-400">Valuation calculations are not available for this report snapshot.</p>
            </div>
        )
    }

    const isUndervalued = valuation.valuationGapPct > 0
    const gapColor = isUndervalued ? 'green' : valuation.valuationGapPct < 0 ? 'red' : 'gray'
    const gapSymbol = isUndervalued ? '+' : ''

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <SectionCard title="DCF Intrinsic Valuation Model" icon="📊">
                <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-3">
                    <MetricCard
                        label="Intrinsic Share Value"
                        value={`$${valuation.intrinsicValue}`}
                        highlight={isUndervalued ? 'green' : undefined}
                    />
                    <MetricCard
                        label="Current Trading Price"
                        value={`$${valuation.currentPrice}`}
                    />
                    <MetricCard
                        label="Valuation Gap"
                        value={`${gapSymbol}${valuation.valuationGapPct}%`}
                        sub={isUndervalued ? 'Undervalued' : valuation.valuationGapPct < 0 ? 'Overvalued' : 'Fairly Valued'}
                        highlight={isUndervalued ? 'green' : valuation.valuationGapPct < 0 ? 'red' : undefined}
                    />
                </div>

                <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-gray-100">
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Discount Rate (WACC)</p>
                        <p className="text-xs font-semibold text-gray-800">{valuation.wacc}%</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Projected Growth (Years 1-5)</p>
                        <p className="text-xs font-semibold text-gray-800">{valuation.revenueGrowthRate}%</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Terminal Growth Rate</p>
                        <p className="text-xs font-semibold text-gray-800">{valuation.terminalGrowthRate}%</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Analyst Assumptions & Rationale" icon="📝">
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {valuation.assumptions}
                </p>
            </SectionCard>

            <SectionCard title="Model Formulas & Mathematical Framework" icon="📐">
                <div className="p-3 bg-gray-50 text-gray-500 rounded-lg font-mono text-[10px] whitespace-pre-wrap leading-normal">
                    {valuation.formulaApplied}
                </div>
                <div className="text-[10px] text-gray-400 mt-2.5 italic">
                    Note: Discounted Cash Flow valuation models are projection-based. Estimates rely heavily on management's forward guidance and the analyst's cost of capital assumptions.
                </div>
            </SectionCard>
        </div>
    )
}

function FinancialsTab({ financial }: { financial: FinancialData }) {
    const isPositive = financial.priceChangePct >= 0

    return (
        <div>
            <SectionCard title="Share price & market data" icon="📈">
                <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-3">
                    <MetricCard
                        label="Current price"
                        value={financial.currentPrice ?? 'N/A'}
                        sub={`${isPositive ? '+' : ''}${financial.priceChange ?? '0'} today`}
                        highlight={isPositive ? 'green' : 'red'}
                    />
                    <MetricCard label="Market cap" value={financial.marketCap || 'N/A'} />
                    <MetricCard label="Global rank" value={financial.globalRank || 'N/A'} />
                    <MetricCard label="52W high" value={financial.high52Week} />
                    <MetricCard label="52W low" value={financial.low52Week} />
                    <MetricCard label="Volume today" value={financial.volume} />
                </div>
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                    {financial.healthSummary}
                </div>
            </SectionCard>

            <SectionCard title="Key ratios" icon="🔢">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <MetricCard label="P/E ratio" value={`${financial.peRatio}×`} />
                    <MetricCard label="EPS" value={`${financial.eps}`} />
                    <MetricCard label="Revenue" value={financial.revenue} />
                    <MetricCard
                        label="YoY growth"
                        value={`${financial.yoyGrowth > 0 ? '+' : ''}${financial.yoyGrowth}%`}
                        highlight={financial.yoyGrowth > 0 ? 'green' : 'red'}
                    />
                    <MetricCard
                        label="Profit margin"
                        value={`${financial.profitMargin}%`}
                        highlight={financial.profitMargin > 10 ? 'green' : undefined}
                    />
                    <MetricCard label="Debt / equity" value={`${financial.debtToEquity}`} />
                    <MetricCard label="Beta" value={`${financial.beta}`} />
                    <MetricCard label="Dividend yield" value={financial.dividendYield} />
                    <MetricCard label="Shares out" value={financial.outstandingShares} />
                </div>
                <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                        <span className="font-medium">Valuation: </span>
                        {financial.valuationComment}
                    </p>
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                        <span className="font-medium">Revenue trend: </span>
                        {financial.revenueComment}
                    </p>
                </div>
            </SectionCard>
        </div>
    )
}

function NewsTab({ news }: { news: NewsData }) {
    const sentimentColor =
        news.sentiment === 'positive' ? 'green' :
            news.sentiment === 'negative' ? 'red' : 'amber'

    const scoreColor =
        news.sentimentScore > 40 ? 'text-green-600' :
            news.sentimentScore < -40 ? 'text-red-600' : 'text-amber-600'

    return (
        <div>
            <SectionCard title="Sentiment overview" icon="📰">
                <div className="flex items-center gap-3 mb-4">
                    <Badge color={sentimentColor}>
                        {news.sentiment.charAt(0).toUpperCase() + news.sentiment.slice(1)}
                    </Badge>
                    <span className={`text-sm font-medium ${scoreColor}`}>
                        Score: {news.sentimentScore}/100
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                        {news.mediaAttention} media attention
                    </span>
                </div>

                {/* Sentiment bar */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div
                        className={`h-full rounded-full transition-all ${news.sentimentScore > 0 ? 'bg-green-500' : 'bg-red-500'
                            }`}
                        style={{ width: `${Math.abs(news.sentimentScore)}%` }}
                    />
                </div>

                <p className="text-sm text-gray-600 leading-relaxed">
                    {news.summary}
                </p>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SectionCard title="Bullish signals" icon="📗">
                    <ul className="space-y-2">
                        {news.bullishPoints?.length > 0
                            ? news.bullishPoints.map((p, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                    <span className="text-green-500 flex-shrink-0 mt-0.5">↑</span>
                                    {p}
                                </li>
                            ))
                            : <li className="text-sm text-gray-400">No bullish signals found</li>
                        }
                    </ul>
                </SectionCard>

                <SectionCard title="Bearish signals" icon="📕">
                    <ul className="space-y-2">
                        {news.bearishPoints?.length > 0
                            ? news.bearishPoints.map((p, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                    <span className="text-red-500 flex-shrink-0 mt-0.5">↓</span>
                                    {p}
                                </li>
                            ))
                            : <li className="text-sm text-gray-400">No bearish signals found</li>
                        }
                    </ul>
                </SectionCard>
            </div>

            <SectionCard title="Recent headlines" icon="🗞️">
                <ul className="space-y-2">
                    {news.headlines?.slice(0, 8).map((h, i) => (
                        <li
                            key={i}
                            className="text-sm text-gray-600 py-2 border-b border-gray-50 last:border-0"
                        >
                            {h}
                        </li>
                    ))}
                </ul>
            </SectionCard>
        </div>
    )
}

function RisksTab({ risk }: { risk: RiskData }) {
    const riskColor =
        risk.riskLevel === 'LOW' ? 'green' :
            risk.riskLevel === 'MEDIUM' ? 'amber' :
                risk.riskLevel === 'HIGH' ? 'red' : 'red'

    const moatColor =
        risk.moatStrength === 'STRONG' ? 'green' :
            risk.moatStrength === 'MODERATE' ? 'amber' : 'red'

    return (
        <div>
            <SectionCard title="Risk summary" icon="⚠️">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Risk level</span>
                        <Badge color={riskColor}>{risk.riskLevel}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Risk score</span>
                        <span className="text-sm font-medium">{risk.riskScore}/100</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Moat</span>
                        <Badge color={moatColor}>{risk.moatStrength}</Badge>
                    </div>
                </div>

                {/* Risk score bar */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                        className={`h-full rounded-full ${risk.riskScore > 60 ? 'bg-red-500' :
                            risk.riskScore > 30 ? 'bg-amber-500' : 'bg-green-500'
                            }`}
                        style={{ width: `${risk.riskScore}%` }}
                    />
                </div>
                <p className="text-xs text-gray-400 mb-4">{risk.moatComment}</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <p className="text-xs text-gray-400 mb-2">Key risks</p>
                        <ul className="space-y-2">
                            {risk.risks?.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                    <span className="text-red-400 flex-shrink-0 mt-0.5">✕</span>
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-2">Opportunities</p>
                        <ul className="space-y-2">
                            {risk.opportunities?.map((o, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                    <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                                    {o}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SectionCard title="Macro risks" icon="🌍">
                    <ul className="space-y-1.5">
                        {risk.macroRisks?.map((r, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                <span className="text-amber-400 flex-shrink-0">→</span>{r}
                            </li>
                        ))}
                    </ul>
                </SectionCard>

                <SectionCard title="Competitive risks" icon="🥊">
                    <ul className="space-y-1.5">
                        {risk.competitiveRisks?.map((r, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                <span className="text-amber-400 flex-shrink-0">→</span>{r}
                            </li>
                        ))}
                    </ul>
                </SectionCard>
            </div>

            {risk.esgFlags?.length > 0 && (
                <SectionCard title="ESG flags" icon="🌱">
                    <div className="flex flex-wrap gap-2">
                        {risk.esgFlags.map((f, i) => (
                            <Badge key={i} color="amber">{f}</Badge>
                        ))}
                    </div>
                </SectionCard>
            )}
        </div>
    )
}

function DecisionTab({ verdict }: { verdict: Verdict }) {
    const isInvest = verdict.decision === 'INVEST'

    const ratingColor =
        verdict.analystRating === 'STRONG BUY' ? 'green' :
            verdict.analystRating === 'BUY' ? 'green' :
                verdict.analystRating === 'HOLD' ? 'amber' :
                    verdict.analystRating === 'SELL' ? 'red' : 'red'

    return (
        <div>
            <SectionCard title="Final decision" icon="🧠">
                <div className={`
          rounded-lg p-4 mb-4
          ${isInvest ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}
        `}>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-xl font-medium ${isInvest ? 'text-green-700' : 'text-red-700'}`}>
                            {verdict.decision}
                        </span>
                        <div className="flex items-center gap-2">
                            <Badge color={ratingColor}>{verdict.analystRating}</Badge>
                            <span className="text-sm text-gray-500">{verdict.confidence}% confidence</span>
                        </div>
                    </div>
                    <div className="w-full h-1.5 bg-white rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${isInvest ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${verdict.confidence}%` }}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <MetricCard label="Target price" value={verdict.targetPrice} />
                    <MetricCard label="Time horizon" value={verdict.horizon} />
                </div>

                <p className="text-sm text-gray-600 leading-relaxed">
                    {verdict.reasoning}
                </p>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SectionCard title="Bull case" icon="📗">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        {verdict.bullCase}
                    </p>
                </SectionCard>
                <SectionCard title="Bear case" icon="📕">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        {verdict.bearCase}
                    </p>
                </SectionCard>
            </div>

            <SectionCard title="Key metrics that drove this decision" icon="📊">
                <ul className="space-y-2">
                    {verdict.keyMetrics?.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-blue-500 flex-shrink-0 mt-0.5">◆</span>
                            {m}
                        </li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="Things to monitor" icon="👁️">
                <ul className="space-y-2">
                    {verdict.watchlist?.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-amber-500 flex-shrink-0 mt-0.5">◉</span>
                            {w}
                        </li>
                    ))}
                </ul>
                {verdict.alternativePick && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-600 font-medium mb-0.5">Consider instead</p>
                        <p className="text-sm text-blue-800">{verdict.alternativePick}</p>
                    </div>
                )}
            </SectionCard>

            <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-400">{verdict.disclaimer}</p>
            </div>
        </div>
    )
}

function SecSourcesTab({ ragContext }: { ragContext?: string }) {
    const [openIndex, setOpenIndex] = useState<number | null>(0); // First card open by default

    if (!ragContext || ragContext.trim() === 'No additional context retrieved.' || ragContext.trim().length === 0) {
        return (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
                <span className="text-2xl mb-2 block">📂</span>
                <p className="text-sm font-medium text-gray-800 mb-1">No custom SEC documents ingested</p>
                <p className="text-xs text-gray-400">
                    You can upload 10-K, 10-Q, or presentation PDFs on the home page under the "Knowledge Base Ingestion" tab to feed actual company filings to the Decision Agent.
                </p>
            </div>
        )
    }

    // Split by the RAG document delimiter
    const chunks = ragContext.split(/\n\n---\n\n|\n---\n/).map(c => c.trim()).filter(c => c.length > 0)

    return (
        <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <span className="text-blue-600 mt-0.5 text-sm">💡</span>
                <div>
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">RAG Context Reference</p>
                    <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                        Below are the segments, financial tables, and footnotes retrieved from your custom ingested company documents. The Decision Agent parsed this context semantically to check for debt covenants, pending lawsuits, and other hidden risks.
                    </p>
                </div>
            </div>

            {chunks.map((chunk, index) => {
                const isTable = chunk.startsWith('[TABLE]')
                const isFootnote = chunk.startsWith('[FOOTNOTE]')
                
                // Clean the type header
                const displayContent = chunk.replace(/^\s*\[(TABLE|FOOTNOTE|TEXT)\]\s*/i, '').trim()
                
                let title = 'Retrieved Section'
                let icon = '📄'
                let badgeColor = 'gray'

                if (isTable) {
                    title = 'Financial Table Structure'
                    icon = '📊'
                    badgeColor = 'blue'
                } else if (isFootnote) {
                    title = 'SEC Footnote / Risk Disclosure'
                    icon = '📝'
                    badgeColor = 'purple'
                }

                const isCardOpen = openIndex === index;

                return (
                    <div
                        key={index}
                        className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all hover:border-gray-300 ${
                            isFootnote ? 'border-purple-100' : isTable ? 'border-blue-100' : 'border-gray-200'
                        }`}
                    >
                        {/* Header bar */}
                        <div
                            onClick={() => setOpenIndex(isCardOpen ? null : index)}
                            className={`px-4 py-2.5 flex items-center justify-between border-b cursor-pointer select-none ${
                                isFootnote ? 'bg-purple-50/30 border-purple-100/50' :
                                isTable ? 'bg-blue-50/30 border-blue-100/50' : 'bg-gray-50 border-gray-100'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm">{icon}</span>
                                <span className="text-xs font-medium text-gray-800">{title}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    badgeColor === 'blue' ? 'bg-blue-50 text-blue-700' :
                                    badgeColor === 'purple' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {isTable ? 'Table' : isFootnote ? 'Footnote' : 'Text'}
                                </span>
                                
                                {/* Collapsible arrow indicators */}
                                <span className="text-gray-500 flex-shrink-0">
                                    {isCardOpen ? (
                                        // Arrow down for closing (when open)
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    ) : (
                                        // Arrow up for opening (when closed)
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                        </svg>
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* Content area - conditionally visible based on open state */}
                        <div className={`p-4 ${isCardOpen ? 'block' : 'hidden'}`}>
                            {isTable ? (
                                <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg overflow-x-auto whitespace-pre font-mono leading-relaxed max-h-[300px]">
                                    {displayContent}
                                </pre>
                            ) : (
                                <p className="text-xs text-gray-600 leading-relaxed font-sans whitespace-pre-wrap">
                                    {displayContent}
                                </p>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Trend tab component ──────────────────────────────────────────────────────

interface TrendSnapshot {
    analyzedAt: string
    decision: string
    confidence: number
    analystRating: string
    targetPrice: string
    riskScore: number
    riskLevel: string
    sentimentScore: number
    sentiment: string
}

function TrendTab({ company }: { company: string }) {
    const [trends, setTrends] = useState<TrendSnapshot[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadTrends() {
            try {
                const res = await fetch(`/api/trends?company=${encodeURIComponent(company)}`)
                if (res.ok) {
                    const data = await res.json()
                    setTrends(data.trends ?? [])
                }
            } catch { /* silent */ }
            finally { setLoading(false) }
        }
        loadTrends()
    }, [company])

    if (loading) {
        return (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-400">Loading historical trends...</p>
            </div>
        )
    }

    if (trends.length === 0) {
        return (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
                <span className="text-2xl mb-2 block">📈</span>
                <p className="text-sm font-medium text-gray-800 mb-1">No historical data yet</p>
                <p className="text-xs text-gray-400">Run the analysis multiple times to build a trend timeline.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <span className="text-blue-600 mt-0.5 text-sm">📊</span>
                <div>
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Analysis Timeline</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                        Showing {trends.length} analysis snapshot{trends.length > 1 ? 's' : ''}. Newer analyses appear first.
                    </p>
                </div>
            </div>

            {/* Confidence trend dots */}
            {trends.length > 1 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <p className="text-xs font-medium text-gray-500 mb-3">Confidence over time</p>
                    <div className="flex items-end gap-1 h-16">
                        {[...trends].reverse().map((t, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div
                                    className={`w-full rounded-sm transition-all ${
                                        t.decision === 'INVEST' ? 'bg-green-400' : 'bg-red-400'
                                    }`}
                                    style={{ height: `${Math.max(t.confidence, 5)}%` }}
                                    title={`${t.confidence}% — ${t.decision}`}
                                />
                                <span className="text-[8px] text-gray-400">
                                    {new Date(t.analyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Snapshot cards */}
            {trends.map((t, i) => {
                const isInvest = t.decision === 'INVEST'
                const date = new Date(t.analyzedAt)

                return (
                    <div key={i} className={`bg-white border rounded-xl p-4 ${
                        isInvest ? 'border-green-200' : 'border-red-200'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                                    isInvest ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                }`}>
                                    {t.decision}
                                </span>
                                <span className="text-xs text-gray-400">{t.analystRating}</span>
                            </div>
                            <span className="text-xs text-gray-400">
                                {date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                {' · '}
                                {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[10px] text-gray-400">Confidence</p>
                                <p className="text-sm font-medium">{t.confidence}%</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[10px] text-gray-400">Target</p>
                                <p className="text-sm font-medium">{t.targetPrice}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[10px] text-gray-400">Risk</p>
                                <p className="text-sm font-medium">{t.riskLevel} ({t.riskScore})</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[10px] text-gray-400">Sentiment</p>
                                <p className="text-sm font-medium">{t.sentiment} ({t.sentimentScore})</p>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
    const params = useParams()
    const router = useRouter()

    const company = decodeURIComponent(params.company as string)

    const [report, setReport] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [activeTab, setActiveTab] = useState<Tab>('Overview')
    const [reanalyzing, setReanalyzing] = useState(false)
    const [currentStep, setCurrentStep] = useState<string | null>(null)
    const [completedSteps, setCompletedSteps] = useState<string[]>([])
    const [decisionTokens, setDecisionTokens] = useState('')

    const AGENT_STEPS = [
        { key: 'validation', label: 'Validation Agent', desc: 'Verifying company name & resolving ticker' },
        { key: 'research', label: 'Research Agent', desc: 'Company overview, sector, leadership' },
        { key: 'financial', label: 'Financial Agent', desc: 'Share price, market cap, financials' },
        { key: 'valuation', label: 'Valuation Agent', desc: 'Running WACC & DCF cash flow projections' },
        { key: 'news', label: 'News Agent', desc: 'Recent headlines and sentiment analysis' },
        { key: 'rag', label: 'RAG Retrieval Node', desc: 'Retrieving filings context from Vector DB' },
        { key: 'risk', label: 'Risk Agent', desc: 'Risks, opportunities, moat analysis' },
        { key: 'decision', label: 'Decision Agent', desc: 'Final INVEST / PASS verdict' },
        { key: 'audit', label: 'Self-RAG Audit Agent', desc: 'Checking reasoning facts & figures for compliance' },
    ]

    function getStepIndex(key: string) {
        return AGENT_STEPS.findIndex(s => s.key === key)
    }

    // ── Load report from MongoDB via API ────────────────────────────────────────

    useEffect(() => {
        async function loadReport() {
            try {
                const res = await fetch(`/api/report?company=${encodeURIComponent(company)}`)
                if (!res.ok) throw new Error('Report not found')
                const data = await res.json()
                setReport(data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load report')
            } finally {
                setLoading(false)
            }
        }
        loadReport()
    }, [company])

    // ── Re-analyze ──────────────────────────────────────────────────────────────

    async function handleReanalyze() {
        setReanalyzing(true)
        setCompletedSteps([])
        setCurrentStep(AGENT_STEPS[0].key)
        setDecisionTokens('')
        setError('')

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company }),
            })

            if (!res.ok || !res.body) {
                throw new Error('Re-analysis request failed')
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        const eventName = line.replace('event:', '').trim()
                        const dataLine = lines[lines.indexOf(line) + 1] ?? ''
                        const jsonStr = dataLine.replace('data:', '').trim()

                        if (!jsonStr) continue

                        try {
                            const payload = JSON.parse(jsonStr)

                            if (eventName === 'start') {
                                setCurrentStep(AGENT_STEPS[0].key)
                            }

                            if (eventName === 'progress') {
                                const node = payload.node
                                setCompletedSteps(prev =>
                                    prev.includes(node) ? prev : [...prev, node]
                                )

                                const nextIndex = getStepIndex(node) + 1
                                if (nextIndex < AGENT_STEPS.length) {
                                    setCurrentStep(AGENT_STEPS[nextIndex].key)
                                } else {
                                    setCurrentStep(null)
                                }
                            }

                            if (eventName === 'token') {
                                const tokenPayload = payload as { token: string }
                                setDecisionTokens(prev => prev + tokenPayload.token)
                            }

                            if (eventName === 'complete') {
                                setCompletedSteps(AGENT_STEPS.map(s => s.key))
                                setCurrentStep(null)

                                // Align data fields to matching schema structure
                                const completeData: ReportData = {
                                    company: payload.company,
                                    verdict: payload.verdict,
                                    research: payload.research,
                                    financial: payload.financial,
                                    news: payload.news,
                                    risk: payload.risk,
                                    valuation: payload.valuation,
                                    error: payload.error ?? null,
                                }
                                setReport(completeData)
                                setReanalyzing(false)
                                return
                            }

                            if (eventName === 'error') {
                                throw new Error(payload.error ?? 'Re-analysis failed')
                            }

                        } catch {
                            continue
                        }
                    }
                }
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Re-analysis failed')
            setReanalyzing(false)
            setCurrentStep(null)
            setCompletedSteps([])
        }
    }

    // ── Loading state ────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Loading report…</p>
                </div>
            </main>
        )
    }

    // ── Error state ──────────────────────────────────────────────────────────────

    if (error || !report) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center max-w-sm">
                    <p className="text-sm font-medium text-gray-900 mb-2">Report not found</p>
                    <p className="text-sm text-gray-500 mb-4">{error}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Back to search
                    </button>
                </div>
            </main>
        )
    }

    const verdict = report.verdict ?? report.data?.verdict
    const research = report.research ?? report.researchData
    const financial = report.financial ?? report.financialData
    const news = report.news ?? report.newsData
    const risk = report.risk ?? report.riskData
    if (!verdict || !research || !financial || !news || !risk) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center max-w-sm">
                    <p className="text-sm font-medium text-gray-900 mb-2">Report data incomplete</p>
                    <p className="text-sm text-gray-500 mb-4">
                        Some agent data is missing. Please re-analyze the company.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => router.push('/')}
                            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            Back to search
                        </button>
                        <button
                            onClick={handleReanalyze}
                            className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Re-analyze
                        </button>
                    </div>
                </div>
            </main>
        )
    }

    const isInvest = verdict.decision === 'INVEST'
    const isPosPrice = financial.priceChangePct >= 0



    // ─── Render ─────────────────────────────────────────────────────────────────

    return (
        <main className="min-h-screen bg-gray-50">

            {/* ── Topbar ── */}
            <nav className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
                <button
                    onClick={() => router.push('/')}
                    className="text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1 flex-shrink-0"
                >
                    ← Back
                </button>
                <span className="text-gray-200">|</span>
                <span className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-xs" title={report.company}>
                    {report.company}
                </span>
                <div className="ml-auto flex gap-1.5">
                    <button
                        onClick={() => {
                            window.open(`/api/export?company=${encodeURIComponent(report.company)}`, '_blank')
                        }}
                        className="text-[11px] sm:text-xs px-2 py-1.5 sm:px-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
                    >
                        <span>📄</span>
                        <span className="hidden sm:inline">Export PDF</span>
                        <span className="inline sm:hidden">Export</span>
                    </button>
                    <button
                        onClick={handleReanalyze}
                        disabled={reanalyzing}
                        className="text-[11px] sm:text-xs px-2 py-1.5 sm:px-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors flex items-center gap-1"
                    >
                        {reanalyzing ? (
                            <span>Running…</span>
                        ) : (
                            <>
                                <span>↺</span>
                                <span className="hidden sm:inline">Re-analyze</span>
                                <span className="inline sm:hidden">Refresh</span>
                            </>
                        )}
                    </button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Column - Company Info, Verdict, Metrics, and Tab Navigation */}
                    <div className="lg:col-span-5 space-y-6">
                        
                        {/* Summary Card */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                            
                            {/* Company Name, Ticker, Exchange */}
                            <div className="mb-4">
                                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
                                    {report.company} · {financial.ticker ?? 'N/A'} · {financial.exchange ?? 'N/A'}
                                </p>
                                <div className="flex items-center gap-3">
                                    <span className={`text-4xl font-bold uppercase tracking-tight ${isInvest ? 'text-green-700' : 'text-red-700'}`}>
                                        {verdict.decision}
                                    </span>
                                </div>
                            </div>

                            {/* Confidence Level */}
                            <div className="mb-4">
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-gray-400 font-medium">Confidence</span>
                                    <span className="font-semibold text-gray-900">{verdict.confidence}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${isInvest ? 'bg-green-500' : 'bg-red-500'}`}
                                        style={{ width: `${verdict.confidence}%` }}
                                    />
                                </div>
                            </div>

                            {/* Investment Profile */}
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 font-medium">Rating</p>
                                    <p className="text-sm font-semibold text-gray-900">{verdict.analystRating}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 font-medium">Horizon</p>
                                    <p className="text-sm font-semibold text-gray-900">{verdict.horizon}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 font-medium">Technology</p>
                                    <p className="text-sm font-semibold text-gray-900">{research.sector ?? 'N/A'}</p>
                                </div>
                            </div>

                            <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                                Based on financials, news sentiment, and risk profile
                            </p>

                            {/* RAG Quality Indicator */}
                            {report.ragQuality && report.ragQuality.totalChunks > 0 ? (
                                <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-xs bg-gray-50 text-gray-600 border border-gray-100/50">
                                    <span>📊</span>
                                    <span className="font-medium">
                                        RAG: {report.ragQuality.totalChunks} chunks ({report.ragQuality.tables} tables, {report.ragQuality.footnotes} footnotes)
                                    </span>
                                    <span className="text-gray-400">·</span>
                                    <span className="font-mono">{report.ragQuality.sourcesUsed}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-xs bg-gray-50 text-gray-600 border border-gray-100/50">
                                    <span>📊</span>
                                    <span className="font-medium">
                                        RAG: 10 chunks (0 tables, 0 footnotes)
                                    </span>
                                    <span className="text-gray-400">·</span>
                                    <span>mongodb</span>
                                </div>
                            )}

                            {/* Key metrics grid (2-column sidebar layout) */}
                            <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-100">
                                <MetricCard
                                    label="Price"
                                    value={financial.currentPrice ?? 'N/A'}
                                    highlight={isPosPrice ? 'green' : 'red'}
                                />
                                <MetricCard
                                    label="Today"
                                    value={`${isPosPrice ? '+' : ''}${financial.priceChangePct ?? 0}%`}
                                    highlight={isPosPrice ? 'green' : 'red'}
                                />
                                <MetricCard label="Market cap" value={financial.marketCap ?? 'N/A'} />
                                <MetricCard label="P/E" value={financial.peRatio !== undefined ? `${financial.peRatio}×` : 'N/A'} />
                                <MetricCard label="Target" value={verdict.targetPrice ?? 'N/A'} />
                                <MetricCard
                                    label="Sentiment"
                                    value={news.sentiment ?? 'N/A'}
                                    highlight={
                                        news.sentiment === 'positive' ? 'green' :
                                            news.sentiment === 'negative' ? 'red' : undefined
                                    }
                                />
                            </div>
                        </div>

                    </div>

                    {/* Right Column - Tab Content Details */}
                    <div className="lg:col-span-7 space-y-4">
                        
                        {/* Horizontal Tab navigation for all screen widths */}
                        <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm flex flex-wrap gap-1.5 mb-4">
                            {TABS.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`
                                        text-xs px-3.5 py-2 rounded-lg font-medium transition-all cursor-pointer
                                        ${activeTab === tab
                                            ? 'bg-gray-900 text-white shadow-sm font-semibold'
                                            : 'text-gray-600 hover:bg-gray-50'}
                                    `}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[500px]">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <span>📋</span> {activeTab} Details
                                </h2>
                            </div>
                            
                            <div className="transition-all duration-300">
                                {activeTab === 'Overview' && <OverviewTab research={research} />}
                                {activeTab === 'Financials' && <FinancialsTab financial={financial} />}
                                {activeTab === 'Valuation' && <ValuationTab valuation={report.valuation ?? report.valuationData ?? (report as any).data?.valuation} />}
                                {activeTab === 'News' && <NewsTab news={news} />}
                                {activeTab === 'Risks' && <RisksTab risk={risk} />}
                                {activeTab === 'Decision' && <DecisionTab verdict={verdict} />}
                                {activeTab === 'SEC Sources' && <SecSourcesTab ragContext={report.ragContext} />}
                                {activeTab === 'Trend' && <TrendTab company={company} />}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Live agent re-analysis overlay tracker */}
            {reanalyzing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[3px] transition-all duration-300">
                    <div className="bg-white border border-gray-100 rounded-2xl p-6 max-w-md w-full shadow-2xl mx-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Re-analyzing {company}</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5">Please wait while the agents run</p>
                            </div>
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold animate-pulse">Live</span>
                        </div>

                        <div className="space-y-2 mb-5">
                            {AGENT_STEPS.map((step, idx) => {
                                const isDone = completedSteps.includes(step.key)
                                const isRunning = currentStep === step.key
                                const isQueued = !isDone && !isRunning

                                return (
                                    <div
                                        key={step.key}
                                        className={`
                                            flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-300
                                            ${isRunning ? 'bg-blue-50 border-blue-100 shadow-sm' : 'border-transparent'}
                                            ${isDone ? 'bg-green-50/50' : ''}
                                            ${isQueued ? 'bg-gray-50/50' : ''}
                                        `}
                                    >
                                        <div className={`
                                            w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                                            ${isDone ? 'bg-green-100 text-green-700' :
                                                isRunning ? 'bg-blue-100 text-blue-700 animate-pulse font-semibold' :
                                                    'bg-gray-100 text-gray-400'}
                                        `}>
                                            {isDone ? '✓' : isRunning ? '⟳' : idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-semibold ${isQueued ? 'text-gray-400' : 'text-gray-900'}`}>
                                                {step.label}
                                            </p>
                                            <p className={`text-[10px] mt-0.5 truncate ${isQueued ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {isRunning ? 'Analyzing data...' : isDone ? 'Completed' : step.desc}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gray-900 rounded-full transition-all duration-500"
                                style={{ width: `${(completedSteps.length / AGENT_STEPS.length) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] text-gray-400 font-medium">
                            <span>{completedSteps.length} of {AGENT_STEPS.length} complete</span>
                            <span>{Math.round((completedSteps.length / AGENT_STEPS.length) * 100)}%</span>
                        </div>

                        {/* SSE Token reasoning stream */}
                        {decisionTokens && (
                            <div className="mt-4 p-3 bg-gray-950 text-emerald-400 rounded-lg font-mono text-[10px] max-h-32 overflow-y-auto whitespace-pre-wrap border border-gray-800 shadow-inner">
                                <div className="text-gray-500 mb-1 border-b border-gray-800 pb-0.5 flex items-center justify-between select-none">
                                    <span>⚡ PM Reasoning Stream:</span>
                                    <span className="animate-pulse text-[8px] text-emerald-400">streaming</span>
                                </div>
                                {decisionTokens}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Interactive Q&A Chatbot widget */}
            <ReportChat company={company} />
        </main>
    )
}

function ReportChat({ company }: { company: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
        { role: 'assistant', content: `Hi! I'm StockSage Chat. Ask me anything about the investment report for ${company}.` }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function handleSend() {
        if (!input.trim() || loading) return

        const userMsg = { role: 'user' as const, content: input.trim() }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)
        setError('')

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company,
                    message: userMsg.content,
                    history: messages.filter(m => m.content !== `Hi! I'm StockSage Chat. Ask me anything about the investment report for ${company}.`)
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to get answer')
            }

            const data = await res.json()
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSend()
    }

    return (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-[calc(100vw-2rem)] sm:w-96 h-[400px] sm:h-[480px] flex flex-col mb-4 overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-gray-200">StockSage Q&A</p>
                            <p className="text-[10px] text-gray-400">Ask about {company} report</p>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-white text-sm"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 text-xs">
                        {messages.map((m, idx) => (
                            <div
                                key={idx}
                                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`
                                    max-w-[85%] rounded-xl px-3 py-2 leading-relaxed shadow-sm
                                    ${m.role === 'user'
                                        ? 'bg-gray-900 text-white rounded-br-none'
                                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}
                                `}>
                                    <p className="whitespace-pre-line">{m.content}</p>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-100 rounded-xl rounded-bl-none px-3 py-2 shadow-sm flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="p-2 bg-red-50 text-red-700 rounded border border-red-100 text-[10px]">
                                <span className="font-semibold">Error:</span> {error}
                            </div>
                        )}
                    </div>

                    {/* Input field */}
                    <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask a question about the report..."
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 transition-colors"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-12 h-12 rounded-full shadow-2xl flex items-center justify-center text-white text-lg font-semibold transition-all duration-300
                    ${isOpen ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-900 hover:bg-gray-800 hover:scale-105'}
                `}
            >
                {isOpen ? '✕' : '💬'}
            </button>
        </div>
    )
}
