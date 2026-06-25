import { NextRequest, NextResponse } from 'next/server'
import { runInvestmentAnalysis } from '../../../lib/graph'
import { saveReport, logSearch, getReportByCompany, isReportFresh } from '../../../lib/mongodb'

export const maxDuration = 120

export async function POST(req: NextRequest) {
    const body = await req.json()
    const company = body.company?.trim()
    const forceRefresh = body.forceRefresh === true

    if (!company) {
        return new Response(
            JSON.stringify({ error: 'Company name is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {

            function send(event: string, data: unknown) {
                const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(msg))
            }

            try {
                // ── 1. MongoDB Cache Check (24h strategy) ──────────────────────
                if (!forceRefresh) {
                    try {
                        const cached = await getReportByCompany(company)
                        const financialData = (cached?.financialData ?? cached?.financial) as any
                        const isCacheValid = cached && isReportFresh(cached) && 
                            !cached.error && 
                            financialData && 
                            financialData.currentPrice !== 'N/A' && 
                            financialData.peRatio !== null

                        if (isCacheValid) {
                            console.log(`Cache HIT for "${company}" — returning cached analysis`)

                            // Normalize verdict from legacy format
                            const v = typeof cached.verdict === 'string'
                                ? {
                                    decision: cached.verdict,
                                    confidence: cached.confidence ?? 0,
                                    horizon: 'N/A', targetPrice: 'N/A',
                                    reasoning: cached.reasoning ?? '',
                                    bullCase: 'N/A', bearCase: 'N/A',
                                    keyMetrics: [], watchlist: [],
                                    alternativePick: null,
                                    analystRating: cached.verdict === 'INVEST' ? 'BUY' : 'HOLD',
                                    disclaimer: 'AI-generated analysis for educational purposes only.',
                                }
                                : cached.verdict

                            send('cache_hit', {
                                success: true,
                                fromCache: true,
                                cachedAt: cached.analyzedAt,
                                reportId: cached._id?.toString() ?? '',
                                company: cached.company,
                                verdict: v,
                                research: cached.researchData ?? cached.research,
                                financial: cached.financialData ?? cached.financial,
                                news: cached.newsData ?? cached.news,
                                risk: cached.riskData ?? cached.risk,
                                error: cached.error ?? null,
                                ragContext: cached.ragContext ?? null,
                                ragQuality: cached.ragQuality ?? null,
                            })

                            // Also send as 'complete' so the UI handles it uniformly
                            send('complete', {
                                success: true,
                                fromCache: true,
                                reportId: cached._id?.toString() ?? '',
                                company: cached.company,
                                verdict: v,
                                research: cached.researchData ?? cached.research,
                                financial: cached.financialData ?? cached.financial,
                                news: cached.newsData ?? cached.news,
                                risk: cached.riskData ?? cached.risk,
                                error: cached.error ?? null,
                                ragContext: cached.ragContext ?? null,
                                ragQuality: cached.ragQuality ?? null,
                            })

                            controller.close()
                            return
                        }
                        if (cached) {
                            console.log(`Cache STALE for "${company}" — re-running analysis`)
                            send('cache_stale', { message: 'Refreshing outdated analysis…' })
                        }
                    } catch (cacheErr) {
                        console.warn('Cache check failed — proceeding with fresh analysis:', cacheErr)
                    }
                }

                // ── 2. Run full LangGraph pipeline ─────────────────────────────
                send('start', { company, message: 'Analysis started — running agents…' })

                const result = await runInvestmentAnalysis(
                    company,
                    (nodeName, nodeData) => {
                        send('progress', {
                            node: nodeName,
                            data: nodeData,
                            message: `${nodeName} agent completed`,
                        })
                    }
                )

                // ── 3. Save to MongoDB ─────────────────────────────────────────
                let reportId = ''
                try {
                    reportId = await saveReport({
                        company: result.company,
                        ticker: result.financialData?.ticker,
                        verdict: result.verdict ?? 'PASS',
                        confidence: result.verdict?.confidence ?? 0,
                        researchData: result.researchData ?? {},
                        financialData: result.financialData ?? {},
                        newsData: result.newsData ?? {},
                        riskData: result.riskData ?? {},
                        reasoning: result.verdict?.reasoning ?? '',
                        error: result.error,
                        ragContext: result.ragContext,
                        ragQuality: result.ragQuality,
                    })
                    await logSearch(company, result.company, reportId)
                    console.log(`Report saved to MongoDB: ${reportId}`)
                } catch (dbErr) {
                    console.warn('⚠️ MongoDB save failed:', dbErr)
                }

                // ── 4. Send final result ───────────────────────────────────────
                send('complete', {
                    success: true,
                    fromCache: false,
                    reportId,
                    company: result.company,
                    verdict: result.verdict,
                    research: result.researchData,
                    financial: result.financialData,
                    news: result.newsData,
                    risk: result.riskData,
                    error: result.error ?? null,
                    ragContext: result.ragContext ?? null,
                    ragQuality: result.ragQuality ?? null,
                })

            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                send('error', { error: message })
            } finally {
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        },
    })
}

export async function GET(req: NextRequest) {
    const company = req.nextUrl.searchParams.get('Company')
    if (!company) {
        return NextResponse.json(
            { status: 'error', message: 'Company name is required' },
            { status: 400 }
        )
    }
    try {
        const report = await getReportByCompany(company)
        if (!report) {
            return NextResponse.json(
                { error: `No report found for "${company}"` },
                { status: 404 }
            )
        }

        const normalizedVerdict = typeof report.verdict === 'string' ? {
            decision: report.verdict,
            confidence: report.confidence ?? 0,
            horizon: 'N/A', targetPrice: 'N/A',
            reasoning: report.reasoning ?? '',
            bullCase: 'N/A', bearCase: 'N/A',
            keyMetrics: [], watchlist: [],
            alternativePick: null,
            analystRating: report.verdict === 'INVEST' ? 'BUY' : 'HOLD',
            disclaimer: 'This is AI-generated analysis for educational purposes only.',
        } : report.verdict

        return NextResponse.json({
            company: report.company,
            verdict: normalizedVerdict,
            research: report.researchData ?? report.research,
            financial: report.financialData ?? report.financial,
            news: report.newsData ?? report.news,
            risk: report.riskData ?? report.risk,
            error: report.error ?? null,
            ragContext: report.ragContext ?? null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { status: 'error', message: `Failed to fetch report: ${message}` },
            { status: 500 }
        )
    }
}
