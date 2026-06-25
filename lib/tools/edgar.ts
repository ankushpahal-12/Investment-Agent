// ─── SEC EDGAR Filing Fetcher ─────────────────────────────────────────────────
// Auto-downloads 10-K / 10-Q filings from SEC EDGAR for a given ticker.
// SEC requires a specific User-Agent header for all requests.

import { fetchWithRetry } from '../utils/rateLimiter'

const EDGAR_USER_AGENT = 'InvestmentResearchAgent/1.0 (ankushpayal58@gmail.com)'
const EDGAR_BASE = 'https://efts.sec.gov/LATEST'
const EDGAR_ARCHIVES = 'https://www.sec.gov/Archives/edgar/data'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EdgarFiling {
    accessionNumber: string
    filingDate: string
    reportDate: string
    form: string
    primaryDocument: string
    primaryDocDescription: string
    filingUrl: string
    companyName: string
    cik: string
}

// ─── Resolve ticker → CIK ────────────────────────────────────────────────────

export async function resolveTickerToCIK(ticker: string): Promise<string | null> {
    try {
        const response = await fetchWithRetry(
            `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=${encodeURIComponent(ticker)}&type=10-K&dateb=&owner=include&count=1&search_text=&action=getcompany&output=atom`,
            {
                headers: { 'User-Agent': EDGAR_USER_AGENT, 'Accept': 'application/atom+xml' },
            },
            { maxRetries: 2 }
        )

        if (!response.ok) {
            // Fallback: try the company tickers JSON
            return await resolveViaTickers(ticker)
        }

        const text = await response.text()
        const cikMatch = text.match(/<cik>(\d+)<\/cik>/)
        if (cikMatch?.[1]) {
            return cikMatch[1].padStart(10, '0')
        }

        return await resolveViaTickers(ticker)
    } catch (err) {
        console.warn('EDGAR CIK resolution failed:', err)
        return await resolveViaTickers(ticker)
    }
}

async function resolveViaTickers(ticker: string): Promise<string | null> {
    try {
        const response = await fetchWithRetry(
            'https://www.sec.gov/files/company_tickers.json',
            { headers: { 'User-Agent': EDGAR_USER_AGENT } },
            { maxRetries: 2 }
        )

        if (!response.ok) return null

        const data = await response.json() as Record<string, { cik_str: number; ticker: string; title: string }>
        const entry = Object.values(data).find(
            e => e.ticker.toUpperCase() === ticker.toUpperCase()
        )

        if (entry) {
            return String(entry.cik_str).padStart(10, '0')
        }
        return null
    } catch {
        return null
    }
}

// ─── Search for filings ──────────────────────────────────────────────────────

export async function searchFilings(
    ticker: string,
    formType: '10-K' | '10-Q' = '10-K',
    limit = 5
): Promise<EdgarFiling[]> {
    try {
        const cik = await resolveTickerToCIK(ticker)
        if (!cik) {
            console.warn(`EDGAR: Could not resolve CIK for ticker "${ticker}"`)
            return []
        }

        const cikNum = parseInt(cik, 10)
        const response = await fetchWithRetry(
            `https://data.sec.gov/submissions/CIK${cik}.json`,
            { headers: { 'User-Agent': EDGAR_USER_AGENT } },
            { maxRetries: 2 }
        )

        if (!response.ok) {
            console.warn(`EDGAR submissions fetch failed: ${response.status}`)
            return []
        }

        const data = await response.json() as {
            cik: string
            entityType: string
            name: string
            filings: {
                recent: {
                    accessionNumber: string[]
                    filingDate: string[]
                    reportDate: string[]
                    form: string[]
                    primaryDocument: string[]
                    primaryDocDescription: string[]
                }
            }
        }

        const recent = data.filings.recent
        const filings: EdgarFiling[] = []

        for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
            if (recent.form[i] === formType) {
                const accession = recent.accessionNumber[i].replace(/-/g, '')
                filings.push({
                    accessionNumber: recent.accessionNumber[i],
                    filingDate: recent.filingDate[i],
                    reportDate: recent.reportDate[i],
                    form: recent.form[i],
                    primaryDocument: recent.primaryDocument[i],
                    primaryDocDescription: recent.primaryDocDescription[i] || `${formType} Filing`,
                    filingUrl: `${EDGAR_ARCHIVES}/${cikNum}/${accession}/${recent.primaryDocument[i]}`,
                    companyName: data.name,
                    cik: cik,
                })
            }
        }

        console.log(`EDGAR: Found ${filings.length} ${formType} filings for ${ticker} (CIK: ${cik})`)
        return filings
    } catch (err) {
        console.error('EDGAR filing search failed:', err)
        return []
    }
}

// ─── Download filing as Buffer ───────────────────────────────────────────────

export async function downloadFiling(filingUrl: string): Promise<Buffer | null> {
    try {
        console.log(`EDGAR: Downloading filing from ${filingUrl}`)
        const response = await fetchWithRetry(
            filingUrl,
            { headers: { 'User-Agent': EDGAR_USER_AGENT } },
            { maxRetries: 2, baseDelayMs: 1000 } // SEC rate limits: 10 req/sec
        )

        if (!response.ok) {
            console.warn(`EDGAR download failed: ${response.status}`)
            return null
        }

        const contentType = response.headers.get('content-type') ?? ''

        // If it's a PDF, return directly
        if (contentType.includes('pdf')) {
            const arrayBuffer = await response.arrayBuffer()
            return Buffer.from(arrayBuffer)
        }

        // If it's HTML (most EDGAR filings are HTML), return the HTML as buffer
        // The PDF parser won't work on HTML — we'll need to treat it as text
        const text = await response.text()
        return Buffer.from(text, 'utf-8')
    } catch (err) {
        console.error('EDGAR filing download failed:', err)
        return null
    }
}

// ─── Parse HTML filing to text (for non-PDF filings) ─────────────────────────

export function parseHtmlFilingToPages(htmlBuffer: Buffer): { page: number; text: string }[] {
    const html = htmlBuffer.toString('utf-8')

    // Strip HTML tags, decode entities, normalize whitespace
    const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, '  ')
        .replace(/<\/th>/gi, '  ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#\d+;/g, '')
        .replace(/\n{4,}/g, '\n\n\n')  // collapse excessive newlines
        .trim()

    // Split into ~3000 char "pages" for chunking consistency
    const PAGE_SIZE = 3000
    const pages: { page: number; text: string }[] = []
    for (let i = 0; i < text.length; i += PAGE_SIZE) {
        const pageText = text.slice(i, i + PAGE_SIZE).trim()
        if (pageText.length > 50) {
            pages.push({ page: pages.length + 1, text: pageText })
        }
    }

    return pages
}
