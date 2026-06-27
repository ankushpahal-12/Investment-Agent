// ─── Research Agent ───────────────────────────────────────────────────────────
// Data sources: Finnhub Company Profile + Wikipedia API + Tavily Search + LLM Extraction
// RAG documents are ingested here for later retrieval by Decision Agent

import { AgentState, ResearchData } from '../../types'
import {
    resolveTicker,
    getCompanyProfile,
    FinnhubProfile,
} from '../tools/finnhub'
import {
    addDocumentsToRAG,
    buildCompanyProfileDoc,
} from '../rag/vectorStore'
import { searchCompanyOverview } from '../tools/tavilySearch'
import { ChatGroq } from '@langchain/groq'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'

const GROQ_API_KEY = (
    process.env.GROQ_API_KEY_RESEARCH ??
    process.env.GROQ_API_KEY_DECISION ??
    process.env.GROQ_API_KEY ??
    ''
)

const researchLLM = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: GROQ_API_KEY,
    temperature: 0.1,
})

const researchSchema = z.object({
    overview: z.string().describe('A concise 3-4 sentence business overview of the company.'),
    sector: z.string().describe('The primary sector/industry of the company (e.g., Technology, Financials, Healthcare).'),
    CEO: z.string().describe('The full name of the current CEO.'),
    founded: z.string().describe('The founding year (e.g., "1981").'),
    headquarters: z.string().describe('The headquarters location city and country (e.g., "Bangalore, India").'),
    products: z.array(z.string()).describe('An array of the main products or services.'),
    competitors: z.array(z.string()).describe('An array of 3-4 key direct competitors.'),
    businessModel: z.string().describe('A 1-2 sentence description of how the company generates revenue.'),
    employeeCount: z.string().describe('The approximate number of employees.'),
    keyStrengths: z.array(z.string()).describe('An array of 3-4 core strengths or competitive advantages.')
})

// ─── Wikipedia API ────────────────────────────────────────────────────────────

async function fetchWikipediaSummary(companyName: string): Promise<string> {
    try {
        // Try exact match first, then search
        const search = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`,
            { next: { revalidate: 86400 } }
        )
        if (search.ok) {
            const data = await search.json()
            if (data.extract) return data.extract.slice(0, 1500)
        }

        // Fall back to search
        const searchRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(companyName + ' company')}&format=json&srlimit=1`,
            { next: { revalidate: 86400 } }
        )
        if (!searchRes.ok) return ''
        const searchData = await searchRes.json()
        const title = searchData?.query?.search?.[0]?.title
        if (!title) return ''

        const pageRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
            { next: { revalidate: 86400 } }
        )
        if (!pageRes.ok) return ''
        const pageData = await pageRes.json()
        return pageData.extract?.slice(0, 1500) ?? ''
    } catch {
        return ''
    }
}

// ─── Build ResearchData from Finnhub profile ──────────────────────────────────

function buildResearchData(
    companyName: string,
    profile: FinnhubProfile | null,
    wikiSummary: string
): ResearchData {
    const overview = wikiSummary
        ? wikiSummary.split('. ').slice(0, 3).join('. ') + '.'
        : profile
            ? `${profile.name} is a ${profile.finnhubIndustry} company listed on ${profile.exchange}.`
            : `${companyName} — research data limited.`

    // Determine sector
    const sector = profile?.finnhubIndustry ?? profile?.sector ?? 'Unknown'

    // Derive business model from industry
    const industryModelMap: Record<string, string> = {
        'Technology': 'Generates revenue through software licenses, subscriptions, and technology services.',
        'Banks': 'Earns through interest income, fees, and financial services.',
        'Software': 'SaaS subscription model with enterprise and consumer licensing.',
        'Retail': 'Sells products directly to consumers through physical and online channels.',
        'Pharmaceuticals': 'Develops and commercializes drugs, earning through sales and licensing.',
        'Oil & Gas': 'Extracts, refines, and sells petroleum products.',
        'Automobiles': 'Designs, manufactures, and sells vehicles and automotive components.',
        'Healthcare': 'Provides medical services, insurance, and healthcare products.',
        'Financial Services': 'Offers investment, insurance, and financial advisory services.',
    }

    const industryKey = Object.keys(industryModelMap).find(k =>
        sector.toLowerCase().includes(k.toLowerCase())
    )
    const businessModel = industryModelMap[industryKey ?? ''] ?? `Generates revenue through its core ${sector.toLowerCase()} operations.`

    return {
        overview,
        sector,
        CEO: 'See company website',
        founded: profile?.ipo ? `Listed: ${profile.ipo.slice(0, 4)}` : 'N/A',
        headquarters: profile?.country ?? 'N/A',
        products: [sector, profile?.finnhubIndustry ?? 'N/A'].filter((v, i, a) => a.indexOf(v) === i),
        competitors: [],   // Finnhub free tier doesn't expose peers on basic endpoints
        businessModel,
        employeeCount: 'See annual report',
        keyStrengths: profile
            ? [
                `Listed on ${profile.exchange}`,
                `Operating in ${profile.finnhubIndustry} sector`,
                profile.weburl ? `Digital presence: ${profile.weburl}` : 'Established market player',
            ]
            : ['Market participant', 'Publicly listed company'],
    }
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function researchAgent(
    state: AgentState
): Promise<Partial<AgentState>> {

    console.log(`Research Agent starting for: ${state.company}`)

    try {
        // Step 1: Resolve ticker via Finnhub
        const ticker = await resolveTicker(state.company)
        console.log(`Research Agent: ticker resolved → ${ticker}`)

        // Step 2: Fetch company profile from Finnhub + Wikipedia + Tavily search in parallel
        const [profile, wikiSummary, searchResults] = await Promise.all([
            getCompanyProfile(ticker),
            fetchWikipediaSummary(state.company),
            searchCompanyOverview(state.company),
        ])

        // Step 3: Build structured ResearchData (prefer LLM, fallback to rules)
        let researchData: ResearchData
        if (GROQ_API_KEY) {
            try {
                console.log(`Research Agent: Extracting detailed company info using Groq LLM...`)
                const contextText = `
Wikipedia Summary:
${wikiSummary || 'N/A'}

Tavily Search Results:
${JSON.stringify(searchResults.results || [])}
`.trim()

                const structuredModel = researchLLM.withStructuredOutput(researchSchema)
                const response = await structuredModel.invoke([
                    new SystemMessage(`
You are an expert equity research analyst. Your job is to extract accurate corporate information about a company.
`),
                    new HumanMessage(`
Extract the corporate details for the company: "${state.company}" (Ticker: ${ticker}).

Context for extraction:
${contextText}
`)
                ])

                researchData = response as ResearchData

                // Verify CEO field is not placeholder, try heuristics if needed
                if (!researchData.CEO || researchData.CEO.toLowerCase().includes('unknown') || researchData.CEO.toLowerCase().includes('website')) {
                    const ceoRegex = /CEO[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i
                    const match = contextText.match(ceoRegex)
                    if (match && match[1]) researchData.CEO = match[1]
                }
            } catch (llmErr) {
                console.warn('Research Agent LLM extraction failed, falling back to rule-based logic:', llmErr)
                researchData = buildResearchData(state.company, profile, wikiSummary)
            }
        } else {
            researchData = buildResearchData(state.company, profile, wikiSummary)
        }

        // Step 4: Ingest into RAG vector store
        const ragDoc = buildCompanyProfileDoc(
            state.company,
            researchData as unknown as Record<string, unknown>
        )
        await addDocumentsToRAG([ragDoc])

        console.log(`Research Agent done — sector: ${researchData.sector}`)

        return {
            researchData,
            ticker,   // store resolved ticker in state for other agents
            error: undefined,
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Research Agent failed:', message)

        return {
            researchData: {
                overview: `${state.company} — research data unavailable`,
                sector: 'Unknown',
                CEO: 'Unknown',
                founded: 'Unknown',
                headquarters: 'Unknown',
                products: [],
                competitors: [],
                businessModel: 'Unknown',
                employeeCount: 'Unknown',
                keyStrengths: [],
            },
            error: `Research Agent: ${message}`,
        }
    }
}