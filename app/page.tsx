'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HistoryModal from '@/components/HistoryModal'
import AboutModal from '@/components/AboutModal'
import RAGIngestionCard from '@/components/RAGIngestionCard'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecentReport {
  company: string
  verdict: 'INVEST' | 'PASS'
  analyzedAt: string
  confidence: number
}

interface AgentFinding {
  node: string
  data: Record<string, unknown>
  message: string
}

// ─── Agent steps ──────────────────────────────────────────────────────────────

const AGENT_STEPS = [
  { key: 'validation', label: 'Validation agent', desc: 'Verifying company name & resolving ticker' },
  { key: 'research', label: 'Research agent', desc: 'Company overview, sector, leadership' },
  { key: 'financial', label: 'Financial agent', desc: 'Share price, market cap, financials' },
  { key: 'news', label: 'News agent', desc: 'Recent headlines and sentiment analysis' },
  { key: 'risk', label: 'Risk agent', desc: 'Risks, opportunities, moat analysis' },
  { key: 'decision', label: 'Decision agent', desc: 'Final INVEST / PASS verdict' },
]

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getRecent(): RecentReport[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('recent_reports') ?? '[]') }
  catch { return [] }
}

function saveRecent(report: RecentReport) {
  const updated = [report, ...getRecent().filter(r => r.company !== report.company)].slice(0, 5)
  localStorage.setItem('recent_reports', JSON.stringify(updated))
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

// ─── Build live finding text per agent ───────────────────────────────────────

function buildFinding(node: string, data: Record<string, unknown>): string {
  switch (node) {
    case 'research': {
      const r = data.researchData as Record<string, unknown> | undefined
      return r
        ? `${r.sector ?? 'N/A'} · CEO: ${r.CEO ?? 'N/A'} · Founded: ${r.founded ?? 'N/A'}`
        : 'Research complete'
    }
    case 'financial': {
      const f = data.financialData as Record<string, unknown> | undefined
      return f
        ? `${f.ticker ?? 'N/A'} · ${f.currentPrice ?? 'N/A'} · Market cap: ${f.marketCap ?? 'N/A'} · P/E: ${f.peRatio ?? 'N/A'}`
        : 'Financial data fetched'
    }
    case 'news': {
      const n = data.newsData as Record<string, unknown> | undefined
      return n
        ? `Sentiment: ${n.sentiment ?? 'N/A'} (${n.sentimentScore ?? 0}/100)`
        : 'News analyzed'
    }
    case 'risk': {
      const r = data.riskData as Record<string, unknown> | undefined
      return r
        ? `Risk: ${r.riskLevel ?? 'N/A'} · Moat: ${r.moatStrength ?? 'N/A'}`
        : 'Risk assessed'
    }
    case 'decision': {
      const v = data.verdict as Record<string, unknown> | undefined
      return v
        ? `${v.decision ?? 'N/A'} · ${v.confidence ?? 0}% confidence · ${v.analystRating ?? 'N/A'}`
        : 'Decision made'
    }
    default: return 'Complete'
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()

  const [company, setCompany] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [liveFindings, setLiveFindings] = useState<Record<string, string>>({})
  const [stepTimings, setStepTimings] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<RecentReport[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'search' | 'ingest'>('search')

  useEffect(() => {
    const timer = setTimeout(() => {
      setRecent(getRecent())
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // ── Get step index from key ────────────────────────────────────────────────

  function getStepIndex(key: string) {
    return AGENT_STEPS.findIndex(s => s.key === key)
  }

  // ── Progress percent ───────────────────────────────────────────────────────

  function getProgress(): number {
    const done = completedSteps.length
    const running = currentStep ? 0.5 : 0
    return Math.round(((done + running) / AGENT_STEPS.length) * 100)
  }

  // ── Step status ────────────────────────────────────────────────────────────

  function getStatus(key: string): 'done' | 'running' | 'queued' {
    if (completedSteps.includes(key)) return 'done'
    if (currentStep === key) return 'running'
    return 'queued'
  }

  // ── Handle analyze with real SSE ───────────────────────────────────────────

  async function handleAnalyze() {
    if (!company.trim() || isAnalyzing) return

    setError('')
    setIsAnalyzing(true)
    setCompletedSteps([])
    setCurrentStep(null)
    setLiveFindings({})
    setStepTimings({})

    const stepStartTime: Record<string, number> = {}

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: company.trim() }),
      })

      if (!res.ok || !res.body) {
        throw new Error('API request failed')
      }

      // ── Read SSE stream ──────────────────────────────────────────────────
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
          // Parse SSE format: "event: xxx" and "data: {...}"
          if (line.startsWith('event:')) {
            const eventName = line.replace('event:', '').trim()
            const dataLine = lines[lines.indexOf(line) + 1] ?? ''
            const jsonStr = dataLine.replace('data:', '').trim()

            if (!jsonStr) continue

            try {
              const payload = JSON.parse(jsonStr)

              if (eventName === 'start') {
                // First agent starts running
                setCurrentStep(AGENT_STEPS[0].key)
                stepStartTime[AGENT_STEPS[0].key] = Date.now()
              }

              if (eventName === 'progress') {
                const finding = payload as AgentFinding
                const node = finding.node

                // Mark this agent as DONE
                const elapsed = Date.now() - (stepStartTime[node] ?? Date.now())
                setStepTimings(prev => ({ ...prev, [node]: elapsed }))
                setCompletedSteps(prev =>
                  prev.includes(node) ? prev : [...prev, node]
                )
                setLiveFindings(prev => ({
                  ...prev,
                  [node]: buildFinding(node, finding.data),
                }))

                // Start NEXT agent
                const nextIndex = getStepIndex(node) + 1
                if (nextIndex < AGENT_STEPS.length) {
                  const nextKey = AGENT_STEPS[nextIndex].key
                  setCurrentStep(nextKey)
                  stepStartTime[nextKey] = Date.now()
                } else {
                  setCurrentStep(null)
                }
              }

              if (eventName === 'complete') {
                // All done — mark everything complete
                setCompletedSteps(AGENT_STEPS.map(s => s.key))
                setCurrentStep(null)

                // Save to recent
                saveRecent({
                  company: payload.company,
                  verdict: payload.verdict?.decision ?? 'PASS',
                  analyzedAt: new Date().toISOString(),
                  confidence: payload.verdict?.confidence ?? 0,
                })
                setRecent(getRecent())

                // Navigate to results
                await new Promise(r => setTimeout(r, 800))
                router.push(`/results/${encodeURIComponent(payload.company)}`)
                return
              }

              if (eventName === 'error') {
                throw new Error(payload.error ?? 'Analysis failed')
              }

            } catch {
              // Skip malformed SSE lines
              continue
            }
          }
        }
      }

    } catch (err) {
      setIsAnalyzing(false)
      setCurrentStep(null)
      setCompletedSteps([])
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAnalyze()
  }

  // ── Delete recent item ─────────────────────────────────────────────────────
  async function deleteRecent(company: string, e: React.MouseEvent) {
    e.stopPropagation()  // prevent navigating to results

    try {
      // Remove from localStorage immediately
      const updated = getRecent().filter(r => r.company !== company)
      localStorage.setItem('recent_reports', JSON.stringify(updated))
      setRecent(updated)

      // Also delete from MongoDB
      const all = await fetch('/api/history').then(r => r.json())
      const report = (all.reports ?? []).find(
        (r: { company: string; id: string }) =>
          r.company.toLowerCase() === company.toLowerCase()
      )

      if (report?.id) {
        await fetch('/api/history', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: report.id }),
        })
      }
    } catch (err) {
      console.warn('Delete failed:', err)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Topbar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center">
        <span className="text-sm font-medium text-gray-900">StockSage</span>
        <div className="ml-auto flex items-center gap-4 text-sm text-gray-500">
          <button
            onClick={() => setHistoryOpen(true)}
            className="cursor-pointer hover:text-gray-800 transition-colors"
          >
            History
          </button>
          <button
            onClick={() => setAboutOpen(true)}
            className="cursor-pointer hover:text-gray-800 transition-colors"
          >
            About
          </button>
        </div>
      </nav>

      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />

      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Hero */}
        {!isAnalyzing && (
          <div className="text-center mb-10">
            <h1 className="text-2xl font-medium text-gray-900 mb-2">
              AI investment research
            </h1>
            <p className="text-sm text-gray-500">
              Enter any company — get a full research report in seconds
            </p>
          </div>
        )}

        {/* Sub-tab Switcher */}
        {!isAnalyzing && (
          <div className="flex border-b border-gray-200 mb-8 justify-center gap-8">
            <button
              onClick={() => setActiveSubTab('search')}
              className={`pb-3 text-sm font-medium border-b-2 transition-all ${
                activeSubTab === 'search'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              🔍 Stock Analysis
            </button>
            <button
              onClick={() => setActiveSubTab('ingest')}
              className={`pb-3 text-sm font-medium border-b-2 transition-all ${
                activeSubTab === 'ingest'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              📂 Knowledge Base Ingestion
            </button>
          </div>
        )}

        {/* Search box */}
        {!isAnalyzing && activeSubTab === 'search' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                suppressHydrationWarning
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search company name or ticker…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <button
                onClick={handleAnalyze}
                disabled={!company.trim()}
                className="w-full sm:w-auto px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Analyze
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">Try:</span>
              {['Infosys', 'Apple', 'Reliance', 'TCS', 'Tesla', 'Zomato'].map(name => (
                <button
                  suppressHydrationWarning
                  key={name}
                  onClick={() => setCompany(name)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
                >
                  {name}
                </button>
              ))}
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-sm text-red-700">
                  <span className="font-medium">Error: </span>{error}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Ingestion Card */}
        {!isAnalyzing && activeSubTab === 'ingest' && (
          <div className="mb-6">
            <RAGIngestionCard />
          </div>
        )}

        {/* Live agent tracker */}
        {isAnalyzing && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Analyzing {company}…
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Each agent updates in real time below
                </p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium animate-pulse">
                Live
              </span>
            </div>

            {/* Agent rows */}
            <div className="space-y-2 mb-5">
              {AGENT_STEPS.map((step) => {
                const status = getStatus(step.key)
                const timing = stepTimings[step.key]
                const finding = liveFindings[step.key]

                return (
                  <div
                    key={step.key}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg transition-all duration-500
                      ${status === 'running' ? 'bg-blue-50 border border-blue-100' : ''}
                      ${status === 'done' ? 'bg-green-50' : ''}
                      ${status === 'queued' ? 'bg-gray-50' : ''}
                    `}
                  >
                    {/* Status icon */}
                    <div className={`
                      w-7 h-7 rounded-full flex items-center justify-center
                      text-xs flex-shrink-0 mt-0.5 font-medium transition-all
                      ${status === 'done' ? 'bg-green-100 text-green-700' : ''}
                      ${status === 'running' ? 'bg-blue-100  text-blue-700 animate-pulse' : ''}
                      ${status === 'queued' ? 'bg-gray-100  text-gray-400' : ''}
                    `}>
                      {status === 'done' && '✓'}
                      {status === 'running' && '⟳'}
                      {status === 'queued' && String(getStepIndex(step.key) + 1)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-medium ${status === 'queued' ? 'text-gray-400' : 'text-gray-900'}`}>
                          {step.label}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {timing && (
                            <span className="text-xs text-gray-400">
                              {(timing / 1000).toFixed(1)}s
                            </span>
                          )}
                          {status === 'done' && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              Done
                            </span>
                          )}
                          {status === 'running' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">
                              Running
                            </span>
                          )}
                          {status === 'queued' && (
                            <span className="text-xs text-gray-300">
                              Queued
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-xs mt-0.5 truncate ${status === 'queued' ? 'text-gray-300' : 'text-gray-500'}`}>
                        {finding ?? step.desc}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Real progress bar */}
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 rounded-full"
                style={{
                  width: `${getProgress()}%`,
                  transition: 'width 0.6s ease-in-out',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <p className="text-xs text-gray-400">
                {currentStep && (
                  <span className="text-blue-500">
                    {AGENT_STEPS.find(s => s.key === currentStep)?.label} running…
                  </span>
                )}
                {!currentStep && completedSteps.length > 0 && (
                  <span className="text-green-600">All agents complete</span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {completedSteps.length}/{AGENT_STEPS.length} complete · {getProgress()}%
              </p>
            </div>
          </div>
        )}

        {/* Recent analyses */}
        {!isAnalyzing && activeSubTab === 'search' && recent.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Recent analyses
            </p>
            <div className="space-y-2">
              {recent.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors group"
                >
                  {/* Clickable area → goes to results */}
                  <button
                    onClick={() => router.push(`/results/${encodeURIComponent(r.company)}`)}
                    className="flex-1 flex items-center justify-between text-left"
                  >
                    <span className="text-sm text-gray-900">{r.company}</span>
                    <div className="flex items-center gap-3">
                      <span className={`
          text-xs font-medium px-2 py-0.5 rounded-full
          ${r.verdict === 'INVEST'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50   text-red-700'}
        `}>
                        {r.verdict}
                      </span>
                      <span className="text-xs text-gray-400">
                        {timeAgo(r.analyzedAt)}
                      </span>
                    </div>
                  </button>

                  {/* Delete button — visible on hover */}
                  <button
                    onClick={(e) => deleteRecent(r.company, e)}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                    title="Remove from history"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isAnalyzing && activeSubTab === 'search' && recent.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">
              No recent analyses yet — search for a company above to get started.
            </p>
          </div>
        )}

      </div>

      {/* GitHub Repository Link */}
      <a
        href="https://github.com/ankushpahal-12/Investment-Agent"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-20 left-6 z-40 bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 rounded-full w-10 h-10 flex items-center justify-center cursor-pointer transition-all duration-200 text-gray-500 hover:text-gray-900 group"
        title="View GitHub Repository"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 24 24"
          className="w-5 h-5 transition-colors duration-200"
        >
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
      </a>

      {/* Trigger Button: How does it work */}
      <button
        onClick={() => setHowItWorksOpen(true)}
        className="fixed bottom-6 left-6 z-40 bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 rounded-full px-4 py-2.5 flex items-center gap-2 cursor-pointer transition-all duration-200 group text-sm text-gray-700 font-medium"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
        <span>How does it work</span>
      </button>

      {/* How It Works Modal */}
      {howItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur overlay */}
          <div
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setHowItWorksOpen(false)}
          />

          {/* Modal Container */}
          <div className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-none h-[92vh] max-h-none flex flex-col overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">How StockSage Works</h2>
              <button
                onClick={() => setHowItWorksOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 cursor-pointer"
                aria-label="Close modal"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-gray-600">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">1. Selecting and Querying (What to Select & Type)</h3>
                <p className="mb-3">StockSage has two primary sections on the main page. Choose one based on your goal:</p>
                <ul className="list-disc pl-5 space-y-2.5">
                  <li>
                    <strong>Stock Analysis Tab:</strong>
                    <ul className="list-circle pl-5 mt-1 space-y-1">
                      <li><strong>What to Select:</strong> Make sure the "Stock Analysis" sub-tab is active.</li>
                      <li><strong>What to Type:</strong> Click in the search field and type a complete company name or stock ticker symbol (for example, type <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">Apple</span>, <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">AAPL</span>, <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">Infosys</span>, or <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">TSLA</span>).</li>
                      <li><strong>Action:</strong> Click the <strong>Analyze</strong> button or press the <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">Enter</span> key to run the pipeline.</li>
                    </ul>
                  </li>
                  <li>
                    <strong>Knowledge Base Ingestion Tab:</strong>
                    <ul className="list-circle pl-5 mt-1 space-y-1">
                      <li><strong>What to Select:</strong> Switch to the "Knowledge Base Ingestion" sub-tab.</li>
                      <li><strong>Manual PDF Ingest:</strong> Select "Upload PDF" to manually drag and drop or browse for files. Type the associated company name exactly so the RAG agent maps documents properly.</li>
                      <li><strong>Auto-Fetch Filing:</strong> Select "Auto-fetch from SEC EDGAR" to query regulatory filings. Type a company ticker, select a document (10-K or 10-Q), and click fetch to retrieve and index the filing.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              <hr className="border-gray-100" />

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">2. The Multi-Agent Pipeline (How Each Agent Works)</h3>
                <p className="mb-3">When you launch an analysis, StockSage runs a sequential LangGraph workflow. The progress bar updates as each specialized agent completes its analysis:</p>
                <ol className="list-decimal pl-5 space-y-3">
                  <li>
                    <strong>Validation Agent:</strong> Evaluates your input string to ensure it resolves to a real, actively traded stock symbol via Finnhub. If it fails, the pipeline terminates immediately to protect API limits.
                  </li>
                  <li>
                    <strong>Research Agent:</strong> Pulls general corporate attributes (including CEO identity, headquarters location, founding year, key product segments, and direct competitors) using Tavily Search and Wikipedia.
                  </li>
                  <li>
                    <strong>Financial Agent:</strong> Gathers key fundamental numbers from stock market APIs, including EV/EBITDA, P/E ratios, profit margins, YoY revenue growth rates, debt leverage, and consensus analyst price targets.
                  </li>
                  <li>
                    <strong>News Agent:</strong> Crawls global news databases covering stories published over the last seven days, using the LLM to score net sentiment metrics and highlight catalyst events.
                  </li>
                  <li>
                    <strong>RAG Retrieval Node:</strong> Performs semantic search lookups against vector indexes stored in Chroma Cloud. It pulls details about legal proceedings, debt covenants, and geographic segment performance.
                  </li>
                  <li>
                    <strong>Risk Agent:</strong> Synthesizes data to assess systemic business, industry, and credit risks, compiling comprehensive bull-case and bear-case scenarios.
                  </li>
                  <li>
                    <strong>Decision Agent:</strong> Merges all agent outputs, determines the final recommendation (INVEST or PASS), assigns a confidence score, and establishes a 12-month target price.
                  </li>
                </ol>
              </div>

              <hr className="border-gray-100" />

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">3. Viewing and Exporting Results</h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Dashboard:</strong> After compilation, the application redirects to the Results Dashboard. Browse the structured tabs (Overview, Sentiment, Financials, Risks, RAG, and Trend) to audit the agents' reasoning.
                  </li>
                  <li>
                    <strong>RAG Quality Auditor:</strong> Look at the color-coded RAG badge on the top right of the result page to verify how many vector chunks, tables, and footnotes were retrieved from the SEC filings.
                  </li>
                  <li>
                    <strong>Exporting reports:</strong> Click the <strong>Export PDF</strong> button at the top of the dashboard. This generates a styled investment memo and launches the system printer dialog to save it directly to your device.
                  </li>
                </ul>
              </div>

              <hr className="border-gray-100" />

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">4. Rate Limits & 429 Errors (Too Many Requests)</h3>
                <p className="mb-2">To protect external API credits and maintain service reliability, StockSage incorporates rate limit checks:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>What is a 429 Error?</strong> It is an HTTP status code meaning "Too Many Requests". It occurs when API rate limits (e.g. Groq, Tavily, Finnhub) are reached.
                  </li>
                  <li>
                    <strong>Mitigation & Caching:</strong> The Validation Agent validates input queries early to save API tokens. Furthermore, completed reports are stored in MongoDB. Searching for an already-analyzed company within a short window retrieves the cached report, saving external API requests.
                  </li>
                  <li>
                    <strong>What to do:</strong> If the pipeline aborts with a rate limit error, please wait a minute before starting a new analysis or query a different stock to let the API rate limit cool down.
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setHowItWorksOpen(false)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Got it, thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
