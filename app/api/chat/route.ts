import { NextRequest, NextResponse } from 'next/server'
import { getReportByCompany } from '../../../lib/mongodb'
import { ChatGroq } from '@langchain/groq'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'

const GROQ_API_KEY = (
    process.env.GROQ_API_KEY_DECISION ??
    process.env.GROQ_API_KEY_RESEARCH ??
    process.env.GROQ_API_KEY ??
    ''
)

const chatLLM = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: GROQ_API_KEY,
    temperature: 0.4,
})

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { company, message, history } = body

        if (!company || !message) {
            return NextResponse.json(
                { error: 'Company name and message are required' },
                { status: 400 }
            )
        }

        // 1. Fetch the latest report for the company
        const report = await getReportByCompany(company)
        if (!report) {
            return NextResponse.json(
                { error: `No report found for "${company}". Please analyze the company first.` },
                { status: 404 }
            )
        }

        // 2. Build LLM messages starting with the report context
        const verdict = (report.verdict ?? (report as any).data?.verdict) as any
        const research = (report.researchData ?? report.research) as any
        const financial = (report.financialData ?? report.financial) as any
        const news = (report.newsData ?? report.news) as any
        const risk = (report.riskData ?? report.risk) as any

        const systemPrompt = `
You are StockSage Chatbot, an expert financial research assistant.
You are helping the user with follow-up Q&A regarding the generated investment research report for "${company}".
Answer questions accurately, clearly, and concisely, referring directly to the structured report data below.
Do not make up facts. If the information is not in the report or cannot be inferred from it, use your general knowledge but clearly state that it is not explicitly in the generated agent report.

═══ INVESTMENT REPORT DATA FOR ${company} ═══
Ticker: ${financial?.ticker || 'N/A'}
Analyzed At: ${report.analyzedAt}
Decision Verdict: ${verdict?.decision || 'N/A'}
Analyst Rating: ${verdict?.analystRating || 'N/A'}
Confidence Level: ${verdict?.confidence || 0}%
Target Price: ${verdict?.targetPrice || 'N/A'}
Time Horizon: ${verdict?.horizon || 'N/A'}

COMPANY OVERVIEW:
- Sector: ${research?.sector || 'Unknown'}
- CEO: ${research?.CEO || 'Unknown'}
- Founded: ${research?.founded || 'Unknown'}
- Headquarters: ${research?.headquarters || 'Unknown'}
- Employees: ${research?.employeeCount || 'Unknown'}
- Business Model: ${research?.businessModel || 'Unknown'}
- Products/Services: ${JSON.stringify(research?.products || [])}
- Competitors: ${JSON.stringify(research?.competitors || [])}
- Key Strengths: ${JSON.stringify(research?.keyStrengths || [])}
- Overview: ${research?.overview || 'N/A'}

FINANCIAL METRICS:
- Price: ${financial?.currentPrice || 'N/A'} (Change: ${financial?.priceChange || 'N/A'} / ${financial?.priceChangePct || 0}%)
- Market Cap: ${financial?.marketCap || 'N/A'}
- Global Rank: ${financial?.globalRank || 'N/A'}
- P/E Ratio: ${financial?.peRatio || 'N/A'}
- EPS: ${financial?.eps || 'N/A'}
- Revenue: ${financial?.revenue || 'N/A'}
- Net Profit Margin: ${financial?.profitMargin || 'N/A'}%
- Debt to Equity: ${financial?.debtToEquity || 'N/A'}
- YoY Revenue Growth: ${financial?.yoyGrowth || 'N/A'}%
- Beta: ${financial?.beta || 'N/A'}
- Dividend Yield: ${financial?.dividendYield || 'N/A'}
- 52W Range: High ${financial?.high52Week || 'N/A'} / Low ${financial?.low52Week || 'N/A'}
- Financial Health: ${financial?.healthSummary || 'N/A'}
- Valuation Comment: ${financial?.valuationComment || 'N/A'}
- Revenue Comment: ${financial?.revenueComment || 'N/A'}

NEWS SENTIMENT:
- Sentiment: ${news?.sentiment || 'mixed'} (Score: ${news?.sentimentScore || 0}/100)
- Summary: ${news?.summary || 'N/A'}
- Bullish Signals: ${JSON.stringify(news?.bullishPoints || [])}
- Bearish Signals: ${JSON.stringify(news?.bearishPoints || [])}
- Top Headlines: ${JSON.stringify(news?.headlines || [])}

RISK ASSESSMENT:
- Risk Level: ${risk?.riskLevel || 'N/A'} (Score: ${risk?.riskScore || 50}/100)
- Moat: ${risk?.moatStrength || 'N/A'} (${risk?.moatComment || 'N/A'})
- Key Risks: ${JSON.stringify(risk?.risks || [])}
- Macro Risks: ${JSON.stringify(risk?.macroRisks || [])}
- Competitive Risks: ${JSON.stringify(risk?.competitiveRisks || [])}
- ESG Flags: ${JSON.stringify(risk?.esgFlags || [])}
- Opportunities: ${JSON.stringify(risk?.opportunities || [])}

DECISION REASONING:
- Reasoning: ${verdict?.reasoning || 'N/A'}
- Bull Case: ${verdict?.bullCase || 'N/A'}
- Bear Case: ${verdict?.bearCase || 'N/A'}
- Key Metrics Driving Decision: ${JSON.stringify(verdict?.keyMetrics || [])}
- Watchlist Items: ${JSON.stringify(verdict?.watchlist || [])}
- Alternative Pick: ${verdict?.alternativePick || 'None'}
`.trim()

        const messages = [
            new SystemMessage(systemPrompt),
            ...(history || []).map((h: any) => {
                if (h.role === 'user') {
                    return new HumanMessage(h.content)
                } else {
                    return new AIMessage(h.content)
                }
            }),
            new HumanMessage(message)
        ]

        // 3. Call LLM
        const response = await chatLLM.invoke(messages)
        const reply = response.content.toString().trim()

        return NextResponse.json({ reply })

    } catch (error) {
        console.error('Error in /api/chat:', error)
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
