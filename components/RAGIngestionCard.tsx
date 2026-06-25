'use client'

import { useState, useRef } from 'react'

interface IngestionStats {
    totalChunks: number
    tables: number
    footnotes: number
    textBlocks: number
    pages: number
}

interface EdgarFiling {
    accessionNumber: string
    filingDate: string
    reportDate: string
    form: string
    primaryDocDescription: string
    filingUrl: string
    companyName: string
}

type IngestionMode = 'upload' | 'edgar'

export default function RAGIngestionCard() {
    const [company, setCompany] = useState('')
    const [docType, setDocType] = useState<'10k' | '10q' | 'investor_presentation' | 'other'>('10k')
    const [file, setFile] = useState<File | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
    const [statusText, setStatusText] = useState('')
    const [progressPercent, setProgressPercent] = useState(0)
    const [stats, setStats] = useState<IngestionStats | null>(null)
    const [errorMsg, setErrorMsg] = useState('')

    // EDGAR state
    const [mode, setMode] = useState<IngestionMode>('upload')
    const [edgarTicker, setEdgarTicker] = useState('')
    const [edgarFilings, setEdgarFilings] = useState<EdgarFiling[]>([])
    const [edgarLoading, setEdgarLoading] = useState(false)
    const [edgarFormType, setEdgarFormType] = useState<'10-K' | '10-Q'>('10-K')

    const fileInputRef = useRef<HTMLInputElement>(null)

    // ─── Drag & Drop handlers ────────────────────────────────────────────────

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
    const handleDragLeave = () => setIsDragging(false)
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false)
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile && droppedFile.type === 'application/pdf') {
            setFile(droppedFile); setErrorMsg('')
        } else { setErrorMsg('Please select a valid PDF file.') }
    }
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f?.type === 'application/pdf') { setFile(f); setErrorMsg('') }
        else if (f) { setErrorMsg('Please select a valid PDF file.') }
    }
    const triggerFileDialog = () => fileInputRef.current?.click()
    const clearFile = (e?: React.MouseEvent) => {
        e?.stopPropagation()
        setFile(null); setStats(null); setStatus('idle'); setStatusText(''); setErrorMsg(''); setProgressPercent(0)
    }

    // ─── SSE-based PDF upload ingestion ──────────────────────────────────────

    const handleIngest = async () => {
        if (!company.trim()) { setErrorMsg('Please specify the company name.'); return }
        if (!file) { setErrorMsg('Please select a PDF report to upload.'); return }

        setStatus('uploading'); setStatusText('Uploading document...'); setErrorMsg(''); setStats(null); setProgressPercent(5)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('company', company.trim())
        formData.append('type', docType)

        try {
            const response = await fetch('/api/ingest', { method: 'POST', body: formData })

            if (!response.ok || !response.body) {
                const errData = await response.json().catch(() => ({ error: 'Upload failed' }))
                throw new Error(errData.error || 'Failed to ingest document')
            }

            // Stream SSE events
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const jsonStr = line.replace('data:', '').trim()
                        if (!jsonStr) continue
                        try {
                            const payload = JSON.parse(jsonStr)
                            if (payload.message) setStatusText(payload.message)
                            if (payload.percent) setProgressPercent(payload.percent)
                            if (payload.stats) setStats(payload.stats)
                            if (payload.error) { setStatus('error'); setErrorMsg(payload.error); return }
                            if (payload.success) { setStatus('success') }
                        } catch { /* skip malformed lines */ }
                    }
                }
            }

            if (status !== 'error') setStatus('success')
        } catch (err: any) {
            setStatus('error')
            setErrorMsg(err.message || 'An error occurred during ingestion.')
        }
    }

    // ─── EDGAR: Search for filings ───────────────────────────────────────────

    const handleEdgarSearch = async () => {
        if (!edgarTicker.trim()) { setErrorMsg('Please enter a ticker symbol.'); return }
        setEdgarLoading(true); setErrorMsg(''); setEdgarFilings([])

        try {
            const res = await fetch(`/api/edgar?ticker=${encodeURIComponent(edgarTicker.trim())}&type=${edgarFormType}`)
            if (!res.ok) throw new Error('EDGAR search failed')
            const data = await res.json()
            setEdgarFilings(data.filings ?? [])
            if (data.filings?.length === 0) setErrorMsg(`No ${edgarFormType} filings found for "${edgarTicker}" on SEC EDGAR.`)
        } catch (err: any) {
            setErrorMsg(err.message)
        } finally { setEdgarLoading(false) }
    }

    // ─── EDGAR: Fetch & ingest a specific filing ─────────────────────────────

    const handleEdgarIngest = async (filing: EdgarFiling) => {
        const companyName = company.trim() || filing.companyName || edgarTicker.trim()
        setStatus('uploading'); setStatusText(`Fetching ${filing.form} from SEC EDGAR...`)
        setProgressPercent(10); setErrorMsg(''); setStats(null)

        try {
            const res = await fetch('/api/edgar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: edgarTicker.trim(),
                    filingUrl: filing.filingUrl,
                    company: companyName,
                    formType: filing.form,
                }),
            })

            if (!res.ok || !res.body) throw new Error('EDGAR ingestion failed')

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const jsonStr = line.replace('data:', '').trim()
                        if (!jsonStr) continue
                        try {
                            const payload = JSON.parse(jsonStr)
                            if (payload.message) setStatusText(payload.message)
                            if (payload.stats) setStats(payload.stats)
                            if (payload.error) { setStatus('error'); setErrorMsg(payload.error); return }
                            if (payload.success) { setStatus('success'); setStatusText(payload.message || 'Done!') }
                        } catch { /* skip */ }
                    }
                }
            }

            if (status !== 'error') setStatus('success')
        } catch (err: any) {
            setStatus('error')
            setErrorMsg(err.message)
        }
    }

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-1">Institutional RAG Ingestion</h2>
            <p className="text-xs text-gray-400 mb-4">
                Ingest company reports (10-K, 10-Q, presentations) into StockSage's semantic vector database.
            </p>

            {/* Mode Toggle */}
            <div className="flex gap-2 mb-5">
                <button
                    onClick={() => { setMode('upload'); clearFile() }}
                    className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all ${
                        mode === 'upload' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    📄 Upload PDF
                </button>
                <button
                    onClick={() => { setMode('edgar'); clearFile() }}
                    className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all ${
                        mode === 'edgar' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    🏛️ Auto-fetch from SEC EDGAR
                </button>
            </div>

            <div className="space-y-4">
                {/* ── Upload Mode ───────────────────────────────────────── */}
                {mode === 'upload' && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
                                <input
                                    type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                                    placeholder="e.g. Apple, Tesla, Infosys..."
                                    disabled={status === 'uploading'}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Document Type</label>
                                <select
                                    value={docType} onChange={(e) => setDocType(e.target.value as any)}
                                    disabled={status === 'uploading'}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                                >
                                    <option value="10k">10-K Annual Report</option>
                                    <option value="10q">10-Q Quarterly Report</option>
                                    <option value="investor_presentation">Investor Presentation Slides</option>
                                    <option value="other">Other Financial Report</option>
                                </select>
                            </div>
                        </div>

                        {/* Drag and Drop Zone */}
                        <div
                            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            onClick={status !== 'uploading' ? triggerFileDialog : undefined}
                            className={`
                                border-2 border-dashed rounded-lg p-8 text-center flex flex-col items-center justify-center transition-all cursor-pointer
                                ${isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'}
                                ${file ? 'bg-gray-50/50 border-solid border-gray-300' : ''}
                                ${status === 'uploading' ? 'opacity-50 pointer-events-none' : ''}
                            `}
                        >
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf" className="hidden" />
                            {file ? (
                                <div className="flex flex-col items-center max-w-full">
                                    <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-3">
                                        <span className="text-red-700 font-bold text-xs">PDF</span>
                                    </div>
                                    <p className="text-sm font-medium text-gray-800 truncate max-w-xs mb-1">{file.name}</p>
                                    <p className="text-xs text-gray-400 mb-3">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                                    <button onClick={clearFile} className="text-xs text-red-500 hover:text-red-700 underline font-medium">Remove File</button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-400">📂</div>
                                    <p className="text-sm font-medium text-gray-700 mb-1">
                                        Drag & drop your PDF here, or <span className="text-blue-600 hover:underline">browse</span>
                                    </p>
                                    <p className="text-xs text-gray-400">Supports annual reports, quarterly filings & slide presentations up to 50MB</p>
                                </div>
                            )}
                        </div>

                        {status !== 'success' && (
                            <button
                                onClick={handleIngest}
                                disabled={!file || !company.trim() || status === 'uploading'}
                                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {status === 'uploading' ? 'Processing...' : 'Ingest Document'}
                            </button>
                        )}
                    </>
                )}

                {/* ── EDGAR Mode ────────────────────────────────────────── */}
                {mode === 'edgar' && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Ticker Symbol</label>
                                <input
                                    type="text" value={edgarTicker}
                                    onChange={(e) => setEdgarTicker(e.target.value.toUpperCase())}
                                    placeholder="e.g. AAPL, TSLA..."
                                    disabled={status === 'uploading'}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Company Name (optional)</label>
                                <input
                                    type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                                    placeholder="Auto-detected if blank"
                                    disabled={status === 'uploading'}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Filing Type</label>
                                <select
                                    value={edgarFormType} onChange={(e) => setEdgarFormType(e.target.value as '10-K' | '10-Q')}
                                    disabled={status === 'uploading'}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                                >
                                    <option value="10-K">10-K (Annual)</option>
                                    <option value="10-Q">10-Q (Quarterly)</option>
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={handleEdgarSearch}
                            disabled={!edgarTicker.trim() || edgarLoading || status === 'uploading'}
                            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {edgarLoading ? 'Searching SEC EDGAR...' : `🔍 Search ${edgarFormType} Filings`}
                        </button>

                        {/* Filing results list */}
                        {edgarFilings.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs text-gray-400 font-medium">Available filings — click to ingest:</p>
                                {edgarFilings.map((filing, i) => (
                                    <button
                                        key={filing.accessionNumber || i}
                                        onClick={() => handleEdgarIngest(filing)}
                                        disabled={status === 'uploading'}
                                        className="w-full flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-100 transition-all disabled:opacity-40 text-left"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">
                                                {filing.form} — {filing.primaryDocDescription}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                Filed: {filing.filingDate} · Report: {filing.reportDate}
                                            </p>
                                        </div>
                                        <span className="text-xs text-blue-600 font-medium flex-shrink-0">Ingest →</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ── Error Banner ──────────────────────────────────────── */}
                {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                        <p className="text-xs text-red-700 font-medium">⚠️ {errorMsg}</p>
                    </div>
                )}

                {/* ── Streaming Progress ────────────────────────────────── */}
                {status === 'uploading' && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-blue-800">Processing document...</p>
                                <p className="text-xs text-blue-600 mt-0.5">{statusText}</p>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-blue-400 mt-1 text-right">{progressPercent}%</p>
                    </div>
                )}

                {/* ── Success Stats ─────────────────────────────────────── */}
                {status === 'success' && stats && (
                    <div className="bg-green-50 border border-green-100 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-green-700 text-lg">✓</span>
                            <p className="text-sm font-medium text-green-800">{statusText}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                            {[
                                { label: 'Pages', value: stats.pages },
                                { label: 'Tables', value: stats.tables },
                                { label: 'Footnotes', value: stats.footnotes },
                                { label: 'Segments', value: stats.totalChunks },
                            ].map(m => (
                                <div key={m.label} className="bg-white rounded-lg p-2.5 border border-green-100/50">
                                    <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">{m.label}</p>
                                    <p className="text-lg font-bold text-gray-800">{m.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <button
                        onClick={() => clearFile()}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium transition-all"
                    >
                        Ingest Another Document
                    </button>
                )}
            </div>
        </div>
    )
}
