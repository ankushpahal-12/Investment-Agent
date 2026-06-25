// ─── Decision Agent ───────────────────────────────────────────────────────────
// THE ONLY AGENT THAT CALLS THE LLM (Groq)
// Receives outputs from all other agents + RAG context
// Generates final INVEST / PASS recommendation

import { ChatGroq } from '@langchain/groq'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { AgentState, Verdict } from '../../types'
import { retrieveRelevantContext } from '../rag/vectorStore'

// ─── LLM (Decision Agent only) ────────────────────────────────────────────────

const GROQ_API_KEY = (
    process.env.GROQ_API_KEY_DECISION ??
    process.env.GROQ_API_KEY_RESEARCH ??
    process.env.GROQ_API_KEY ??
    ''
)

if (!GROQ_API_KEY) {
    console.warn('⚠️  No Groq API key found for Decision Agent')
}

const llm = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: GROQ_API_KEY,
    temperature: 0.2,
})

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function decisionAgent(
    state: AgentState
): Promise<Partial<AgentState>> {

    console.log(`Decision Agent starting for: ${state.company}`)

    try {
        const research = state.researchData
        const financial = state.financialData
        const news = state.newsData
        const risk = state.riskData
        const riskExtended = risk as typeof risk & {
            marketRisk?: string[]
            regulatoryRisk?: string[]
            competitionRisk?: string[]
            technologyRisk?: string[]
        }

        // ── Retrieve RAG context ──────────────────────────────────────────────
        const ragQuery = `${state.company} investment analysis financial performance risks opportunities`
        const ragContext = await retrieveRelevantContext(ragQuery, state.company, 5)

        // ── THE ONLY LLM CALL IN THE ENTIRE PIPELINE ─────────────────────────
        const response = await llm.invoke([
            new SystemMessage(`
You are a senior portfolio manager at a top investment firm with 20 years of experience.
You make final investment decisions based on structured data from multiple specialized agents.
Your decision must be evidence-based, realistic, and honest.
You are not always bullish — you say PASS when the data supports it.
Respond in valid JSON only — no markdown, no extra text, no commentary.
`),
            new HumanMessage(`
Company: ${state.company}

═══ COMPANY RESEARCH ═══
Overview:       ${research?.overview ?? 'N/A'}
Sector:         ${research?.sector ?? 'N/A'}
Business Model: ${research?.businessModel ?? 'N/A'}
Key Strengths:  ${research?.keyStrengths?.join(', ') ?? 'N/A'}
Headquarters:   ${research?.headquarters ?? 'N/A'}

═══ FINANCIAL METRICS (Finnhub) ═══
Ticker:         ${financial?.ticker ?? 'N/A'}
Current Price:  ${financial?.currentPrice ?? 'N/A'}
Price Change:   ${financial?.priceChange ?? 'N/A'} (${financial?.priceChangePct ?? 0}%)
Market Cap:     ${financial?.marketCap ?? 'N/A'}
Global Rank:    ${financial?.globalRank ?? 'N/A'}
P/E Ratio:      ${financial?.peRatio ?? 'N/A'}
EPS:            ${financial?.eps ?? 'N/A'}
Revenue:        ${financial?.revenue ?? 'N/A'}
YoY Growth:     ${financial?.yoyGrowth ?? 'N/A'}%
Profit Margin:  ${financial?.profitMargin ?? 'N/A'}%
Debt/Equity:    ${financial?.debtToEquity ?? 'N/A'}
Beta:           ${financial?.beta ?? 'N/A'}
52W High:       ${financial?.high52Week ?? 'N/A'}
52W Low:        ${financial?.low52Week ?? 'N/A'}
Health:         ${financial?.healthSummary ?? 'N/A'}
Valuation:      ${financial?.valuationComment ?? 'N/A'}

═══ NEWS & SENTIMENT (NewsAPI + Finnhub) ═══
Sentiment:      ${news?.sentiment ?? 'N/A'}
Score:          ${news?.sentimentScore ?? 0}/100
Media:          ${news?.mediaAttention ?? 'N/A'}
Volume:         ${news?.newsVolume ?? 'N/A'}
Summary:        ${news?.summary ?? 'N/A'}
Bullish:        ${news?.bullishPoints?.slice(0, 2).join(' | ') ?? 'N/A'}
Bearish:        ${news?.bearishPoints?.slice(0, 2).join(' | ') ?? 'N/A'}
Recent Events:  ${news?.recentEvents?.slice(0, 3).join(' | ') ?? 'N/A'}

═══ RISK ASSESSMENT (Rule-Based) ═══
Risk Level:     ${risk?.riskLevel ?? 'N/A'}
Risk Score:     ${risk?.riskScore ?? 50}/100
Moat:           ${risk?.moatStrength ?? 'N/A'} — ${risk?.moatComment ?? 'N/A'}
Market Risks:   ${riskExtended?.marketRisk?.slice(0, 2).join('; ') ?? risk?.macroRisks?.slice(0, 2).join('; ') ?? 'N/A'}
Regulatory:     ${riskExtended?.regulatoryRisk?.slice(0, 2).join('; ') ?? risk?.regulatoryRisks?.slice(0, 2).join('; ') ?? 'N/A'}
Competition:    ${riskExtended?.competitionRisk?.slice(0, 2).join('; ') ?? risk?.competitiveRisks?.slice(0, 2).join('; ') ?? 'N/A'}
Technology:     ${riskExtended?.technologyRisk?.slice(0, 2).join('; ') ?? 'N/A'}
Opportunities:  ${risk?.opportunities?.slice(0, 2).join('; ') ?? 'N/A'}

═══ RAG CONTEXT (Retrieved Documents) ═══
${ragContext || 'No additional context retrieved.'}

NOTE: If the RAG context above contains SEC filing sections (10-K/10-Q footnotes,
tables, or legal disclosures), pay special attention to:
  - Debt covenants, borrowing restrictions, and credit facility terms
  - Pending lawsuits, litigation contingencies, and legal proceedings
  - Revenue breakdowns by segment or geography
  - Goodwill impairments or asset write-downs
  - Management's forward-looking guidance and outlook
Cite specific SEC filing details in your reasoning when available.

Based on ALL the above structured data, make a final investment decision.
Return this EXACT JSON (no other text):
{
  "decision":        "INVEST" or "PASS",
  "confidence":      number 0-100,
  "horizon":         "short-term (0-6 months)" or "medium-term (6-18 months)" or "long-term (2-5 years)",
  "targetPrice":     "estimated target price with currency e.g. $210 or N/A",
  "reasoning":       "3-4 sentence detailed reasoning citing specific data points from the above including SEC filing footnotes if available",
  "bullCase":        "1 sentence best case scenario",
  "bearCase":        "1 sentence worst case scenario",
  "keyMetrics":      ["3 most important metrics that drove this decision"],
  "watchlist":       ["2-3 things to monitor going forward"],
  "alternativePick": "name of a better alternative company if PASS, or null if INVEST",
  "analystRating":   "STRONG BUY" or "BUY" or "HOLD" or "SELL" or "STRONG SELL",
  "disclaimer":      "This is AI-generated analysis for educational purposes only. Not financial advice."
}

Confidence scoring:
90-100 = Extremely confident, very strong data alignment
70-89  = Confident, good data with minor gaps
50-69  = Moderate confidence, mixed signals
30-49  = Low confidence, significant uncertainty
0-29   = Very low, insufficient data
`),
        ])

        const text = response.content.toString().trim()
        const clean = text.replace(/```json|```/g, '').trim()
        const data = JSON.parse(clean) as Verdict

        console.log(`Decision Agent done — ${data.decision} (${data.confidence}% confidence) | ${data.analystRating}`)

        return { verdict: data, error: undefined }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Decision Agent failed:', message)

        return {
            verdict: {
                decision: 'PASS',
                confidence: 0,
                horizon: 'N/A',
                targetPrice: 'N/A',
                reasoning: `Decision analysis unavailable: ${message}`,
                bullCase: 'N/A',
                bearCase: 'N/A',
                keyMetrics: [],
                watchlist: [],
                alternativePick: null,
                analystRating: 'HOLD',
                disclaimer: 'This is AI-generated analysis for educational purposes only.',
            },
            error: `Decision Agent: ${message}`,
        }
    }
}