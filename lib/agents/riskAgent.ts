// ─── Risk Agent ───────────────────────────────────────────────────────────────
// Fully rule-based — derives risks from financial ratios, sentiment, and sector
// NO LLM call

import { AgentState, RiskData } from '../../types'

// ─── Risk category type (extends RiskData) ────────────────────────────────────
// Adds the 4 explicit categories required by the spec

export interface ExtendedRiskData extends RiskData {
    marketRisk: string[]
    regulatoryRisk: string[]
    competitionRisk: string[]
    technologyRisk: string[]
}

// ─── Sector-based regulatory risks ───────────────────────────────────────────

const SECTOR_REGULATORY_RISKS: Record<string, string[]> = {
    'Technology': ['Antitrust scrutiny in US and EU markets', 'Data privacy regulations (GDPR, CCPA)', 'AI governance and compliance requirements'],
    'Banks': ['Basel III / Basel IV capital requirements', 'Central bank monetary policy shifts', 'AML/KYC compliance overhead'],
    'Pharmaceuticals': ['FDA / EMA drug approval uncertainty', 'Patent cliff exposure', 'Price control legislation risk'],
    'Energy': ['Carbon emissions regulations', 'Environmental compliance costs', 'Geopolitical energy policy shifts'],
    'Financial Services': ['SEC/SEBI regulatory changes', 'Fintech disruption regulation', 'Capital adequacy requirements'],
    'Healthcare': ['Insurance reimbursement policy changes', 'Medical device approval delays', 'Healthcare reform legislation'],
}

const SECTOR_TECH_RISKS: Record<string, string[]> = {
    'Technology': ['Rapid technology obsolescence risk', 'Cybersecurity and data breach exposure', 'Dependency on cloud infrastructure providers'],
    'Banks': ['Legacy system modernization costs', 'Fintech disruption from neo-banks', 'Cybersecurity and fraud risks'],
    'Pharmaceuticals': ['R&D failure rates for pipeline drugs', 'Bioinformatics and AI competition', 'Manufacturing process disruption'],
    'Retail': ['E-commerce disruption from pure-play digital players', 'Supply chain automation requirements', 'Last-mile delivery innovation gap'],
    'Automobiles': ['EV transition acceleration risk', 'Autonomous driving technology uncertainty', 'Battery supply chain dependency'],
}

const SECTOR_COMPETITION_RISKS: Record<string, string[]> = {
    'Technology': ['Hyperscaler competition (AWS, Azure, GCP)', 'Open-source alternatives threatening margins', 'Talent wars with Big Tech'],
    'Banks': ['Fintech and BNPL disruptors eroding market share', 'Super-app consolidation in payments', 'Peer-to-peer lending alternatives'],
    'Retail': ['Amazon and e-commerce price pressure', 'Private-label brands from competitors', 'Customer loyalty fragmentation'],
    'Pharmaceuticals': ['Generic drug manufacturers post-patent', 'Biosimilar competition for biologics', 'International pharma cost competition'],
    'Automobiles': ['Tesla and EV-first competitor disruption', 'Chinese OEM market entry', 'Ride-sharing reducing vehicle ownership'],
}

// ─── Rule-based risk calculator ───────────────────────────────────────────────

function assessRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH' {
    if (score < 30) return 'LOW'
    if (score < 50) return 'MEDIUM'
    if (score < 70) return 'HIGH'
    return 'VERY HIGH'
}

function assessMoat(
    sector: string,
    profitMargin: number | null,
    de: number | null,
    growth: number | null
): { moatStrength: 'STRONG' | 'MODERATE' | 'WEAK'; moatComment: string } {
    let score = 0
    if (profitMargin !== null && profitMargin !== undefined) {
        if (profitMargin > 20) score += 2
        else if (profitMargin > 10) score += 1
    }

    if (de !== null && de !== undefined && de < 0.5) score += 1
    if (growth !== null && growth !== undefined && growth > 10) score += 1

    const techSectors = ['Technology', 'Software', 'Pharmaceuticals']
    if (techSectors.some(s => sector.toLowerCase().includes(s.toLowerCase()))) score += 1

    if (score >= 4) return {
        moatStrength: 'STRONG',
        moatComment: `Strong competitive moat driven by ${profitMargin !== null ? 'high margins (' + profitMargin.toFixed(1) + '%)' : 'margins'} and sector dominance.`,
    }
    if (score >= 2) return {
        moatStrength: 'MODERATE',
        moatComment: `Moderate competitive moat with some pricing power but vulnerable to disruption.`,
    }
    return {
        moatStrength: 'WEAK',
        moatComment: `Weak moat — operates in a highly competitive sector with thin margins.`,
    }
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function riskAgent(
    state: AgentState
): Promise<Partial<AgentState>> {

    console.log(`Risk Agent starting for: ${state.company}`)

    try {
        const research = state.researchData
        const financial = state.financialData
        const news = state.newsData

        const sector = research?.sector ?? 'Unknown'
        const peRatio = financial?.peRatio ?? null
        const de = financial?.debtToEquity ?? null
        const margin = financial?.profitMargin ?? null
        const growth = financial?.yoyGrowth ?? null
        const beta = financial?.beta ?? null
        const sentimentScore = news?.sentimentScore ?? 0

        // ── Compute risk score (0-100) ────────────────────────────────────────
        let riskScore = 40   // base

        // Valuation risk
        if (peRatio !== null && peRatio !== undefined) {
            if (peRatio > 50) riskScore += 15
            else if (peRatio > 30) riskScore += 8
            else if (peRatio < 10 && peRatio > 0) riskScore -= 5
        }

        // Leverage risk
        if (de !== null && de !== undefined) {
            if (de > 3) riskScore += 15
            else if (de > 1.5) riskScore += 8
            else if (de < 0.5) riskScore -= 5
        }

        // Volatility risk
        if (beta !== null && beta !== undefined) {
            if (beta > 2) riskScore += 10
            else if (beta > 1.5) riskScore += 5
            else if (beta < 0.7) riskScore -= 5
        }

        // Profitability risk
        if (margin !== null && margin !== undefined) {
            if (margin < 0) riskScore += 15
            else if (margin < 5) riskScore += 5
            else if (margin > 20) riskScore -= 8
        }

        // Growth risk
        if (growth !== null && growth !== undefined) {
            if (growth < -10) riskScore += 10
            else if (growth > 20) riskScore -= 5
        }

        // News sentiment risk
        if (sentimentScore < -40) riskScore += 10
        else if (sentimentScore > 40) riskScore -= 5

        riskScore = Math.max(5, Math.min(95, riskScore))

        // ── Build risk lists ──────────────────────────────────────────────────

        const financialRisks: string[] = []
        if (margin !== null && margin !== undefined && margin < 0) {
            financialRisks.push(`Negative profit margin (${margin.toFixed(1)}%) — company burning cash`)
        }
        if (de !== null && de !== undefined && de > 2) {
            financialRisks.push(`High debt-to-equity ratio of ${de.toFixed(2)} — elevated financial leverage`)
        }
        if (peRatio !== null && peRatio !== undefined && peRatio > 40) {
            financialRisks.push(`High P/E of ${peRatio}× — expensive valuation at risk of de-rating`)
        }
        if (growth !== null && growth !== undefined && growth < 0) {
            financialRisks.push(`Revenue declined ${Math.abs(growth).toFixed(1)}% YoY — declining business`)
        }
        if (financialRisks.length === 0) financialRisks.push('No critical financial risk flags identified at this time')

        const macroRisks: string[] = [
            'Interest rate hikes reducing equity valuations',
            'Global economic slowdown impacting revenue',
            'Currency fluctuation risk for international operations',
            beta !== null && beta !== undefined && beta > 1.3 ? `High beta (${beta}×) amplifies losses in market downturns` : 'Moderate macro sensitivity',
        ]

        const regulatoryRisks = SECTOR_REGULATORY_RISKS[sector]
            ?? SECTOR_REGULATORY_RISKS[Object.keys(SECTOR_REGULATORY_RISKS).find(k => sector.toLowerCase().includes(k.toLowerCase())) ?? '']
            ?? ['General regulatory compliance risk', 'Corporate governance standards exposure', 'International trade and tariff risk']

        const competitiveRisks = SECTOR_COMPETITION_RISKS[sector]
            ?? SECTOR_COMPETITION_RISKS[Object.keys(SECTOR_COMPETITION_RISKS).find(k => sector.toLowerCase().includes(k.toLowerCase())) ?? '']
            ?? ['Established incumbents with scale advantages', 'New market entrants with disruptive pricing', 'Customer churn and loyalty risk']

        const technologyRisk = SECTOR_TECH_RISKS[sector]
            ?? SECTOR_TECH_RISKS[Object.keys(SECTOR_TECH_RISKS).find(k => sector.toLowerCase().includes(k.toLowerCase())) ?? '']
            ?? ['Digital transformation execution risk', 'Cybersecurity and data breach exposure', 'Technology obsolescence threat']

        const esgFlags: string[] = []
        if (sector.toLowerCase().includes('oil') || sector.toLowerCase().includes('energy')) {
            esgFlags.push('Carbon emissions reduction pressure from ESG investors')
        }
        if (de !== null && de !== undefined && de > 2) esgFlags.push('High leverage may attract governance scrutiny')

        const risks = [
            ...financialRisks.slice(0, 2),
            macroRisks[0],
            regulatoryRisks[0],
            competitiveRisks[0],
        ]

        const opportunities: string[] = []
        if (growth !== null && growth !== undefined && growth > 10) {
            opportunities.push(`Strong revenue growth of ${growth.toFixed(1)}% YoY presents expansion opportunity`)
        }
        if (margin !== null && margin !== undefined && margin > 15) {
            opportunities.push(`High profit margin of ${margin.toFixed(1)}% enables reinvestment in growth`)
        }
        if (sentimentScore > 30) opportunities.push('Positive news sentiment may attract institutional buyers')
        if (peRatio !== null && peRatio !== undefined && peRatio > 0 && peRatio < 15) {
            opportunities.push('Low valuation may represent a buying opportunity for value investors')
        }
        opportunities.push('Sector tailwinds from macro trends may drive outperformance')
        if (opportunities.length < 3) opportunities.push('Management operational efficiency improvements could unlock margin expansion')

        const { moatStrength, moatComment } = assessMoat(sector, margin, de, growth)

        const riskData: RiskData & { marketRisk: string[]; regulatoryRisk: string[]; competitionRisk: string[]; technologyRisk: string[] } = {
            risks,
            opportunities: opportunities.slice(0, 3),
            riskLevel: assessRiskLevel(riskScore),
            riskScore,
            macroRisks,
            competitiveRisks,
            financialRisks,
            regulatoryRisks,
            esgFlags,
            moatStrength,
            moatComment,
            // Spec-required category fields
            marketRisk: macroRisks,
            regulatoryRisk: regulatoryRisks,
            competitionRisk: competitiveRisks,
            technologyRisk,
        }

        console.log(`Risk Agent done — ${riskData.riskLevel} (score: ${riskScore})`)

        return { riskData, error: undefined }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Risk Agent failed:', message)

        return {
            riskData: {
                risks: ['Risk assessment unavailable'],
                opportunities: ['Opportunity assessment unavailable'],
                riskLevel: 'MEDIUM', riskScore: 50,
                macroRisks: [], competitiveRisks: [], financialRisks: [],
                regulatoryRisks: [], esgFlags: [],
                moatStrength: 'MODERATE', moatComment: 'Moat analysis unavailable',
            },
            error: `Risk Agent: ${message}`,
        }
    }
}