/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, NextRequest } from 'next/server'
import { connectToDatabase, getAllReports } from '../../../lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET() {
    try {
        const reports = await getAllReports()

        const normalized = reports.map(r => {
            const v = r.verdict as any
            const fd = r.financialData as any
            const rd = r.researchData as any
            const nd = r.newsData as any
            const sd = r.riskData as any

            const verdictDecision: 'INVEST' | 'PASS' =
                (v?.decision === 'INVEST' || r.verdict === 'INVEST') ? 'INVEST' : 'PASS'

            return {
                id: r._id?.toString() || '',
                company: r.company || 'N/A',
                ticker: fd?.ticker ?? (r as any).ticker ?? 'N/A',
                verdict: verdictDecision,
                confidence: v?.confidence ?? r.confidence ?? 0,
                analystRating: v?.analystRating ?? (verdictDecision === 'INVEST' ? 'BUY' : 'HOLD'),
                sector: rd?.sector ?? (r as any).research?.sector ?? 'N/A',
                marketCap: fd?.marketCap ?? (r as any).financial?.marketCap ?? 'N/A',
                currentPrice: fd?.currentPrice ?? 'N/A',
                peRatio: typeof fd?.peRatio === 'number' ? fd.peRatio : 0,
                sentiment: nd?.sentiment ?? 'N/A',
                riskLevel: sd?.riskLevel ?? 'N/A',
                reasoning: v?.reasoning ?? r.reasoning ?? 'N/A',
                analyzedAt: r.analyzedAt ? r.analyzedAt.toISOString() : new Date().toISOString(),
            }
        })

        return NextResponse.json({ reports: normalized })

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: `Failed to load history: ${message}` },
            { status: 500 }
        )
    }
}
export async function DELETE(req: NextRequest) {
    try {
        const { id } = await req.json()

        if (!id) {
            return NextResponse.json(
                { error: 'Report Id is Required' },
                { status: 400 }
            )
        }
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: 'Invalid ID Format' },
                { status: 400 }
            )
        }
        const db = await connectToDatabase()
        const collection = db.collection('reports')

        const result = await collection.deleteOne({
            _id: new ObjectId(id)
        })

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { error: "Report Not Found" },
                { status: 400 }
            )
        }
        return NextResponse.json({
            success: true,
            message: `Report deleted successfully`
        })
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
            { error: `Failed to delete report: ${message}` },
            { status: 500 }
        )
    }
}

export async function PUT() {
    try {
        const db = await connectToDatabase()
        const collection = db.collection('reports')

        const result = await collection.deleteMany({})

        return NextResponse.json({
            success: true,
            deleted: result.deletedCount,
            message: `${result.deletedCount} reports deleted`
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}