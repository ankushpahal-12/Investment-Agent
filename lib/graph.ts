import { StateGraph, Annotation } from '@langchain/langgraph'
import {
    AgentState, ResearchData, FinancialData, NewsData, RiskData, Verdict, RAGQualityStats, ValuationData
} from '../types'
import { researchAgent } from './agents/researchAgent'
import { financialAgent } from './agents/financialAgent'
import { newsAgent } from './agents/newsAgent'
import { riskAgent } from './agents/riskAgent'
import { decisionAgent } from './agents/decisionAgent'
import { validationAgent } from './agents/validationAgent'
import { valuationAgent } from './agents/valuationAgent'
import { auditAgent } from './agents/auditAgent'
import { retrieveRelevantContext, retrieveSECContext } from './rag/vectorStore'

// ─── State schema ─────────────────────────────────────────────────────────────

const GraphState = Annotation.Root({
    company: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => '',
    }),
    ticker: Annotation<string | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    researchData: Annotation<ResearchData | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    financialData: Annotation<FinancialData | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    newsData: Annotation<NewsData | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    riskData: Annotation<RiskData | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    verdict: Annotation<Verdict | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    ragContext: Annotation<string | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    ragQuality: Annotation<RAGQualityStats | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    valuationData: Annotation<ValuationData | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    auditFeedback: Annotation<string | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
    auditCount: Annotation<number | undefined>({
        reducer: (x, y) => y ?? x ?? 0,
        default: () => 0,
    }),
    error: Annotation<string | undefined>({
        reducer: (_, y) => y,
        default: () => undefined,
    }),
})

type GraphStateType = typeof GraphState.State

// ─── Validation node ──────────────────────────────────────────────────────────
// First node — validates company name resolves to a real ticker. Fails fast.

async function validationNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const result = await validationAgent(state as AgentState)
    return result as Partial<GraphStateType>
}

// ─── RAG node ─────────────────────────────────────────────────────────────────
// Runs after news agent — retrieves general + SEC-specific context before decision

async function ragNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log(`RAG Node: retrieving context for ${state.company}`)
    try {
        // 1. General investment context
        const generalQuery = `${state.company} investment financial performance risk sector`
        const generalResult = await retrieveRelevantContext(generalQuery, state.company, 5)

        // 2. Targeted SEC filing context (debt covenants, litigation, revenue segments, etc.)
        const secResult = await retrieveSECContext(state.company)

        // Merge both contexts with clear section headers
        const sections: string[] = []
        if (generalResult.text) {
            sections.push(`[GENERAL CONTEXT]\n${generalResult.text}`)
        }
        if (secResult.text) {
            sections.push(`[SEC FILING CONTEXT — 10-K/10-Q Footnotes & Tables]\n${secResult.text}`)
        }

        const ragContext = sections.join('\n\n════════════════════════════════\n\n')

        // Build RAG quality stats
        const ragQuality: RAGQualityStats = {
            totalChunks: generalResult.chunksRetrieved + secResult.chunksRetrieved,
            tables: generalResult.tables + secResult.tables,
            footnotes: generalResult.footnotes + secResult.footnotes,
            textBlocks: generalResult.textBlocks + secResult.textBlocks,
            avgRelevanceScore: ragContext.length > 0 ? 0.75 : 0,  // approximate
            queriesIssued: 1 + 5,  // 1 general + 5 SEC topics
            sourcesUsed: secResult.sourcesUsed !== 'none' ? secResult.sourcesUsed : generalResult.sourcesUsed,
        }

        console.log(`RAG Node: retrieved ${ragContext.length} chars | ${ragQuality.totalChunks} chunks (${ragQuality.tables} tables, ${ragQuality.footnotes} footnotes) via ${ragQuality.sourcesUsed}`)
        return { ragContext, ragQuality }
    } catch (err) {
        console.warn('RAG Node failed:', err)
        return {
            ragContext: '',
            ragQuality: { totalChunks: 0, tables: 0, footnotes: 0, textBlocks: 0, avgRelevanceScore: 0, queriesIssued: 0, sourcesUsed: 'none' },
        }
    }
}

// ─── Build graph ──────────────────────────────────────────────────────────────
// Flow: validation → research → financial → valuation → news → rag → risk → decision → audit

function buildGraph() {
    const workflow = new StateGraph(GraphState)

    workflow.addNode('validation', validationNode)
    workflow.addNode('research', researchAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)
    workflow.addNode('financial', financialAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)
    workflow.addNode('valuation', valuationAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)
    workflow.addNode('news', newsAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)
    workflow.addNode('rag', ragNode)
    workflow.addNode('risk', riskAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)
    workflow.addNode('decision', decisionAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)
    workflow.addNode('audit', auditAgent as (s: GraphStateType) => Promise<Partial<GraphStateType>>)

    const g = workflow as unknown as {
        addEdge: (from: string, to: string) => void
        addConditionalEdges: (from: string, fn: (s: GraphStateType) => string) => void
    }

    g.addEdge('__start__', 'validation')

    // Conditional: if validation found an error, skip to end
    g.addConditionalEdges('validation', (state: GraphStateType) => {
        if (state.error) {
            console.log(`Validation failed: ${state.error}. Skipping pipeline.`)
            return '__end__'
        }
        return 'research'
    })

    g.addEdge('research', 'financial')
    g.addEdge('financial', 'valuation')
    g.addEdge('valuation', 'news')
    g.addEdge('news', 'rag')
    g.addEdge('rag', 'risk')
    g.addEdge('risk', 'decision')
    g.addEdge('decision', 'audit')

    g.addConditionalEdges('audit', (state: GraphStateType) => {
        if (state.auditFeedback && (state.auditCount ?? 0) < 2) {
            console.log(`Self-RAG: Audit failed. Retrying decision agent with feedback (Loop: ${state.auditCount}/2)`)
            return 'decision'
        }
        return '__end__'
    })

    return workflow.compile()
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let compiledGraph: ReturnType<typeof buildGraph> | null = null

function getGraph() {
    if (!compiledGraph) {
        compiledGraph = buildGraph()
        console.log('LangGraph compiled — flow: validation → research → financial → valuation → news → rag → risk → decision → audit')
    }
    return compiledGraph
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runInvestmentAnalysis(
    company: string,
    onProgress?: (step: string, data?: unknown) => void,
    onToken?: (token: string) => void
): Promise<AgentState> {

    if (!company?.trim()) {
        throw new Error('Company name cannot be empty')
    }

    const graph = getGraph()
    const companyClean = company.trim()

    console.log(`\n${'═'.repeat(55)}`)
    console.log(`Starting analysis for: ${companyClean}`)
    console.log(`${'═'.repeat(55)}\n`)

    const initialState: GraphStateType = {
        company: companyClean,
        ticker: undefined,
        researchData: undefined,
        financialData: undefined,
        valuationData: undefined,
        newsData: undefined,
        riskData: undefined,
        verdict: undefined,
        ragContext: undefined,
        ragQuality: undefined,
        auditFeedback: undefined,
        auditCount: 0,
        error: undefined,
    }

    let finalState: AgentState = { company: companyClean }

    try {
        const stream = await graph.stream(initialState, {
            streamMode: 'updates',
            configurable: { onToken }
        })

        for await (const update of stream) {
            const updateRecord = update as Record<string, Partial<AgentState>>
            const nodeName = Object.keys(updateRecord)[0]
            const nodeData = updateRecord[nodeName]

            finalState = { ...finalState, ...nodeData }
            console.log(`✓ Node completed: ${nodeName}`)

            if (onProgress) {
                onProgress(nodeName, nodeData)
            }

            // If validation failed, stop early
            if (nodeName === 'validation' && finalState.error) {
                console.log(`⛔ Validation failed — aborting pipeline`)
                return {
                    ...finalState,
                    verdict: {
                        decision: 'PASS',
                        confidence: 0,
                        horizon: 'N/A',
                        targetPrice: 'N/A',
                        reasoning: finalState.error,
                        bullCase: 'N/A',
                        bearCase: 'N/A',
                        keyMetrics: [],
                        watchlist: [],
                        alternativePick: null,
                        analystRating: 'HOLD',
                        disclaimer: 'This is AI-generated analysis for educational purposes only.',
                    },
                }
            }
        }

        console.log(`\n${'═'.repeat(55)}`)
        console.log(`Done: ${finalState.verdict?.decision} (${finalState.verdict?.confidence}% confidence)`)
        console.log(`${'═'.repeat(55)}\n`)

        return finalState

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Graph execution failed:', message)

        return {
            ...finalState,
            error: `Graph failed: ${message}`,
            verdict: finalState.verdict ?? {
                decision: 'PASS',
                confidence: 0,
                horizon: 'N/A',
                targetPrice: 'N/A',
                reasoning: `Analysis failed: ${message}`,
                bullCase: 'N/A',
                bearCase: 'N/A',
                keyMetrics: [],
                watchlist: [],
                alternativePick: null,
                analystRating: 'HOLD',
                disclaimer: 'This is AI-generated analysis for educational purposes only.',
            },
        }
    }
}