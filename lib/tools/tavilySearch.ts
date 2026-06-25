import { tavily } from '@tavily/core'

const API_KEY = process.env.TAVILY_API_KEY ?? ''

const client = API_KEY ? tavily({ apiKey: API_KEY }) : null

export interface SearchResult {
    title: string
    url: string
    content: string
}

export interface TavilyResponse {
    results: SearchResult[]
    summary?: string
}

const EMPTY: TavilyResponse = { results: [], summary: '' }

export async function searchCompanyOverview(company: string): Promise<TavilyResponse> {
    if (!client) {
        console.warn('⚠️  TAVILY_API_KEY is missing. searchCompanyOverview returning empty.')
        return EMPTY
    }
    try {
        const response = await client.search(`${company} key details CEO founder employees headquarters competitors business model`, {
            searchDepth: 'basic',
        })
        return {
            results: response.results.map((r: any) => ({
                title: r.title,
                url: r.url,
                content: r.content,
            })),
        }
    } catch (err) {
        console.warn(`Tavily search failed for "${company}":`, err)
        return EMPTY
    }
}

export async function searchCompanyNews(company: string): Promise<TavilyResponse> {
    if (!client) return EMPTY
    try {
        const response = await client.search(`${company} stock market news recent events`, {
            searchDepth: 'basic',
        })
        return {
            results: response.results.map((r: any) => ({
                title: r.title,
                url: r.url,
                content: r.content,
            })),
        }
    } catch (err) {
        console.warn(`Tavily news search failed for "${company}":`, err)
        return EMPTY
    }
}

export async function searchCompanyRisks(company: string): Promise<TavilyResponse> {
    if (!client) return EMPTY
    try {
        const response = await client.search(`${company} investment risks challenges regulatory issues competition`, {
            searchDepth: 'basic',
        })
        return {
            results: response.results.map((r: any) => ({
                title: r.title,
                url: r.url,
                content: r.content,
            })),
        }
    } catch (err) {
        console.warn(`Tavily risk search failed for "${company}":`, err)
        return EMPTY
    }
}

export async function searchCompanyFinancials(company: string): Promise<TavilyResponse> {
    if (!client) return EMPTY
    try {
        const response = await client.search(`${company} financial performance revenue growth metrics`, {
            searchDepth: 'basic',
        })
        return {
            results: response.results.map((r: any) => ({
                title: r.title,
                url: r.url,
                content: r.content,
            })),
        }
    } catch (err) {
        console.warn(`Tavily financial search failed for "${company}":`, err)
        return EMPTY
    }
}