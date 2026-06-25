import { NextRequest, NextResponse } from 'next/server'
import { getReportByCompany } from '../../../lib/mongodb'

export async function GET(req: NextRequest) {
    const company = req.nextUrl.searchParams.get('company')

    if (!company) {
        return NextResponse.json(
            { error: 'Company name required' },
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
            horizon: 'N/A',
            targetPrice: 'N/A',
            reasoning: report.reasoning ?? '',
            bullCase: 'N/A',
            bearCase: 'N/A',
            keyMetrics: [],
            watchlist: [],
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
            ragQuality: (report as any).ragQuality ?? null,
        })

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: message },
            { status: 500 }
        )
    }
}