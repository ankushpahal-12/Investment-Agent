'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import React from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoryReport {
    id: string
    company: string
    ticker: string
    verdict: 'INVEST' | 'PASS'
    confidence: number
    analystRating: string
    sector: string
    marketCap: string
    currentPrice: string
    peRatio: number
    sentiment: string
    riskLevel: string
    reasoning: string
    analyzedAt: string
}

interface Props {
    open: boolean
    onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch { return 'N/A' }
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    return `${days}d ago`
}

// ─── History Modal ────────────────────────────────────────────────────────────
function ConfirmDialog({
    message,
    onConfirm,
    onCancel,

}: {
    message: string
    onConfirm: () => void
    onCancel: () => void
}) {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
        >
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
                <p className="text-sm font-medium text-gray-900 mb-2">Are you sure?</p>
                <p className="text-sm text-gray-500 mb-5">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )

}
export default function HistoryModal({ open, onClose }: Props) {
    const router = useRouter()

    const [reports, setReports] = useState<HistoryReport[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'ALL' | 'INVEST' | 'PASS'>('ALL')
    const [sortBy, setSortBy] = useState<'date' | 'confidence' | 'company'>('date')
    const [expanded, setExpanded] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [deletingAll, setDeletingAll] = useState(false)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const [confirmAll, setConfirmAll] = useState(false)
    // ── Fetch history when modal opens ────────────────────────────────────────

    useEffect(() => {
        if (!open) return
        fetchHistory()
    }, [open])

    // ── Close on Escape ───────────────────────────────────────────────────────

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // ── Prevent body scroll when open ─────────────────────────────────────────

    useEffect(() => {
        if (open) document.body.style.overflow = 'hidden'
        else document.body.style.overflow = ''
        return () => { document.body.style.overflow = '' }
    }, [open])

    async function fetchHistory() {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/history')
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? 'Failed to load history')
            setReports(data.reports ?? [])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load history')
        } finally {
            setLoading(false)
        }
    }
    //------------------------------- Delete Single Report-----------------------------------------
    async function deleteReport(id: string) {
        setDeletingId(id)
        setConfirmId(null)
        try {
            const res = await fetch('/api/history', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? 'Delete failed')
            setReports(prev => prev.filter(r => r.id !== id))
            if (expanded === id) setExpanded(null)
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Delete Failed')

        }
        finally {
            setDeletingId(null)
        }
        //-------------------------------------------

    }
    async function deleteAllReports() {
        setDeletingAll(true)
        setConfirmAll(false)
        try {
            const res = await fetch('/api/history', { method: 'PUT' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? 'Delete all failed')
            setReports([])
            setExpanded(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete all failed')
        } finally {
            setDeletingAll(false)
        }
    }
    // ── Filter + sort ─────────────────────────────────────────────────────────

    const filtered = reports
        .filter(r => {
            const matchesSearch = r.company.toLowerCase().includes(search.toLowerCase()) ||
                r.ticker.toLowerCase().includes(search.toLowerCase()) ||
                r.sector.toLowerCase().includes(search.toLowerCase())
            const matchesFilter = filter === 'ALL' || r.verdict === filter
            return matchesSearch && matchesFilter
        })
        .sort((a, b) => {
            if (sortBy === 'date') return new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime()
            if (sortBy === 'confidence') return b.confidence - a.confidence
            if (sortBy === 'company') return a.company.localeCompare(b.company)
            return 0
        })

    // ── Stats ─────────────────────────────────────────────────────────────────

    const totalInvest = reports.filter(r => r.verdict === 'INVEST').length
    const totalPass = reports.filter(r => r.verdict === 'PASS').length
    const avgConf = reports.length
        ? Math.round(reports.reduce((s, r) => s + r.confidence, 0) / reports.length)
        : 0

    if (!open) return null

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            {/* ── Confirm single delete ── */}
            {confirmId && (
                <ConfirmDialog
                    message={`Delete the report for "${reports.find(r => r.id === confirmId)?.company}"? This cannot be undone.`}
                    onConfirm={() => deleteReport(confirmId)}
                    onCancel={() => setConfirmId(null)}
                />
            )}

            {/* ── Confirm delete all ── */}
            {confirmAll && (
                <ConfirmDialog
                    message={`Delete all ${reports.length} reports? This cannot be undone.`}
                    onConfirm={deleteAllReports}
                    onCancel={() => setConfirmAll(false)}
                />
            )}

            {/* ── Modal backdrop ── */}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                onClick={e => { if (e.target === e.currentTarget) onClose() }}
            >
                <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[100vh] flex flex-col shadow-2xl">
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                        <div>
                            <h2 className="text-base font-medium text-gray-900">
                                Analysis history
                            </h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {reports.length} total analyses
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Delete all button */}
                            {reports.length > 0 && (
                                <button
                                    onClick={() => setConfirmAll(true)}
                                    disabled={deletingAll}
                                    className="text-xs px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-colors"
                                >
                                    {deletingAll ? 'Deleting…' : '🗑 Clear all'}
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* ── Stats ── */}
                    {reports.length > 0 && (
                        <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-gray-100">
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xl font-medium text-gray-900">{reports.length}</p>
                                <p className="text-xs text-gray-400 mt-0.5">Total</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <p className="text-xl font-medium text-green-700">{totalInvest}</p>
                                <p className="text-xs text-green-600 mt-0.5">Invest</p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-3 text-center">
                                <p className="text-xl font-medium text-red-700">{totalPass}</p>
                                <p className="text-xs text-red-600 mt-0.5">Pass</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-3 text-center">
                                <p className="text-xl font-medium text-blue-700">{avgConf}%</p>
                                <p className="text-xs text-blue-600 mt-0.5">Avg confidence</p>
                            </div>
                        </div>
                    )}

                    {/* ── Search + filters ── */}
                    <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 flex-wrap">
                        <input
                            suppressHydrationWarning
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search company, ticker, sector…"
                            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        <div className="flex gap-1">
                            {(['ALL', 'INVEST', 'PASS'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`
                    text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                    ${filter === f
                                            ? f === 'INVEST' ? 'bg-green-600 text-white'
                                                : f === 'PASS' ? 'bg-red-600   text-white'
                                                    : 'bg-gray-900   text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                  `}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as typeof sortBy)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none"
                        >
                            <option value="date">Latest first</option>
                            <option value="confidence">By confidence</option>
                            <option value="company">Company A-Z</option>
                        </select>
                        <button
                            onClick={fetchHistory}
                            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            ↺ Refresh
                        </button>
                    </div>

                    {/* ── Table ── */}
                    <div className="flex-1 overflow-y-auto">

                        {loading && (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mr-3" />
                                <span className="text-sm text-gray-500">Loading history…</span>
                            </div>
                        )}

                        {error && !loading && (
                            <div className="m-6 p-4 bg-red-50 border border-red-100 rounded-lg">
                                <p className="text-sm text-red-700">{error}</p>
                                <button onClick={fetchHistory} className="mt-2 text-xs text-red-600 underline">
                                    Try again
                                </button>
                            </div>
                        )}

                        {!loading && !error && filtered.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <p className="text-2xl mb-3">📭</p>
                                <p className="text-sm font-medium text-gray-900 mb-1">
                                    {reports.length === 0 ? 'No analyses yet' : 'No results found'}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {reports.length === 0
                                        ? 'Search for a company to get started'
                                        : 'Try a different search or filter'}
                                </p>
                            </div>
                        )}

                        {!loading && !error && filtered.length > 0 && (
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                                    <tr>
                                        <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Company</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Verdict</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Confidence</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Price</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Market cap</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">P/E</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Sentiment</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Risk</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Analyzed</th>
                                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filtered.map(r => (
                                        <React.Fragment key={r.id}>
                                            {/* ── Main row ── */}
                                            <tr
                                                key={r.id}
                                                className={`
                          hover:bg-gray-50 transition-colors
                          ${deletingId === r.id ? 'opacity-40 pointer-events-none' : ''}
                        `}
                                            >
                                                {/* Company */}
                                                <td
                                                    className="px-6 py-3 cursor-pointer"
                                                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                                >
                                                    <p className="font-medium text-gray-900">{r.company}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {r.ticker !== 'N/A' ? r.ticker : ''} · {r.sector}
                                                    </p>
                                                </td>

                                                {/* Verdict */}
                                                <td className="px-3 py-3">
                                                    <span className={`
                            text-xs font-medium px-2.5 py-1 rounded-full
                            ${r.verdict === 'INVEST'
                                                            ? 'bg-green-50 text-green-700'
                                                            : 'bg-red-50   text-red-700'}
                          `}>
                                                        {r.verdict}
                                                    </span>
                                                </td>

                                                {/* Confidence */}
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${r.confidence >= 70 ? 'bg-green-500' :
                                                                    r.confidence >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                                                    }`}
                                                                style={{ width: `${r.confidence}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-gray-600">{r.confidence}%</span>
                                                    </div>
                                                </td>

                                                {/* Price */}
                                                <td className="px-3 py-3">
                                                    <span className="text-xs text-gray-700">{r.currentPrice}</span>
                                                </td>

                                                {/* Market cap */}
                                                <td className="px-3 py-3">
                                                    <span className="text-xs text-gray-700">{r.marketCap}</span>
                                                </td>

                                                {/* P/E */}
                                                <td className="px-3 py-3">
                                                    <span className="text-xs text-gray-700">
                                                        {r.peRatio ? `${r.peRatio}×` : 'N/A'}
                                                    </span>
                                                </td>

                                                {/* Sentiment */}
                                                <td className="px-3 py-3">
                                                    <span className={`text-xs font-medium ${r.sentiment === 'positive' ? 'text-green-600' :
                                                        r.sentiment === 'negative' ? 'text-red-600' : 'text-amber-600'
                                                        }`}>
                                                        {r.sentiment}
                                                    </span>
                                                </td>

                                                {/* Risk */}
                                                <td className="px-3 py-3">
                                                    <span className={`text-xs font-medium ${r.riskLevel === 'LOW' ? 'text-green-600' :
                                                        r.riskLevel === 'MEDIUM' ? 'text-amber-600' :
                                                            r.riskLevel === 'HIGH' ? 'text-red-600' :
                                                                r.riskLevel === 'VERY HIGH' ? 'text-red-700' : 'text-gray-500'
                                                        }`}>
                                                        {r.riskLevel}
                                                    </span>
                                                </td>

                                                {/* Date */}
                                                <td className="px-3 py-3">
                                                    <p className="text-xs text-gray-500">{timeAgo(r.analyzedAt)}</p>
                                                    <p className="text-xs text-gray-300">{formatDate(r.analyzedAt)}</p>
                                                </td>

                                                {/* Actions */}
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-1.5">

                                                        {/* View button */}
                                                        <button
                                                            onClick={() => {
                                                                onClose()
                                                                router.push(`/results/${encodeURIComponent(r.company)}`)
                                                            }}
                                                            className="text-xs px-2.5 py-1 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                                        >
                                                            View
                                                        </button>

                                                        {/* Expand button */}
                                                        <button
                                                            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                                            className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                                                            title="Show reasoning"
                                                        >
                                                            {expanded === r.id ? '▲' : '▼'}
                                                        </button>

                                                        {/* Delete button */}
                                                        <button
                                                            onClick={() => setConfirmId(r.id)}
                                                            disabled={deletingId === r.id}
                                                            className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-colors"
                                                            title="Delete this report"
                                                        >
                                                            {deletingId === r.id ? '…' : '🗑'}
                                                        </button>

                                                    </div>
                                                </td>
                                            </tr>

                                            {/* ── Expanded reasoning row ── */}
                                            {expanded === r.id && (
                                                <tr key={`${r.id}-exp`} className="bg-blue-50">
                                                    <td colSpan={10} className="px-6 py-4">
                                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                                            <div className="sm:col-span-2">
                                                                <p className="text-xs font-medium text-gray-500 mb-1">
                                                                    Decision reasoning
                                                                </p>
                                                                <p className="text-sm text-gray-700 leading-relaxed">
                                                                    {r.reasoning ?? 'No reasoning available'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-medium text-gray-500 mb-2">
                                                                    Quick stats
                                                                </p>
                                                                <div className="space-y-1.5">
                                                                    {[
                                                                        { label: 'Analyst rating', value: r.analystRating },
                                                                        { label: 'Sector', value: r.sector },
                                                                        { label: 'Market cap', value: r.marketCap },
                                                                        { label: 'Analyzed', value: formatDate(r.analyzedAt) },
                                                                    ].map(row => (
                                                                        <div key={row.label} className="flex justify-between text-xs">
                                                                            <span className="text-gray-400">{row.label}</span>
                                                                            <span className="text-gray-700 font-medium">{row.value}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                {/* Delete from expanded view too */}
                                                                <button
                                                                    onClick={() => setConfirmId(r.id)}
                                                                    className="mt-3 w-full text-xs px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                                                                >
                                                                    🗑 Delete this report
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* ── Footer ── */}
                    <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                            Showing {filtered.length} of {reports.length} analyses
                        </p>
                        <div className="flex gap-2">
                            {reports.length > 0 && (
                                <button
                                    onClick={() => setConfirmAll(true)}
                                    disabled={deletingAll}
                                    className="text-xs px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-colors"
                                >
                                    {deletingAll ? 'Deleting…' : '🗑 Clear all'}
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </>
    )
}