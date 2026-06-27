// ─── Decision Agent ───────────────────────────────────────────────────────────
// THE ONLY AGENT THAT CALLS THE LLM (Groq)
// Receives outputs from all other agents + RAG context
// Generates final INVEST / PASS recommendation

import { ChatGroq } from '@langchain/groq'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { AgentState, Verdict } from '../../types'
import { retrieveRelevantContext } from '../rag/vectorStore'
import { z } from 'zod'
import { RunnableConfig } from '@langchain/core/runnables'

const verdictSchema = z.object({
    decision: z.enum(['INVEST', 'PASS']).describe('Final investment decision.'),
    confidence: z.number().min(0).max(100).describe('Confidence score from 0 to 100.'),
    horizon: z.string().describe('Investment time horizon (e.g. short-term, medium-term, long-term or N/A).'),
    targetPrice: z.string().describe('Estimated target price with currency or N/A.'),
    reasoning: z.string().describe('Detailed reasoning citing specific metrics/facts, including SEC details if available.'),
    bullCase: z.string().describe('Best case scenario.'),
    bearCase: z.string().describe('Worst case scenario.'),
    keyMetrics: z.array(z.string()).describe('List of key metrics that drove the decision.'),
    watchlist: z.array(z.string()).describe('List of watchlist items.'),
    alternativePick: z.string().nullable().describe('Better alternative if PASS, or null if INVEST.'),
    analystRating: z.enum(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL']).describe('Overall analyst recommendation.'),
    disclaimer: z.string().describe('Standard AI disclaimer.')
})

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
    state: AgentState,
    config?: RunnableConfig
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

        const ragContext = state.ragContext ?? ''
        const auditFeedback = state.auditFeedback

        // ── THE ONLY LLM CALL IN THE ENTIRE PIPELINE ─────────────────────────
        const onToken = config?.configurable?.onToken
        const structuredModel = llm.withStructuredOutput(verdictSchema)
        const data = await structuredModel.invoke([
            new SystemMessage(`
You are a senior portfolio manager at a top investment firm with 20 years of experience.
You make final investment decisions based on structured data from multiple specialized agents.
Your decision must be evidence-based, realistic, and honest.
You are not always bullish — you say PASS when the data supports it.
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

${auditFeedback ? `
═══ PREVIOUS AUDIT CORRECTION FEEDBACK ═══
Compliance Audit failed on previous draft. Please correct these factual mismatches in this new draft:
${auditFeedback}
` : ''}

Based on ALL the above structured data, make a final investment decision.
`)
        ], {
            callbacks: onToken ? [{
                handleLLMNewToken(token: string) {
                    onToken(token)
                }
            }] : undefined
        }) as Verdict

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