import Sentiment from 'sentiment'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NLPSentimentResult {
    score: number          // -100 to +100
    label: 'positive' | 'negative' | 'mixed'
    magnitude: number          // how strong the sentiment is
    positiveWords: string[]        // words that drove positive score
    negativeWords: string[]        // words that drove negative score
    financialScore: number          // finance-specific sentiment
    headlines: HeadlineSentiment[]
    overallSummary: string
}

export interface HeadlineSentiment {
    text: string
    score: number
    label: 'positive' | 'negative' | 'neutral'
}

// ─── Finance-specific word lists ──────────────────────────────────────────────
// These matter more than general sentiment for investment decisions

const FINANCE_POSITIVE: Record<string, number> = {
    // Growth signals
    'growth': 3, 'revenue': 2, 'profit': 3,
    'earnings': 2, 'beat': 4, 'exceeded': 4,
    'record': 3, 'surge': 3, 'rally': 3,
    'upgrade': 4, 'outperform': 4, 'buy': 3,
    'bullish': 4, 'strong': 2, 'robust': 2,
    'expansion': 2, 'acquisition': 1, 'innovation': 2,
    'partnership': 2, 'dividend': 2, 'buyback': 3,
    'margin': 1, 'guidance': 1, 'raised': 3,
    'momentum': 2, 'breakout': 3, 'recovery': 2,
    'outperformed': 4, 'accelerating': 3, 'profitability': 3,

    // Indian market specific
    'nifty': 1, 'sensex': 1, 'fii': 1,
    'dii': 1, 'ipo': 2, 'listing': 1,
}

const FINANCE_NEGATIVE: Record<string, number> = {
    // Risk signals
    'lawsuit': -4, 'fine': -4, 'penalty': -4,
    'fraud': -5, 'investigation': -4, 'probe': -3,
    'loss': -3, 'miss': -4, 'missed': -4,
    'decline': -3, 'fell': -3, 'drop': -2,
    'downgrade': -4, 'underperform': -4, 'sell': -3,
    'bearish': -4, 'weak': -2, 'concern': -2,
    'layoff': -3, 'bankruptcy': -5, 'default': -5,
    'debt': -2, 'liability': -2, 'warning': -3,
    'recall': -3, 'scandal': -4, 'controversy': -3,
    'antitrust': -3, 'regulation': -2, 'inflation': -2,
    'recession': -4, 'slowdown': -3, 'headwind': -2,
    'uncertainty': -2, 'risk': -1, 'volatile': -2,
    'disappointing': -3, 'shortage': -2,
}

// ─── Sentence tokenizer ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
}

// ─── Core NLP sentiment scorer ────────────────────────────────────────────────

const sentimentLib = new Sentiment()

// Add finance words to sentiment library
sentimentLib.registerLanguage('finance', {
    labels: { ...FINANCE_POSITIVE, ...FINANCE_NEGATIVE }
})

export function analyzeText(text: string): {
    score: number
    positiveWords: string[]
    negativeWords: string[]
    magnitude: number
} {
    if (!text || text.trim().length === 0) {
        return { score: 0, positiveWords: [], negativeWords: [], magnitude: 0 }
    }

    // Run general sentiment
    const general = sentimentLib.analyze(text)

    // Run finance-specific scoring
    const words = tokenize(text)
    let finScore = 0
    const posWords: string[] = []
    const negWords: string[] = []

    words.forEach(word => {
        if (FINANCE_POSITIVE[word]) {
            finScore += FINANCE_POSITIVE[word]
            posWords.push(word)
        }
        if (FINANCE_NEGATIVE[word]) {
            finScore += FINANCE_NEGATIVE[word]
            negWords.push(word)
        }
    })

    // Blend general + finance sentiment (finance weighted more)
    const blended = (general.score * 0.3) + (finScore * 0.7)

    // Normalize to -100 to +100
    const normalized = Math.max(-100, Math.min(100, blended * 8))

    return {
        score: Math.round(normalized),
        positiveWords: [...new Set(posWords)].slice(0, 10),
        negativeWords: [...new Set(negWords)].slice(0, 10),
        magnitude: Math.abs(normalized),
    }
}

// ─── Analyze individual headline ──────────────────────────────────────────────

export function analyzeHeadline(headline: string): HeadlineSentiment {
    const result = analyzeText(headline)
    return {
        text: headline,
        score: result.score,
        label: result.score > 15 ? 'positive' :
            result.score < -15 ? 'negative' : 'neutral',
    }
}

// ─── Full NLP analysis of multiple articles ───────────────────────────────────

export function analyzeNewsNLP(
    headlines: string[],
    contents: string[]
): NLPSentimentResult {

    if (headlines.length === 0) {
        return {
            score: 0,
            label: 'mixed',
            magnitude: 0,
            positiveWords: [],
            negativeWords: [],
            financialScore: 0,
            headlines: [],
            overallSummary: 'No news data available',
        }
    }

    // Analyze each headline individually
    const headlineSentiments = headlines.map(h => analyzeHeadline(h))

    // Analyze full article content
    const fullText = contents.join(' ')
    const contentNLP = analyzeText(fullText)

    // Headline scores — each headline matters individually
    const headlineAvg = headlineSentiments.reduce((s, h) => s + h.score, 0)
        / headlineSentiments.length

    // Content score
    const contentScore = contentNLP.score

    // Final blended score — headlines weighted more (they set market mood)
    const finalScore = Math.round((headlineAvg * 0.6) + (contentScore * 0.4))

    // Label
    const label: 'positive' | 'negative' | 'mixed' =
        finalScore > 20 ? 'positive' :
            finalScore < -20 ? 'negative' : 'mixed'

    // Count positive/negative headlines
    const posCount = headlineSentiments.filter(h => h.label === 'positive').length
    const negCount = headlineSentiments.filter(h => h.label === 'negative').length
    const neuCount = headlineSentiments.filter(h => h.label === 'neutral').length

    // Build summary
    const overallSummary = buildSummary(
        finalScore, posCount, negCount, neuCount,
        contentNLP.positiveWords, contentNLP.negativeWords
    )

    return {
        score: Math.max(-100, Math.min(100, finalScore)),
        label,
        magnitude: Math.abs(finalScore),
        positiveWords: contentNLP.positiveWords,
        negativeWords: contentNLP.negativeWords,
        financialScore: finalScore,
        headlines: headlineSentiments,
        overallSummary,
    }
}

// ─── Auto-build summary from NLP signals ─────────────────────────────────────

function buildSummary(
    score: number,
    posCount: number,
    negCount: number,
    neuCount: number,
    posWords: string[],
    negWords: string[]
): string {
    const total = posCount + negCount + neuCount

    const tone =
        score > 50 ? 'strongly positive' :
            score > 20 ? 'positive' :
                score > -20 ? 'mixed' :
                    score > -50 ? 'negative' : 'strongly negative'

    const posShare = Math.round((posCount / total) * 100)
    const negShare = Math.round((negCount / total) * 100)

    let summary = `News sentiment is ${tone} with ${posCount}/${total} positive headlines (${posShare}%).`

    if (posWords.length > 0) {
        summary += ` Key positive signals: ${posWords.slice(0, 3).join(', ')}.`
    }
    if (negWords.length > 0) {
        summary += ` Key concerns: ${negWords.slice(0, 3).join(', ')}.`
    }

    return summary
}