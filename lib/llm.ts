// ─── LLM Configuration ────────────────────────────────────────────────────────
// Only ONE LLM instance — used exclusively by the Decision Agent
// All other agents are LLM-free (pure data fetching + rule-based logic)

import { ChatGroq } from '@langchain/groq'

// ─── Key resolution ───────────────────────────────────────────────────────────
// Try multiple env vars in order of preference

function getDecisionKey(): string {
    return (
        process.env.GROQ_API_KEY_DECISION ??
        process.env.GROQ_API_KEY_RESEARCH ??
        process.env.GROQ_API_KEY_FINANCIAL ??
        process.env.GROQ_API_KEY_NEWS ??
        process.env.GROQ_API_KEY ??
        ''
    ) || 'MISSING_API_KEY'
}

if (!process.env.GROQ_API_KEY_DECISION && !process.env.GROQ_API_KEY_RESEARCH) {
    console.warn('⚠️  No Groq API key found. Add GROQ_API_KEY_DECISION to your .env file.')
}

function getAdvancedKey(): string {
    return (
        process.env.GROQ_API_KEY_ADVANCED ??
        getDecisionKey()
    )
}

// ─── Decision LLM (with streaming enabled) ───────────────────────────────────

export const decisionLLM = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: getDecisionKey(),
    temperature: 0.2,
    streaming: true,
})

// ─── Advanced LLM (for DCF, Audit, and Chat-with-Filings) ────────────────────

export const advancedLLM = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: getAdvancedKey(),
    temperature: 0.1,
    streaming: true,
})