'use client'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop blur overlay */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-none h-[92vh] max-h-none flex flex-col overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">About AI Investment Research</h2>
          <button
            onClick={onClose}
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
            <h3 className="font-semibold text-gray-900 mb-2">What is StockSage?</h3>
            <p className="leading-relaxed">
              StockSage is an advanced, multi-agent AI research assistant designed to automate the process of institutional equity analysis. By entering a company name or ticker, the system runs a coordinated graph workflow that performs web retrieval, financial audits, news sentiment tracking, and SEC filing context analysis in a matter of seconds.
            </p>
          </div>

          <hr className="border-gray-100" />

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">The Multi-Agent AI Architecture</h3>
            <p className="mb-3 leading-relaxed">
              StockSage models the complex task of investment research as a stateful, directed acyclic graph (built using <strong>LangGraph</strong>). Instead of a single LLM trying to solve everything, multiple specialized agents collaborate:
            </p>
            <ul className="list-disc pl-5 space-y-2.5">
              <li>
                <strong>Validation Agent:</strong> Matches user queries to verified market tickers via Finnhub, protecting API limits by aborting invalid queries early.
              </li>
              <li>
                <strong>Research Agent:</strong> Combines Tavily web search and Wikipedia pages to fetch high-level qualitative company context and product catalogs.
              </li>
              <li>
                <strong>Financial Agent:</strong> Evaluates fundamental financial metrics, operating ratios, leverage ratios, and growth figures using market APIs.
              </li>
              <li>
                <strong>News Agent:</strong> Crawls real-time headlines from the past seven days, scoring net sentiment and identifying key catalyst events.
              </li>
              <li>
                <strong>RAG Retrieval Node:</strong> Performs semantic search queries against indexed SEC filings (like 10-K and 10-Q forms) stored in vector databases.
              </li>
              <li>
                <strong>Risk Agent:</strong> Synthesizes retrieved data to model bullish/bearish scenarios, assessing operational, competitive, and macroeconomic risks.
              </li>
              <li>
                <strong>Decision Agent:</strong> Aggregates the graph state and issues a final <strong>INVEST</strong> or <strong>PASS</strong> recommendation, complete with target price, time horizon, and confidence scoring.
              </li>
            </ul>
          </div>

          <hr className="border-gray-100" />

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Retrieval-Augmented Generation (RAG)</h3>
            <p className="leading-relaxed">
              General Web search often misses details hidden in SEC filings. StockSage resolves this through a dedicated RAG database. Ingested reports (PDF or SEC EDGAR filings) are partitioned into narrative text and numerical tables, embedded using the Google Gemini text-embedding-004 model, and stored in a vector index. During an analysis, the RAG node executes multi-query semantic searches to find hidden disclosures, covenants, or risks.
            </p>
          </div>

          <hr className="border-gray-100" />

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">API Rate Limits & Reliability</h3>
            <p className="leading-relaxed">
              StockSage incorporates smart mitigation to handle the <strong>429 Too Many Requests</strong> status code. This error occurs when third-party API rate quotas (like Groq, Tavily, Google, or Finnhub) are reached. To address this, StockSage validates inputs early, structures queries efficiently, and caches finished reports in MongoDB. If rate limits are reached, the application notifies users gracefully.
            </p>
          </div>

          <hr className="border-gray-100" />

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
            <span className="text-amber-600 mt-0.5 text-sm">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Financial Disclaimer</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                StockSage is an educational and analytical research assistant tool. All recommendations (INVEST or PASS), target prices, and risk ratings generated by the AI agent pipeline are for informational purposes only. This system does not constitute certified financial or investment advice. Always perform your own due diligence before making any financial decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Got it, thanks
          </button>
        </div>
      </div>
    </div>
  )
}
