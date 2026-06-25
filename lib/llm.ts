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

// ─── Decision LLM (the ONLY LLM in the system) ────────────────────────────────

export const decisionLLM = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: getDecisionKey(),
    temperature: 0.2,
})