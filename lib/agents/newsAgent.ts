// ─── News Agent ───────────────────────────────────────────────────────────────
// Data sources: NewsAPI + Finnhub Company News
// NO LLM — rule-based sentiment scoring
// Injects news articles into RAG for Decision Agent

import { AgentState, NewsData } from '../../types'
import { fetchCompanyNews, computeOverallSentiment, NewsArticle } from '../tools/newsData'
import { getCompanyNews } from '../tools/finnhub'
import { addDocumentsToRAG, buildNewsDoc } from '../rag/vectorStore'

// ─── Merge and deduplicate articles ──────────────────────────────────────────

function deduplicateArticles(
    newsApiArticles: NewsArticle[],
    finnhubItems: Array<{ headline: string; summary: string; url: string; datetime: number }>
): NewsArticle[] {
    const seen = new Set<string>()
    const result: NewsArticle[] = []

    for (const a of newsApiArticles) {
        const key = a.title.toLowerCase().slice(0, 60)
        if (!seen.has(key)) {
            seen.add(key)
            result.push(a)
        }
    }

    for (const item of finnhubItems) {
        const key = item.headline.toLowerCase().slice(0, 60)
        if (!seen.has(key)) {
            seen.add(key)
            result.push({
                title: item.headline,
                description: item.summary,
                content: item.summary,
                url: item.url,
                publishedAt: new Date(item.datetime * 1000).toISOString(),
                source: { name: 'Finnhub' },
                author: null,
            })
        }
    }

    return result
}

// ─── Classify media attention ─────────────────────────────────────────────────

function classifyMediaAttention(count: number): 'high' | 'medium' | 'low' {
    if (count >= 8) return 'high'
    if (count >= 4) return 'medium'
    return 'low'
}

// ─── Extract recent events (titles of most recent articles) ───────────────────

function extractRecentEvents(articles: NewsArticle[], n = 5): string[] {
    return articles
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, n)
        .map(a => a.title)
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function newsAgent(
    state: AgentState
): Promise<Partial<AgentState>> {

    console.log(`News Agent starting for: ${state.company}`)

    try {
        const ticker = (state as AgentState & { ticker?: string }).ticker

        // Step 1: Fetch from both sources in parallel
        const [newsApiResult, finnhubNewsItems] = await Promise.all([
            fetchCompanyNews(state.company, 10),
            ticker ? getCompanyNews(ticker, 7) : Promise.resolve([]),
        ])

        // Step 2: Merge + deduplicate
        const allArticles = deduplicateArticles(
            newsApiResult.articles,
            finnhubNewsItems
        )

        if (allArticles.length === 0) {
            console.warn(`News Agent: No articles found for "${state.company}"`)
        }

        // Step 3: Rule-based sentiment scoring
        const { sentiment, sentimentScore, bullishPoints, bearishPoints } =
            computeOverallSentiment(allArticles)

        const newsData: NewsData = {
            headlines: allArticles.map(a => a.title),
            sentiment,
            sentimentScore,
            summary: allArticles.length > 0
                ? `Found ${allArticles.length} recent articles. Sentiment is ${sentiment} with a score of ${sentimentScore}/100.`
                : `No recent news articles found for ${state.company}.`,
            bullishPoints,
            bearishPoints,
            recentEvents: extractRecentEvents(allArticles, 5),
            mediaAttention: classifyMediaAttention(allArticles.length),
            newsVolume: `${allArticles.length} articles`,
        }

        // Step 4: Ingest top articles into RAG
        const ragDocs = allArticles.slice(0, 5).map(a =>
            buildNewsDoc(
                state.company,
                a.title,
                a.description ?? a.content ?? ''
            )
        )
        if (ragDocs.length > 0) await addDocumentsToRAG(ragDocs)

        console.log(`News Agent done — ${sentiment} sentiment (${sentimentScore}/100), ${allArticles.length} articles`)

        return { newsData, error: undefined }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('News Agent failed:', message)

        return {
            newsData: {
                headlines: [],
                sentiment: 'mixed',
                sentimentScore: 0,
                summary: 'News data unavailable',
                bullishPoints: [],
                bearishPoints: [],
                recentEvents: [],
                mediaAttention: 'low',
                newsVolume: '0 articles',
            },
            error: `News Agent: ${message}`,
        }
    }
}