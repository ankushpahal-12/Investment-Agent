import { NextRequest, NextResponse } from 'next/server'
import { getReportByCompany } from '../../../lib/mongodb'

export const maxDuration = 30

export async function GET(req: NextRequest) {
    const company = req.nextUrl.searchParams.get('company')
    if (!company) {
        return NextResponse.json({ error: 'Company parameter required' }, { status: 400 })
    }

    try {
        const report = await getReportByCompany(company)
        if (!report) {
            return NextResponse.json({ error: `No report found for "${company}"` }, { status: 404 })
        }

        const verdict = typeof report.verdict === 'string'
            ? {
                decision: report.verdict,
                confidence: report.confidence ?? 0,
                horizon: 'N/A', targetPrice: 'N/A',
                reasoning: report.reasoning ?? '',
                bullCase: 'N/A', bearCase: 'N/A',
                keyMetrics: [] as string[], watchlist: [] as string[],
                alternativePick: null as string | null,
                analystRating: 'HOLD',
                disclaimer: 'AI-generated analysis for educational purposes only.',
            }
            : report.verdict as unknown as Record<string, unknown>

        const research = (report.researchData ?? report.research ?? {}) as Record<string, unknown>
        const financial = (report.financialData ?? report.financial ?? {}) as Record<string, unknown>
        const news = (report.newsData ?? report.news ?? {}) as Record<string, unknown>
        const risk = (report.riskData ?? report.risk ?? {}) as Record<string, unknown>

        const isInvest = verdict?.decision === 'INVEST'
        const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

        // Generate styled HTML report
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>StockSage Report — ${report.company}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; line-height: 1.6; }
        
        .header { background: #111827; color: white; padding: 40px 50px; }
        .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
        .header .subtitle { color: #9ca3af; font-size: 13px; }
        .header .verdict-row { display: flex; align-items: center; gap: 20px; margin-top: 20px; }
        .verdict-badge {
            display: inline-block; padding: 8px 24px; border-radius: 8px; font-size: 20px; font-weight: 700;
            ${isInvest ? 'background: #065f46; color: #a7f3d0;' : 'background: #7f1d1d; color: #fca5a5;'}
        }
        .header .meta { color: #d1d5db; font-size: 13px; }
        
        .content { padding: 30px 50px; }
        .section { margin-bottom: 30px; page-break-inside: avoid; }
        .section h2 { font-size: 16px; font-weight: 600; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 14px; }
        
        .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .metric { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
        .metric .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
        .metric .value { font-size: 16px; font-weight: 600; color: #111827; margin-top: 2px; }
        .metric .value.green { color: #059669; }
        .metric .value.red { color: #dc2626; }
        
        .reasoning { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; font-size: 14px; color: #14532d; }
        ${!isInvest ? '.reasoning { background: #fef2f2; border-color: #fecaca; color: #7f1d1d; }' : ''}
        
        .list { list-style: none; }
        .list li { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
        .list li:last-child { border-bottom: none; }
        .list li::before { content: '→'; color: #9ca3af; margin-right: 8px; }
        .list.green li::before { content: '✓'; color: #059669; }
        .list.red li::before { content: '✕'; color: #dc2626; }
        
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        
        .footer { border-top: 1px solid #e5e7eb; padding: 20px 50px; font-size: 10px; color: #9ca3af; }
        
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase; }
        
        @media print {
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .verdict-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .reasoning { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="subtitle">StockSage Investment Research Report</div>
        <h1>${report.company}</h1>
        <div class="subtitle">${research.sector ?? 'N/A'} · ${financial.ticker ?? 'N/A'} · Generated ${now}</div>
        <div class="verdict-row">
            <span class="verdict-badge">${verdict?.decision ?? 'N/A'}</span>
            <div>
                <div class="meta">Confidence: ${verdict?.confidence ?? 0}% · Rating: ${verdict?.analystRating ?? 'N/A'}</div>
                <div class="meta">Horizon: ${verdict?.horizon ?? 'N/A'} · Target: ${verdict?.targetPrice ?? 'N/A'}</div>
            </div>
        </div>
    </div>

    <div class="content">
        <!-- Executive Summary -->
        <div class="section">
            <h2>Executive Summary</h2>
            <div class="reasoning">${verdict?.reasoning ?? 'No reasoning available.'}</div>
        </div>

        <!-- Company Overview -->
        <div class="section">
            <h2>Company Overview</h2>
            <p style="font-size: 14px; color: #4b5563; margin-bottom: 12px;">${research.overview ?? 'N/A'}</p>
            <table>
                <tr><th>CEO</th><td>${research.CEO ?? 'N/A'}</td><th>Founded</th><td>${research.founded ?? 'N/A'}</td></tr>
                <tr><th>Headquarters</th><td>${research.headquarters ?? 'N/A'}</td><th>Employees</th><td>${research.employeeCount ?? 'N/A'}</td></tr>
                <tr><th>Sector</th><td>${research.sector ?? 'N/A'}</td><th>Business Model</th><td>${research.businessModel ?? 'N/A'}</td></tr>
            </table>
        </div>

        <!-- Financial Metrics -->
        <div class="section">
            <h2>Financial Metrics</h2>
            <div class="grid">
                <div class="metric"><div class="label">Current Price</div><div class="value">${financial.currentPrice ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">Market Cap</div><div class="value">${financial.marketCap ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">P/E Ratio</div><div class="value">${financial.peRatio ?? 'N/A'}×</div></div>
                <div class="metric"><div class="label">EPS</div><div class="value">${financial.eps ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">Revenue</div><div class="value">${financial.revenue ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">YoY Growth</div><div class="value ${Number(financial.yoyGrowth) > 0 ? 'green' : 'red'}">${financial.yoyGrowth ?? 'N/A'}%</div></div>
                <div class="metric"><div class="label">Profit Margin</div><div class="value">${financial.profitMargin ?? 'N/A'}%</div></div>
                <div class="metric"><div class="label">Debt/Equity</div><div class="value">${financial.debtToEquity ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">Beta</div><div class="value">${financial.beta ?? 'N/A'}</div></div>
            </div>
        </div>

        <!-- News Sentiment -->
        <div class="section">
            <h2>News & Sentiment</h2>
            <div class="grid" style="grid-template-columns: 1fr 1fr;">
                <div class="metric"><div class="label">Sentiment</div><div class="value">${news.sentiment ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">Score</div><div class="value">${news.sentimentScore ?? 0}/100</div></div>
            </div>
            <p style="font-size: 13px; color: #4b5563; margin: 12px 0;">${news.summary ?? ''}</p>
            <div class="two-col">
                <div>
                    <p style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">BULLISH SIGNALS</p>
                    <ul class="list green">${(news.bullishPoints as string[] ?? []).map((p: string) => `<li>${p}</li>`).join('')}</ul>
                </div>
                <div>
                    <p style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">BEARISH SIGNALS</p>
                    <ul class="list red">${(news.bearishPoints as string[] ?? []).map((p: string) => `<li>${p}</li>`).join('')}</ul>
                </div>
            </div>
        </div>

        <!-- Risk Assessment -->
        <div class="section">
            <h2>Risk Assessment</h2>
            <div class="grid" style="grid-template-columns: 1fr 1fr 1fr;">
                <div class="metric"><div class="label">Risk Level</div><div class="value">${risk.riskLevel ?? 'N/A'}</div></div>
                <div class="metric"><div class="label">Risk Score</div><div class="value">${risk.riskScore ?? 50}/100</div></div>
                <div class="metric"><div class="label">Moat</div><div class="value">${risk.moatStrength ?? 'N/A'}</div></div>
            </div>
            <div class="two-col">
                <div>
                    <p style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">KEY RISKS</p>
                    <ul class="list red">${(risk.risks as string[] ?? []).map((r: string) => `<li>${r}</li>`).join('')}</ul>
                </div>
                <div>
                    <p style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">OPPORTUNITIES</p>
                    <ul class="list green">${(risk.opportunities as string[] ?? []).map((o: string) => `<li>${o}</li>`).join('')}</ul>
                </div>
            </div>
        </div>

        <!-- Investment Decision -->
        <div class="section">
            <h2>Investment Decision</h2>
            <div class="two-col" style="margin-bottom: 14px;">
                <div>
                    <p style="font-size: 11px; color: #059669; font-weight: 600; margin-bottom: 4px;">BULL CASE</p>
                    <p style="font-size: 13px; color: #4b5563;">${verdict?.bullCase ?? 'N/A'}</p>
                </div>
                <div>
                    <p style="font-size: 11px; color: #dc2626; font-weight: 600; margin-bottom: 4px;">BEAR CASE</p>
                    <p style="font-size: 13px; color: #4b5563;">${verdict?.bearCase ?? 'N/A'}</p>
                </div>
            </div>
            <div>
                <p style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">KEY METRICS THAT DROVE THIS DECISION</p>
                <ul class="list">${(verdict?.keyMetrics as string[] ?? []).map((m: string) => `<li>${m}</li>`).join('')}</ul>
            </div>
            <div style="margin-top: 12px;">
                <p style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">WATCHLIST</p>
                <ul class="list">${(verdict?.watchlist as string[] ?? []).map((w: string) => `<li>${w}</li>`).join('')}</ul>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>${verdict?.disclaimer ?? 'This is AI-generated analysis for educational purposes only. Not financial advice.'}</p>
        <p style="margin-top: 4px;">Generated by StockSage · ${now}</p>
    </div>
</body>
</html>`

        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `attachment; filename="StockSage_${report.company.replace(/\s+/g, '_')}_Report.html"`,
            },
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: `Export failed: ${msg}` }, { status: 500 })
    }
}
