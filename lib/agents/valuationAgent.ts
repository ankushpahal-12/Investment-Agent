import { AgentState, ValuationData } from '../../types'
import { advancedLLM } from '../llm'
import { retrieveRelevantContext } from '../rag/vectorStore'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'

const dcfProjectionSchema = z.object({
    baseFreeCashFlow: z.number().describe('The base Free Cash Flow (FCF) for Year 0 in millions USD (e.g., if FCF is $15B, enter 15000).'),
    wacc: z.number().describe('The Weighted Average Cost of Capital (WACC) to use as discount rate as a decimal (e.g. 0.095 for 9.5%). Range: 0.05 to 0.20.'),
    growthRate: z.number().describe('The estimated annual FCF growth rate for the next 5 years (Years 1-5) as a decimal (e.g. 0.07 for 7%).'),
    terminalGrowthRate: z.number().describe('The terminal growth rate as a decimal (typically between 0.02 and 0.03, e.g. 0.025 for 2.5%).'),
    netDebt: z.number().describe('The company\'s net debt (Total Debt minus Cash & Equivalents) in millions USD. Use 0 if cash exceeds debt or not found.'),
    sharesOutstanding: z.number().describe('The number of outstanding shares in millions (e.g., if 5 billion shares, enter 5000). Look at outstandingShares or estimate from financial context.'),
    assumptions: z.string().describe('Explain the rationale for the selected growth rate, WACC, and cash flow base, citing retrieved footnotes or metrics.')
})

export async function valuationAgent(state: AgentState): Promise<Partial<AgentState>> {
    console.log(`Valuation Agent starting for: ${state.company}`)

    try {
        const financial = state.financialData
        const ticker = state.ticker ?? 'N/A'

        // 1. Retrieve targeted capital structure and free cash flow history from filings
        const ragQuery = `${state.company} free cash flow capital expenditures debt covenants cash balance WACC interest expense`
        const ragResult = await retrieveRelevantContext(ragQuery, state.company, 3)

        // 2. Derive defaults from rule-based financial agent if available
        const outstandingSharesText = financial?.outstandingShares ?? 'N/A'
        let parsedOutstandingShares = 0
        if (outstandingSharesText.endsWith('B')) {
            parsedOutstandingShares = parseFloat(outstandingSharesText.slice(0, -1)) * 1000
        } else if (outstandingSharesText.endsWith('M')) {
            parsedOutstandingShares = parseFloat(outstandingSharesText.slice(0, -1))
        }

        const currentPriceText = financial?.currentPrice?.replace(/[^0-9.]/g, '') ?? '0'
        const currentPrice = parseFloat(currentPriceText)

        // 3. Invoke LLM to project DCF parameters
        const structuredModel = advancedLLM.withStructuredOutput(dcfProjectionSchema)
        const projections = await structuredModel.invoke([
            new SystemMessage(`
You are an expert valuation analyst. Your job is to read a company's financial stats and RAG footnotes to extract or project inputs for a Discounted Cash Flow (DCF) model.
Be conservative and realistic. Growth rates must be consistent with the company's size, sector, and YoY revenue growth.
            `),
            new HumanMessage(`
Company: ${state.company} (Ticker: ${ticker})

═══ FINANCIAL METRICS FROM API ═══
Current Share Price: ${financial?.currentPrice ?? 'N/A'}
Market Cap:          ${financial?.marketCap ?? 'N/A'}
Revenue (TTM):       ${financial?.revenue ?? 'N/A'}
YoY Growth:          ${financial?.yoyGrowth ?? 'N/A'}%
Profit Margin:       ${financial?.profitMargin ?? 'N/A'}%
Debt to Equity:      ${financial?.debtToEquity ?? 'N/A'}
Shares Outstanding:  ${outstandingSharesText}

═══ FILING FOOTNOTES CONTEXT ═══
${ragResult.text || 'No filing details retrieved.'}

Extract or estimate:
1. Base Free Cash Flow (Year 0 FCF in millions USD)
2. WACC (as decimal, e.g. 0.09)
3. FCF growth rate for years 1-5 (as decimal, e.g. 0.065)
4. Terminal growth rate (as decimal, e.g. 0.02)
5. Net Debt (in millions USD)
6. Outstanding shares (in millions, default: ${parsedOutstandingShares > 0 ? parsedOutstandingShares : '1000'})
            `)
        ]) as z.infer<typeof dcfProjectionSchema>

        // 4. Mathematical DCF model execution (deterministic)
        const baseFCF = projections.baseFreeCashFlow
        const w = projections.wacc
        const g = projections.growthRate
        const tg = projections.terminalGrowthRate
        const netDebt = projections.netDebt
        const shares = projections.sharesOutstanding || parsedOutstandingShares || 1000

        // Year 1-5 FCF projections & PV calculation
        const fcf: number[] = []
        let pvOfCashFlows = 0
        for (let t = 1; t <= 5; t++) {
            const projectedFCF = baseFCF * Math.pow(1 + g, t)
            fcf.push(projectedFCF)
            pvOfCashFlows += projectedFCF / Math.pow(1 + w, t)
        }

        // Terminal value & PV
        const terminalValue = (fcf[4] * (1 + tg)) / (w - tg)
        const pvOfTerminalValue = terminalValue / Math.pow(1 + w, 5)

        // Intrinsic equity value & share price
        const enterpriseValue = pvOfCashFlows + pvOfTerminalValue
        const equityValue = enterpriseValue - netDebt
        const intrinsicValueRaw = shares > 0 ? (equityValue / shares) : 0
        const intrinsicValue = Math.round(intrinsicValueRaw * 100) / 100

        // Valuation gap percentage
        const valuationGapPct = currentPrice > 0
            ? Math.round(((intrinsicValue - currentPrice) / currentPrice) * 100)
            : 0

        const formulaApplied = `
Enterprise Value = [Sum of Projected FCF (Years 1-5) / (1 + WACC)^t] + [Terminal Value / (1 + WACC)^5]
Where Terminal Value = [FCF_5 * (1 + Terminal Growth)] / [WACC - Terminal Growth]
Share Price = [Enterprise Value - Net Debt] / Shares Outstanding
        `.trim()

        const valuationData: ValuationData = {
            intrinsicValue,
            currentPrice,
            valuationGapPct,
            wacc: Math.round(w * 1000) / 10,
            revenueGrowthRate: Math.round(g * 1000) / 10,
            terminalGrowthRate: Math.round(tg * 1000) / 10,
            assumptions: projections.assumptions,
            formulaApplied,
            baseFreeCashFlow: baseFCF,
            netDebt,
            sharesOutstanding: shares
        }

        console.log(`Valuation Agent done — Intrinsic Share Price: $${intrinsicValue} vs Current Price: $${currentPrice} (Gap: ${valuationGapPct}%)`)
        return { valuationData, error: undefined }

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Valuation Agent failed:', message)

        return {
            valuationData: {
                intrinsicValue: 0,
                currentPrice: 0,
                valuationGapPct: 0,
                wacc: 0,
                revenueGrowthRate: 0,
                terminalGrowthRate: 0,
                assumptions: 'Valuation calculation unavailable due to system error.',
                formulaApplied: 'DCF valuation model failed to execute.'
            },
            error: `Valuation Agent: ${message}`
        }
    }
}
