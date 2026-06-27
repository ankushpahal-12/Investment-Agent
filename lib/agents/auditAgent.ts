import { AgentState } from '../../types'
import { advancedLLM } from '../llm'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'

const auditSchema = z.object({
    claimsAudit: z.array(z.object({
        claim: z.string().describe('The critical factual claim, metric, or calculation extracted from the reasoning.'),
        isSupported: z.boolean().describe('True if supported by RAG context or financials.'),
        contradiction: z.boolean().describe('True if the claim contradicts any of the retrieved data.')
    })).describe('Audit results for key claims.'),
    passesAudit: z.boolean().describe('Set to true if there are no hallucinations or factual contradictions. False if corrections are needed.'),
    correctionNotes: z.string().optional().describe('Clear instructions detailing what numbers, ratios, or claims need correction.')
})

export async function auditAgent(state: AgentState): Promise<Partial<AgentState>> {
    console.log(`Self-RAG Audit Agent starting for: ${state.company}`)

    const verdict = state.verdict
    const ragContext = state.ragContext ?? ''
    const financial = state.financialData

    if (!verdict) {
        console.log('Audit Agent: No verdict found to audit. Passing.')
        return { auditFeedback: undefined }
    }

    try {
        const structuredModel = advancedLLM.withStructuredOutput(auditSchema)
        const result = await structuredModel.invoke([
            new SystemMessage(`
You are a senior investment compliance auditor. Your job is to verify that the investment thesis reasoning and metrics match the retrieved RAG filing context and financial facts.
Highlight any hallucinations, mismatched numbers (e.g. WACC, P/E ratio, revenues), or claims unsupported by the documents.
Be extremely strict.
            `),
            new HumanMessage(`
Company: ${state.company}

═══ PROPOSED VERDICT REASONING ═══
Decision:      ${verdict.decision}
Analyst Rating: ${verdict.analystRating}
Target Price:   ${verdict.targetPrice}
Reasoning:     ${verdict.reasoning}
Key Metrics:   ${verdict.keyMetrics.join(', ')}

═══ RETRIEVED RAG CONTEXT ═══
${ragContext || 'No context retrieved.'}

═══ FINANCIAL METRICS ═══
Current Price: ${financial?.currentPrice ?? 'N/A'}
P/E Ratio:     ${financial?.peRatio ?? 'N/A'}
YoY Growth:    ${financial?.yoyGrowth ?? 'N/A'}%
Outstanding Shares: ${financial?.outstandingShares ?? 'N/A'}

Perform a detailed fact check. Return a structured pass/fail object.
            `)
        ]) as z.infer<typeof auditSchema>

        const currentCount = state.auditCount ?? 0

        if (!result.passesAudit) {
            console.warn(`⚠️ Audit FAILED on loop ${currentCount + 1}:`, result.correctionNotes)
            return {
                auditFeedback: result.correctionNotes ?? 'Factual mismatch identified.',
                auditCount: currentCount + 1
            }
        }

        console.log('✓ Audit PASSED successfully.')
        return {
            auditFeedback: undefined,
            auditCount: currentCount
        }

    } catch (err) {
        console.error('Audit Agent failed (non-critical, passing):', err)
        return { auditFeedback: undefined }
    }
}
