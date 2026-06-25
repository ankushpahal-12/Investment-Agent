const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add import
const importTarget = `import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HistoryModal from '@/components/HistoryModal'`;

const importReplacement = `import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HistoryModal from '@/components/HistoryModal'
import RAGIngestionCard from '@/components/RAGIngestionCard'`;

if (content.includes(importTarget)) {
    content = content.replace(importTarget, importReplacement);
} else {
    console.log('Import target not found.');
}

// 2. Add state
const stateTarget = `  const [recent, setRecent] = useState<RecentReport[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)`;

const stateReplacement = `  const [recent, setRecent] = useState<RecentReport[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'search' | 'ingest'>('search')`;

if (content.includes(stateTarget)) {
    content = content.replace(stateTarget, stateReplacement);
} else {
    console.log('State target not found.');
}

// 3. Add tab switcher and conditional search box/ingestion card
const searchBoxTarget = `        {/* Search box */}
        {!isAnalyzing && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <div className="flex gap-3 mb-4">
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
                className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        )}`;

const searchBoxReplacement = `        {/* Sub-tab Switcher */}
        {!isAnalyzing && (
          <div className="flex border-b border-gray-200 mb-8 justify-center gap-8">
            <button
              onClick={() => setActiveSubTab('search')}
              className={\`pb-3 text-sm font-medium border-b-2 transition-all \${
                activeSubTab === 'search'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }\`}
            >
              🔍 Stock Analysis
            </button>
            <button
              onClick={() => setActiveSubTab('ingest')}
              className={\`pb-3 text-sm font-medium border-b-2 transition-all \${
                activeSubTab === 'ingest'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }\`}
            >
              📂 Knowledge Base Ingestion
            </button>
          </div>
        )}

        {/* Search box */}
        {!isAnalyzing && activeSubTab === 'search' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <div className="flex gap-3 mb-4">
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
                className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        )}`;

if (content.includes(searchBoxTarget)) {
    content = content.replace(searchBoxTarget, searchBoxReplacement);
} else {
    console.log('Search box target not found.');
}

// 4. Update recent list conditional displays
const recentTarget1 = `        {/* Recent analyses */}
        {!isAnalyzing && recent.length > 0 && (`
const recentReplacement1 = `        {/* Recent analyses */}
        {!isAnalyzing && activeSubTab === 'search' && recent.length > 0 && (`

if (content.includes(recentTarget1)) {
    content = content.replace(recentTarget1, recentReplacement1);
} else {
    console.log('Recent target 1 already patched or not found.');
}

const recentTarget2 = `        {!isAnalyzing && recent.length === 0 && (`
const recentReplacement2 = `        {!isAnalyzing && activeSubTab === 'search' && recent.length === 0 && (`

if (content.includes(recentTarget2)) {
    content = content.replace(recentTarget2, recentReplacement2);
} else {
    console.log('Recent target 2 already patched or not found.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched page.tsx!');
