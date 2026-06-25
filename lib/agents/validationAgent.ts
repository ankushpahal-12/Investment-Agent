// ─── Input Validation Agent ───────────────────────────────────────────────────
// First node in the pipeline — validates that company name resolves to a real
// ticker before running the full 5-agent pipeline. Fail-fast on bad input.
// NO LLM call — purely rule-based using Finnhub API.

import { AgentState } from '../../types'
import { resolveTicker, getCompanyProfile } from '../tools/finnhub'

export interface ValidationResult {
    valid: boolean
    ticker?: string
    companyName?: string
    error?: string
}

export async function validationAgent(
    state: AgentState
): Promise<Partial<AgentState>> {
    console.log(`Validation Agent: checking "${state.company}"`)

    try {
        const company = state.company?.trim()

        // ── Basic input checks ────────────────────────────────────────────────
        if (!company || company.length < 2) {
            return {
                error: 'Validation failed: Company name is too short. Please enter a valid company name or ticker.',
            }
        }

        if (company.length > 100) {
            return {
                error: 'Validation failed: Input is too long. Please enter a company name or ticker symbol.',
            }
        }

        // Reject obviously invalid inputs (only numbers, special chars, etc.)
        if (/^[^a-zA-Z]*$/.test(company)) {
            return {
                error: `Validation failed: "${company}" doesn't appear to be a valid company name. Please enter a company name like "Apple" or a ticker like "AAPL".`,
            }
        }

        // ── Finnhub ticker resolution ─────────────────────────────────────────
        const ticker = await resolveTicker(company)

        if (!ticker) {
            return {
                error: `Validation failed: Could not find a stock ticker for "${company}". Check the spelling or try the ticker symbol directly.`,
            }
        }

        // ── Finnhub company profile ───────────────────────────────────────────
        const profile = await getCompanyProfile(ticker)

        if (!profile || (!profile.name && !profile.ticker)) {
            // Ticker resolved but no profile — might be delisted or very obscure
            console.warn(`Validation Agent: ticker "${ticker}" found but no profile data. Proceeding with caution.`)
            return {
                ticker,
                error: undefined,
            }
        }

        // ── Normalize company name from profile ───────────────────────────────
        const normalizedName = profile.name || company
        console.log(`Validation Agent: ✓ "${company}" → ${ticker} (${normalizedName})`)

        return {
            ticker,
            error: undefined,
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        // If Finnhub itself is down, don't block the pipeline — let it proceed
        if (message.includes('ECONNREFUSED') || message.includes('timeout') || message.includes('NetworkError')) {
            console.warn(`Validation Agent: Finnhub unreachable (${message}). Proceeding without validation.`)
            return { error: undefined }
        }

        console.error('Validation Agent failed:', message)
        return {
            error: `Validation failed: ${message}`,
        }
    }
}
