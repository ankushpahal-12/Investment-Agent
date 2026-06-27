// lib/agents/newsAgent.ts
// ─── News Agent ───────────────────────────────────────────────────────────────
// Data sources: NewsAPI + Finnhub

// Injects news articles into RAG for Decision Agent

import { AgentState, NewsData } from '../../types'
import { fetchCompanyNews, computeOverallSentiment, NewsArticle } from '../tools/newsData'
import { getCompanyNews } from '../tools/finnhub'
import { addDocumentsToRAG, buildNewsDoc } from '../rag/vectorStore'
import { analyzeNewsNLP, analyzeHeadline } from '../nlp/sentimentAnalyzer'


interface EnrichedNewsData extends NewsData {
    nlpScore: number
    positiveWords: string[]
    negativeWords: string[]
    headlineScores: Array<{ text: string; score: number; label: string }>
    sourceBreakdown: Record<string, number>
}
function deduplicateArticles(
    newsApiArticles: NewsArticle[],
    finnhubItems: Array<{
        headline: string
        summary: string
        url: string
        datetime: number
    }>
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


function classifyMediaAttention(count: number): 'high' | 'medium' | 'low' {
    if (count >= 8) return 'high'
    if (count >= 4) return 'medium'
    return 'low'
}


function extractRecentEvents(articles: NewsArticle[], n = 5): string[] {
    return articles
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, n)
        .map(a => a.title)
}


function buildSourceBreakdown(articles: NewsArticle[]): Record<string, number> {
    return articles.reduce((acc, a) => {
        const src = a.source?.name ?? 'Unknown'
        acc[src] = (acc[src] ?? 0) + 1
        return acc
    }, {} as Record<string, number>)
}



function buildSummary(
    company: string,
    articles: NewsArticle[],
    sentiment: string,
    score: number,
    posWords: string[],
    negWords: string[]
): string {
    if (articles.length === 0) {
        return `No recent news found for ${company}.`
    }

    const tone =
        score > 50 ? 'very positive' :
            score > 20 ? 'positive' :
                score > -20 ? 'mixed' :
                    score > -50 ? 'negative' : 'very negative'

    let summary = `Found ${articles.length} recent articles for ${company}. `
    summary += `Overall sentiment is ${tone} (${score}/100). `

    if (posWords.length > 0) {
        summary += `Positive signals include: ${posWords.slice(0, 3).join(', ')}. `
    }
    if (negWords.length > 0) {
        summary += `Key concerns: ${negWords.slice(0, 3).join(', ')}.`
    }

    return summary.trim()
}


function buildBullishBearishFromNLP(
    articles: NewsArticle[],
    headlineScores: Array<{ text: string; score: number; label: string }>
): { bullishPoints: string[]; bearishPoints: string[] } {

    const bullishPoints: string[] = []
    const bearishPoints: string[] = []

    headlineScores.forEach((h, i) => {
        const article = articles[i]
        if (!article) return

        if (h.label === 'positive' && h.score > 15) {
            bullishPoints.push(h.text)
        } else if (h.label === 'negative' && h.score < -15) {
            bearishPoints.push(h.text)
        }
    })

    // Fallback — if NLP found nothing extreme use rule-based
    return {
        bullishPoints: bullishPoints.slice(0, 4),
        bearishPoints: bearishPoints.slice(0, 4),
    }
}


function blendScores(
    ruleBasedScore: number,
    nlpScore: number
): number {
    // Equal weight — both are deterministic, no hallucination risk
    const blended = Math.round((ruleBasedScore * 0.5) + (nlpScore * 0.5))
    return Math.max(-100, Math.min(100, blended))
}



function scoreToLabel(score: number): 'positive' | 'negative' | 'mixed' {
    if (score > 25) return 'positive'
    if (score < -25) return 'negative'
    return 'mixed'
}



export async function newsAgent(
    state: AgentState
): Promise<Partial<AgentState>> {

    console.log(`News Agent starting for: ${state.company}`)

    try {
        const ticker = (state as AgentState & { ticker?: string }).ticker


        const [newsApiResult, finnhubNewsItems] = await Promise.all([
            fetchCompanyNews(state.company, 10),
            ticker ? getCompanyNews(ticker, 7) : Promise.resolve([]),
        ])
        const allArticles = deduplicateArticles(
            newsApiResult.articles,
            finnhubNewsItems
        )

        console.log(`Total articles after dedup: ${allArticles.length}`)

        if (allArticles.length === 0) {
            console.warn(`No articles found for "${state.company}"`)
        }


        const ruleBased = computeOverallSentiment(allArticles)

        console.log(`Rule-based score: ${ruleBased.sentimentScore}/100`)

        const headlines = allArticles.map(a => a.title)
        const contents = allArticles.map(a => a.description ?? a.content ?? '')

        const nlpResult = analyzeNewsNLP(headlines, contents)
        const headlineScores = headlines.map(h => analyzeHeadline(h))

        console.log(`NLP score:        ${nlpResult.score}/100`)
        console.log(`Positive words:   ${nlpResult.positiveWords.slice(0, 5).join(', ')}`)
        console.log(`Negative words:   ${nlpResult.negativeWords.slice(0, 5).join(', ')}`)
        const finalScore = blendScores(ruleBased.sentimentScore, nlpResult.score)
        const finalSentiment = scoreToLabel(finalScore)

        console.log(`Blended score:    ${finalScore}/100 → ${finalSentiment}`)


        const { bullishPoints, bearishPoints } = buildBullishBearishFromNLP(
            allArticles,
            headlineScores
        )

        // Merge with rule-based if NLP found nothing
        const finalBullish = bullishPoints.length > 0
            ? bullishPoints
            : ruleBased.bullishPoints

        const finalBearish = bearishPoints.length > 0
            ? bearishPoints
            : ruleBased.bearishPoints


        const summary = buildSummary(
            state.company,
            allArticles,
            finalSentiment,
            finalScore,
            nlpResult.positiveWords,
            nlpResult.negativeWords
        )
        try {
            const ragDocs = allArticles.slice(0, 5).map(a =>
                buildNewsDoc(
                    state.company,
                    a.title,
                    a.description ?? a.content ?? ''
                )
            )
            if (ragDocs.length > 0) {
                await addDocumentsToRAG(ragDocs)
                console.log(`Ingested ${ragDocs.length} articles into RAG`)
            }
        } catch (ragError) {
            // Non-critical — log and continue
            console.warn('RAG ingestion failed (non-critical):', ragError)
        }

        // ── Step 9: Build final enriched news data ────────────────────────────────
        const newsData: EnrichedNewsData = {
            // Core fields
            headlines: headlines,
            sentiment: finalSentiment,
            sentimentScore: finalScore,
            summary,
            bullishPoints: finalBullish,
            bearishPoints: finalBearish,
            recentEvents: extractRecentEvents(allArticles, 5),
            mediaAttention: classifyMediaAttention(allArticles.length),
            newsVolume: `${allArticles.length} articles`,

            // NLP enrichment — pure data, no AI
            nlpScore: nlpResult.score,
            positiveWords: nlpResult.positiveWords,
            negativeWords: nlpResult.negativeWords,
            headlineScores: headlineScores.map(h => ({
                text: h.text,
                score: h.score,
                label: h.label,
            })),
            sourceBreakdown: buildSourceBreakdown(allArticles),
        }

        console.log(`\n━━━ News Agent Summary ━━━`)
        console.log(`Company:      ${state.company}`)
        console.log(`Articles:     ${allArticles.length}`)
        console.log(`Rule-based:   ${ruleBased.sentimentScore}/100`)
        console.log(`NLP:          ${nlpResult.score}/100`)
        console.log(`Final:        ${finalScore}/100 → ${finalSentiment}`)
        console.log(`Bullish:      ${finalBullish.length} signals`)
        console.log(`Bearish:      ${finalBearish.length} signals`)
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

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