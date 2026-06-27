// types/index.ts

export interface ResearchData {
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

export interface FinancialData {
    ticker: string
    exchange: string
    currency: string
    currentPrice: string
    priceChange: string
    priceChangePct: number | null
    marketCap: string
    globalRank: string
    peRatio: number | null
    eps: number | null
    revenue: string
    profitMargin: number | null
    debtToEquity: number | null
    yoyGrowth: number | null
    high52Week: string
    low52Week: string
    dividendYield: string
    beta: number | null
    volume: string
    outstandingShares: string
    dataSource: string
    healthSummary: string
    valuationComment: string
    revenueComment: string
}

export interface NewsData {
    headlines: string[]
    sentiment: 'positive' | 'negative' | 'mixed'
    sentimentScore: number
    summary: string
    bullishPoints: string[]
    bearishPoints: string[]
    recentEvents: string[]
    mediaAttention: 'high' | 'medium' | 'low'
    newsVolume: string
    nlpScore?: number       // raw NLP score before LLM adjustment
    nlpAgreement?: boolean      // did LLM agree with NLP?
    positiveWords?: string[]     // finance keywords that drove positive score
    negativeWords?: string[]
}

export interface RiskData {
    risks: string[]
    opportunities: string[]
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH'
    riskScore: number
    macroRisks: string[]
    competitiveRisks: string[]
    financialRisks: string[]
    regulatoryRisks: string[]
    esgFlags: string[]
    moatStrength: 'STRONG' | 'MODERATE' | 'WEAK'
    moatComment: string
    // Spec-required category fields
    marketRisk?: string[]
    regulatoryRisk?: string[]
    competitionRisk?: string[]
    technologyRisk?: string[]
}

export interface Verdict {
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
    analystRating: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL'
    disclaimer: string
}

export interface ValuationData {
    intrinsicValue: number
    currentPrice: number
    valuationGapPct: number
    wacc: number
    revenueGrowthRate: number
    terminalGrowthRate: number
    assumptions: string
    formulaApplied: string
    baseFreeCashFlow?: number
    netDebt?: number
    sharesOutstanding?: number
}

export interface AgentState {
    company: string
    ticker?: string          // resolved stock ticker (set by Research Agent)
    researchData?: ResearchData
    financialData?: FinancialData
    newsData?: NewsData
    riskData?: RiskData
    valuationData?: ValuationData // DCF valuation model output
    verdict?: Verdict
    ragContext?: string       // retrieved RAG context (set by RAG node)
    ragQuality?: RAGQualityStats  // quality metrics for retrieved context
    auditFeedback?: string    // feedback notes for Self-RAG loop
    auditCount?: number       // self-correction loop counter
    error?: string
}

export interface RAGQualityStats {
    totalChunks: number
    tables: number
    footnotes: number
    textBlocks: number
    avgRelevanceScore: number
    queriesIssued: number
    sourcesUsed: 'chromadb' | 'mongodb' | 'in-memory' | 'none'
}