// ─── RAG Vector Store ─────────────────────────────────────────────────────────
// Uses ChromaDB for persistent vector storage.
// Falls back to MongoDB or in-memory search if ChromaDB is unavailable.
// 
// ChromaDB setup (Windows):
//   pip install chromadb
//   chroma run --path ./chroma_data
//   → Server starts at http://localhost:8000

import { connectToDatabase } from '../mongodb'
import { fetchWithRetry } from '../utils/rateLimiter'
import { RAGQualityStats } from '../../types'

const CHROMA_URL = process.env.CHROMA_URL ?? 'http://localhost:8000'
// Changed collection name to avoid dimensions clash between n-gram (64) and Gemini (768)
const COLLECTION_NAME = 'investment_docs_gemini'

// ChromaDB Metadata type (string | number | boolean values only)
type ChromaMetadata = Record<string, string | number | boolean>

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RAGDocument {
    id: string
    content: string
    metadata: {
        company: string
        type: 'company_profile' | 'financial_summary' | 'news_article' | 'risk_summary' | 'industry_report' | '10k' | '10q' | 'investor_presentation' | 'other'
        timestamp: string
    }
}

// ─── Simple in-memory fallback (TF-IDF cosine similarity) ────────────────────
// Kept for backward compatibility and extreme edge cases

const inMemoryStore: RAGDocument[] = []

function tokenize(text: string): Map<string, number> {
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2)
    const freq = new Map<string, number>()
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
    return freq
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0
    let normA = 0
    let normB = 0
    for (const [k, v] of a) {
        dot += v * (b.get(k) ?? 0)
        normA += v * v
    }
    for (const [, v] of b) normB += v * v
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
}

// ─── Vector Cosine Similarity ────────────────────────────────────────────────

function cosineSimilarityVectors(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
}

// ─── ChromaDB client (lazy-loaded) ───────────────────────────────────────────

let chromaAvailable: boolean | null = null

async function tryGetChromaCollection() {
    try {
        const { ChromaClient } = await import('chromadb')
        const url = new URL(CHROMA_URL)
        
        const tenant = process.env.CHROMA_TENANT || undefined
        const database = process.env.CHROMA_DATABASE || undefined
        const apiKey = process.env.CHROMA_API_KEY || undefined

        const client = new ChromaClient({
            host: url.hostname,
            port: url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80),
            ssl: url.protocol === 'https:',
            tenant: tenant,
            database: database,
            auth: apiKey ? {
                provider: "token",
                credentials: apiKey
            } : undefined
        })
        // Test connectivity
        await client.heartbeat()
        const collection = await client.getOrCreateCollection({
            name: COLLECTION_NAME,
            metadata: { description: 'Investment research documents' },
        })
        chromaAvailable = true
        return collection
    } catch (err) {
        if (chromaAvailable !== false) {
            console.warn('⚠️  ChromaDB unavailable — using MongoDB RAG fallback. Details:', err)
            chromaAvailable = false
        }
        return null
    }
}

// ─── Simple embedding (char n-gram based, 64-dim) ────────────────────────────
// @deprecated — only used inside fallbackEmbed768 when no Gemini API key is
// configured. All production embeddings should go through getGeminiEmbedding()
// or batchGetGeminiEmbeddings() for semantic quality.

function simpleEmbed(text: string): number[] {
    const norm = text.toLowerCase().slice(0, 512)
    const vec = new Array(64).fill(0)
    for (let i = 0; i < norm.length - 1; i++) {
        const code = (norm.charCodeAt(i) * 31 + norm.charCodeAt(i + 1)) % vec.length
        vec[code] += 1
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
    return vec.map(v => v / mag)
}

// ─── Padded local fallback (768-dim) ──────────────────────────────────────────
// Ensures dimension consistency in ChromaDB if Gemini API fails or key is missing

function fallbackEmbed768(text: string): number[] {
    const vec = simpleEmbed(text)
    const padded = new Array(768).fill(0)
    for (let i = 0; i < vec.length; i++) {
        padded[i] = vec[i]
    }
    return padded
}

// ─── Gemini Embeddings ────────────────────────────────────────────────────────

export async function getGeminiEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY
    if (!apiKey) {
        console.warn('⚠️ GEMINI_API_KEY is missing from environment. Using local 768-padded fallback.')
        return fallbackEmbed768(text)
    }

    try {
        const response = await fetchWithRetry(
            `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'models/text-embedding-004',
                    content: {
                        parts: [{ text }],
                    },
                }),
            },
            { maxRetries: 3, baseDelayMs: 500 }
        )

        if (!response.ok) {
            const errBody = await response.text()
            console.warn(`Gemini Embedding API error: ${response.status} - ${errBody}. Using local fallback.`)
            return fallbackEmbed768(text)
        }

        const resData = await response.json()
        const embedding = resData.embedding?.values
        if (!embedding || !Array.isArray(embedding)) {
            console.warn('Gemini Embedding API returned invalid format. Using local fallback.')
            return fallbackEmbed768(text)
        }
        return embedding
    } catch (err) {
        console.warn('Error fetching Gemini embedding:', err, 'Using local fallback.')
        return fallbackEmbed768(text)
    }
}

// ─── Batch Gemini Embeddings ──────────────────────────────────────────────────
// Uses batchEmbedContents to embed up to 100 texts in a single API call.
// Falls back to sequential getGeminiEmbedding() if the batch endpoint fails.

const BATCH_SIZE = 100

export async function batchGetGeminiEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY
    if (!apiKey) {
        console.warn('⚠️ GEMINI_API_KEY missing — batch embedding falling back to local 768-padded vectors.')
        return texts.map(t => fallbackEmbed768(t))
    }

    const allEmbeddings: number[][] = []

    for (let batchStart = 0; batchStart < texts.length; batchStart += BATCH_SIZE) {
        const batch = texts.slice(batchStart, batchStart + BATCH_SIZE)

        try {
            const response = await fetchWithRetry(
                `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requests: batch.map(text => ({
                            model: 'models/text-embedding-004',
                            content: { parts: [{ text }] },
                        })),
                    }),
                },
                { maxRetries: 3, baseDelayMs: 500 }
            )

            if (!response.ok) {
                const errBody = await response.text()
                console.warn(`Gemini batch embedding API error: ${response.status} - ${errBody}. Falling back to sequential.`)
                // Fall back to sequential for this batch
                for (const text of batch) {
                    allEmbeddings.push(await getGeminiEmbedding(text))
                }
                continue
            }

            const resData = await response.json()
            const batchEmbeddings = resData.embeddings
            if (!Array.isArray(batchEmbeddings) || batchEmbeddings.length !== batch.length) {
                console.warn('Gemini batch embedding returned unexpected format. Falling back to sequential.')
                for (const text of batch) {
                    allEmbeddings.push(await getGeminiEmbedding(text))
                }
                continue
            }

            for (const emb of batchEmbeddings) {
                allEmbeddings.push(emb.values)
            }

            console.log(`Gemini batch embedding: embedded ${batch.length} texts (batch ${Math.floor(batchStart / BATCH_SIZE) + 1})`)

            // Small delay between batches to avoid rate limits
            if (batchStart + BATCH_SIZE < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 200))
            }
        } catch (err) {
            console.warn('Batch embedding failed, falling back to sequential:', err)
            for (const text of batch) {
                allEmbeddings.push(await getGeminiEmbedding(text))
            }
        }
    }

    return allEmbeddings
}

// ─── MongoDB persistent backup and fallback search ───────────────────────────

async function saveChunksToMongo(
    chunks: { id: string; content: string; embedding: number[]; company: string; metadata: any }[]
): Promise<void> {
    try {
        const db = await connectToDatabase()
        const col = db.collection('rag_chunks')
        await col.createIndex({ company: 1 })
        await col.createIndex({ id: 1 }, { unique: true })

        for (const chunk of chunks) {
            await col.updateOne(
                { id: chunk.id },
                { $set: chunk },
                { upsert: true }
            )
        }
        console.log(`RAG: Saved ${chunks.length} chunks to MongoDB`)
    } catch (err) {
        console.error('Failed to save RAG chunks to MongoDB:', err)
    }
}

async function queryChunksFromMongo(
    queryEmbedding: number[],
    company: string,
    k = 5
): Promise<string> {
    try {
        const db = await connectToDatabase()
        const col = db.collection('rag_chunks')
        
        // Retrieve all chunks for this company (case-insensitive)
        const docs = await col.find({ company: { $regex: new RegExp(`^${company}$`, 'i') } }).toArray()
        if (docs.length === 0) return ''

        // Rank by local vector similarity on Gemini embeddings
        const scored = docs.map(doc => ({
            content: doc.content,
            score: cosineSimilarityVectors(queryEmbedding, doc.embedding ?? [])
        }))

        scored.sort((a, b) => b.score - a.score)
        const topDocs = scored.slice(0, k).map(s => s.content)
        return topDocs.join('\n\n---\n\n')
    } catch (err) {
        console.error('Failed to query RAG chunks from MongoDB:', err)
        return ''
    }
}

// ─── Chunk text ───────────────────────────────────────────────────────────────

function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
    const chunks: string[] = []
    let start = 0
    while (start < text.length) {
        chunks.push(text.slice(start, start + chunkSize))
        start += chunkSize - overlap
        if (start + chunkSize >= text.length && start < text.length) {
            chunks.push(text.slice(start))
            break
        }
    }
    return chunks.filter(c => c.trim().length > 50)
}

// ─── Add documents (batch-optimized) ──────────────────────────────────────────

export async function addDocumentsToRAG(docs: RAGDocument[]): Promise<void> {
    if (docs.length === 0) return

    const collection = await tryGetChromaCollection()
    const mongoChunks: any[] = []

    try {
        // Step 1: Collect all chunk texts and metadata first
        const ids: string[] = []
        const documents: string[] = []
        const metadatas: ChromaMetadata[] = []
        const chunkMetas: { company: string; type: string; timestamp: string; chunkIndex: number }[] = []

        for (const doc of docs) {
            const chunks = chunkText(doc.content)
            for (const [i, chunk] of chunks.entries()) {
                const chunkId = `${doc.id}_${i}`
                ids.push(chunkId)
                documents.push(chunk)
                metadatas.push({
                    company: doc.metadata.company,
                    type: doc.metadata.type,
                    timestamp: doc.metadata.timestamp,
                    chunkIndex: i,
                } satisfies ChromaMetadata)
                chunkMetas.push({
                    company: doc.metadata.company,
                    type: doc.metadata.type,
                    timestamp: doc.metadata.timestamp,
                    chunkIndex: i,
                })
            }
        }

        console.log(`RAG: Generating embeddings for ${documents.length} chunks using batch API...`)

        // Step 2: Batch-embed all chunk texts at once
        const embeddings = await batchGetGeminiEmbeddings(documents)

        // Step 3: Build MongoDB backup records
        for (let j = 0; j < ids.length; j++) {
            mongoChunks.push({
                id: ids[j],
                content: documents[j],
                embedding: embeddings[j],
                company: chunkMetas[j].company,
                metadata: {
                    type: chunkMetas[j].type,
                    timestamp: chunkMetas[j].timestamp,
                    chunkIndex: chunkMetas[j].chunkIndex,
                }
            })
        }

        // Step 4: Upsert to ChromaDB if active
        if (collection) {
            await collection.upsert({ ids, documents, metadatas, embeddings })
            console.log(`RAG: Added ${ids.length} chunks to ChromaDB`)
        }

        // Step 5: Always persist in MongoDB (handles persistent fallback and backups)
        await saveChunksToMongo(mongoChunks)

    } catch (err) {
        console.warn('RAG upsert failed, falling back to local memory storage:', err)
        inMemoryStore.push(...docs)
    }
}

// ─── RAG Retrieval Result (with quality stats) ───────────────────────────────

export interface RAGRetrievalResult {
    text: string
    chunksRetrieved: number
    tables: number
    footnotes: number
    textBlocks: number
    sourcesUsed: 'chromadb' | 'mongodb' | 'in-memory' | 'none'
}

// ─── Retrieve top-k relevant chunks ──────────────────────────────────────────

export async function retrieveRelevantContext(
    query: string,
    company: string,
    k = 5
): Promise<RAGRetrievalResult> {
    const queryEmbedding = await getGeminiEmbedding(query)
    const collection = await tryGetChromaCollection()

    if (collection) {
        // ChromaDB path
        try {
            const results = await collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: k,
                where: { company },
            })
            const docs = results.documents?.[0] ?? []
            if (docs.length > 0) {
                const filtered = docs.filter(Boolean) as string[]
                return {
                    text: filtered.join('\n\n---\n\n'),
                    chunksRetrieved: filtered.length,
                    tables: filtered.filter(d => d.startsWith('[TABLE]')).length,
                    footnotes: filtered.filter(d => d.startsWith('[FOOTNOTE]')).length,
                    textBlocks: filtered.filter(d => !d.startsWith('[TABLE]') && !d.startsWith('[FOOTNOTE]')).length,
                    sourcesUsed: 'chromadb',
                }
            }
        } catch (err) {
            console.warn('ChromaDB query failed, using MongoDB/in-memory fallback:', err)
        }
    }

    // MongoDB persistent fallback path
    const mongoResult = await queryChunksFromMongo(queryEmbedding, company, k)
    if (mongoResult) {
        const chunks = mongoResult.split('\n\n---\n\n')
        return {
            text: mongoResult,
            chunksRetrieved: chunks.length,
            tables: chunks.filter(d => d.startsWith('[TABLE]')).length,
            footnotes: chunks.filter(d => d.startsWith('[FOOTNOTE]')).length,
            textBlocks: chunks.filter(d => !d.startsWith('[TABLE]') && !d.startsWith('[FOOTNOTE]')).length,
            sourcesUsed: 'mongodb',
        }
    }

    // In-memory fallback (legacy fallback if DB queries fail completely)
    const queryTokens = tokenize(query)
    const companyDocs = inMemoryStore.filter(
        d => d.metadata.company.toLowerCase() === company.toLowerCase()
    )
    if (companyDocs.length === 0) return { text: '', chunksRetrieved: 0, tables: 0, footnotes: 0, textBlocks: 0, sourcesUsed: 'none' }

    const scored = companyDocs
        .flatMap(doc => chunkText(doc.content).map(chunk => ({ chunk, score: cosineSimilarity(queryTokens, tokenize(chunk)) })))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)

    const text = scored.map(s => s.chunk).join('\n\n---\n\n')
    return {
        text,
        chunksRetrieved: scored.length,
        tables: scored.filter(s => s.chunk.startsWith('[TABLE]')).length,
        footnotes: scored.filter(s => s.chunk.startsWith('[FOOTNOTE]')).length,
        textBlocks: scored.filter(s => !s.chunk.startsWith('[TABLE]') && !s.chunk.startsWith('[FOOTNOTE]')).length,
        sourcesUsed: 'in-memory',
    }
}

// ─── SEC-Specific Multi-Query Retrieval ──────────────────────────────────────
// Issues multiple targeted queries for institutional-grade context from
// ingested 10-K, 10-Q, and investor presentation filings.

const SEC_QUERY_TOPICS = [
    'debt covenants borrowing capacity credit facility restrictions',
    'pending lawsuits litigation legal proceedings contingencies claims',
    'revenue breakdown by segment geographic product line',
    'goodwill impairment intangible assets write-downs',
    'management discussion analysis outlook guidance forward-looking',
] as const

export async function retrieveSECContext(
    company: string,
    additionalTopics: string[] = [],
    topKPerQuery = 3
): Promise<RAGRetrievalResult> {
    const topics = [...SEC_QUERY_TOPICS, ...additionalTopics]
    const seenChunks = new Set<string>()
    const results: string[] = []
    let totalTables = 0, totalFootnotes = 0, totalText = 0
    let source: RAGRetrievalResult['sourcesUsed'] = 'none'

    for (const topic of topics) {
        const query = `${company} ${topic}`
        try {
            const result = await retrieveRelevantContext(query, company, topKPerQuery)
            if (!result.text) continue
            if (source === 'none') source = result.sourcesUsed

            // Deduplicate chunks across queries (same text may match multiple queries)
            const chunks = result.text.split('\n\n---\n\n')
            for (const chunk of chunks) {
                const fingerprint = chunk.trim().slice(0, 200)
                if (!seenChunks.has(fingerprint)) {
                    seenChunks.add(fingerprint)
                    results.push(chunk)
                    if (chunk.startsWith('[TABLE]')) totalTables++
                    else if (chunk.startsWith('[FOOTNOTE]')) totalFootnotes++
                    else totalText++
                }
            }
        } catch (err) {
            console.warn(`SEC retrieval failed for topic "${topic}":`, err)
        }
    }

    if (results.length === 0) {
        return { text: '', chunksRetrieved: 0, tables: 0, footnotes: 0, textBlocks: 0, sourcesUsed: 'none' }
    }

    console.log(`SEC Context: retrieved ${results.length} unique chunks for ${company} across ${topics.length} queries`)
    return {
        text: results.join('\n\n---\n\n'),
        chunksRetrieved: results.length,
        tables: totalTables,
        footnotes: totalFootnotes,
        textBlocks: totalText,
        sourcesUsed: source,
    }
}

// ─── Build documents from agent outputs ──────────────────────────────────────

export function buildCompanyProfileDoc(company: string, researchData: Record<string, unknown>): RAGDocument {
    const content = `
Company: ${company}
Overview: ${researchData.overview ?? 'N/A'}
Sector: ${researchData.sector ?? 'N/A'}
CEO: ${researchData.CEO ?? 'N/A'}
Founded: ${researchData.founded ?? 'N/A'}
Headquarters: ${researchData.headquarters ?? 'N/A'}
Business Model: ${researchData.businessModel ?? 'N/A'}
Key Strengths: ${Array.isArray(researchData.keyStrengths) ? researchData.keyStrengths.join(', ') : 'N/A'}
Competitors: ${Array.isArray(researchData.competitors) ? researchData.competitors.join(', ') : 'N/A'}
Products: ${Array.isArray(researchData.products) ? researchData.products.join(', ') : 'N/A'}
    `.trim()

    return {
        id: `${company}_profile_${Date.now()}`,
        content,
        metadata: { company, type: 'company_profile', timestamp: new Date().toISOString() },
    }
}

export function buildFinancialDoc(company: string, financialData: Record<string, unknown>): RAGDocument {
    const content = `
Financial Summary for ${company}
Ticker: ${financialData.ticker ?? 'N/A'}
Current Price: ${financialData.currentPrice ?? 'N/A'}
Market Cap: ${financialData.marketCap ?? 'N/A'}
P/E Ratio: ${financialData.peRatio ?? 'N/A'}
EPS: ${financialData.eps ?? 'N/A'}
Revenue: ${financialData.revenue ?? 'N/A'}
Profit Margin: ${financialData.profitMargin ?? 'N/A'}%
Debt/Equity: ${financialData.debtToEquity ?? 'N/A'}
YoY Growth: ${financialData.yoyGrowth ?? 'N/A'}%
52W High: ${financialData.high52Week ?? 'N/A'}
52W Low: ${financialData.low52Week ?? 'N/A'}
Beta: ${financialData.beta ?? 'N/A'}
Dividend Yield: ${financialData.dividendYield ?? 'N/A'}
    `.trim()

    return {
        id: `${company}_financial_${Date.now()}`,
        content,
        metadata: { company, type: 'financial_summary', timestamp: new Date().toISOString() },
    }
}

export function buildNewsDoc(company: string, headline: string, content: string): RAGDocument {
    return {
        id: `${company}_news_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        content: `${headline}\n\n${content}`,
        metadata: { company, type: 'news_article', timestamp: new Date().toISOString() },
    }
}
