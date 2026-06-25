import { NextRequest, NextResponse } from 'next/server'
import { getReportByCompany } from '../../../lib/mongodb'

// GET — Return historical analysis snapshots for a company
export async function GET(req: NextRequest) {
    const company = req.nextUrl.searchParams.get('company')
    if (!company) {
        return NextResponse.json({ error: 'Company parameter required' }, { status: 400 })
    }

    try {
        const { connectToDatabase } = await import('../../../lib/mongodb')
        const db = await connectToDatabase()
        const collection = db.collection('reports')

        // Fetch all reports for this company, sorted by date
        const reports = await collection
            .find({ company: { $regex: company, $options: 'i' } })
            .sort({ analyzedAt: -1 })
            .limit(20)
            .toArray()

        if (reports.length === 0) {
            return NextResponse.json({ trends: [] })
        }

        // Extract trend snapshots
        const trends = reports.map(report => {
            const verdict = typeof report.verdict === 'string'
                ? { decision: report.verdict, confidence: report.confidence ?? 0, analystRating: 'HOLD', targetPrice: 'N/A' }
                : report.verdict

            const risk = report.riskData ?? report.risk
            const news = report.newsData ?? report.news

            return {
                analyzedAt: report.analyzedAt,
                decision: verdict?.decision ?? 'PASS',
                confidence: verdict?.confidence ?? 0,
                analystRating: verdict?.analystRating ?? 'HOLD',
                targetPrice: verdict?.targetPrice ?? 'N/A',
                riskScore: risk?.riskScore ?? 50,
                riskLevel: risk?.riskLevel ?? 'MEDIUM',
                sentimentScore: news?.sentimentScore ?? 0,
                sentiment: news?.sentiment ?? 'mixed',
            }
        })

        return NextResponse.json({ trends, company: reports[0].company })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: `Failed to fetch trends: ${msg}` }, { status: 500 })
    }
}
