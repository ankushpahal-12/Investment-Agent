'use client'

import { useState } from 'react'

interface TickerItem {
  symbol: string
  name: string
}

interface TickerCategory {
  category: string
  tickers: TickerItem[]
}

const TICKER_CATEGORIES: TickerCategory[] = [
  {
    category: "Big Tech & AI",
    tickers: [
      { symbol: "AAPL", name: "Apple Inc." },
      { symbol: "MSFT", name: "Microsoft Corp." },
      { symbol: "NVDA", name: "NVIDIA Corp." },
      { symbol: "GOOGL", name: "Alphabet Inc." },
      { symbol: "AMZN", name: "Amazon.com Inc." },
      { symbol: "META", name: "Meta Platforms" },
      { symbol: "NFLX", name: "Netflix Inc." },
      { symbol: "TSLA", name: "Tesla Inc." }
    ]
  },
  {
    category: "Semiconductors & Hardware",
    tickers: [
      { symbol: "AMD", name: "Advanced Micro Devices" },
      { symbol: "INTC", name: "Intel Corp." },
      { symbol: "TSM", name: "Taiwan Semiconductor" },
      { symbol: "AVGO", name: "Broadcom Inc." },
      { symbol: "QCOM", name: "Qualcomm Inc." },
      { symbol: "ASML", name: "ASML Holding" }
    ]
  },
  {
    category: "Financials & Payments",
    tickers: [
      { symbol: "JPM", name: "JPMorgan Chase" },
      { symbol: "BAC", name: "Bank of America" },
      { symbol: "GS", name: "Goldman Sachs" },
      { symbol: "MS", name: "Morgan Stanley" },
      { symbol: "V", name: "Visa Inc." },
      { symbol: "MA", name: "Mastercard Inc." }
    ]
  },
  {
    category: "Healthcare & Biotech",
    tickers: [
      { symbol: "LLY", name: "Eli Lilly & Co." },
      { symbol: "UNH", name: "UnitedHealth Group" },
      { symbol: "JNJ", name: "Johnson & Johnson" },
      { symbol: "PFE", name: "Pfizer Inc." },
      { symbol: "MRNA", name: "Moderna Inc." }
    ]
  },
  {
    category: "Consumer & Brands",
    tickers: [
      { symbol: "WMT", name: "Walmart Inc." },
      { symbol: "KO", name: "Coca-Cola Co." },
      { symbol: "PEP", name: "PepsiCo Inc." },
      { symbol: "NKE", name: "Nike Inc." },
      { symbol: "DIS", name: "Walt Disney Co." },
      { symbol: "SBUX", name: "Starbucks Corp." }
    ]
  }
]

interface TickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (symbol: string) => void
}

export default function TickerModal({ open, onClose, onSelect }: TickerModalProps) {
  const [search, setSearch] = useState('')

  if (!open) return null

  // Filter categories and tickers based on search query
  const filteredCategories = TICKER_CATEGORIES.map(cat => {
    const filteredTickers = cat.tickers.filter(
      t => 
        t.symbol.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase())
    )
    return {
      ...cat,
      tickers: filteredTickers
    }
  }).filter(cat => cat.tickers.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-200">
      {/* Backdrop click */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      {/* Modal Container */}
      <div className="bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>🏷️</span> Ticker Directory
            </h2>
            <p className="text-[11px] text-gray-400">Click any symbol to quick-fill it into the search input.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
          <div className="relative">
            <input
              type="text"
              placeholder="Search ticker or company name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-300 focus:ring-1 focus:ring-gray-300/20"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
            </svg>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((cat, idx) => (
              <div key={idx} className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {cat.category}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {cat.tickers.map((t, tIdx) => (
                    <button
                      key={tIdx}
                      onClick={() => {
                        onSelect(t.symbol)
                        onClose()
                      }}
                      className="flex items-center justify-between p-2.5 bg-gray-50/50 border border-gray-100 rounded-lg hover:bg-gray-100/70 hover:border-gray-200 transition-all text-left cursor-pointer group"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold text-gray-800 group-hover:text-gray-900">
                          {t.symbol}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[150px]">
                          {t.name}
                        </p>
                      </div>
                      <span className="text-[10px] bg-white border border-gray-100 text-gray-400 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        select
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No matching stocks found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
