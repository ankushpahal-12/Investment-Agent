import { MongoClient, Db, Collection, ObjectId } from 'mongodb'
import { Verdict } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportDocument {
    _id?: string | ObjectId
    company: string
    ticker?: string
    analyzedAt: Date
    verdict: 'INVEST' | 'PASS' | Verdict
    confidence: number
    researchData: object
    financialData: object
    newsData: object
    riskData: object
    valuationData?: object
    reasoning: string
    error?: string
    ragContext?: string
    ragQuality?: {
        totalChunks: number
        tables: number
        footnotes: number
        textBlocks: number
        avgRelevanceScore: number
        queriesIssued: number
        sourcesUsed: string
    }
    // Legacy field support
    research?: object
    financial?: object
    news?: object
    risk?: object
}

// ─── Validation ───────────────────────────────────────────────────────────────

if (!process.env.MONGODB_URI) {
    console.warn(
        '⚠️  MONGODB_URI is missing from environment variables.\n' +
        'Add MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/investment_agent'
    )
}

const DB_NAME = 'investment_agent'
const CACHE_TTL_HOURS = 24

// ─── Connection cache ─────────────────────────────────────────────────────────

interface MongoCache {
    client: MongoClient | null
    db: Db | null
    promise: Promise<MongoClient> | null
}

declare global {
    var _mongoCache: MongoCache | undefined
}

const cache: MongoCache = global._mongoCache ?? { client: null, db: null, promise: null }
global._mongoCache = cache

// ─── Connect ──────────────────────────────────────────────────────────────────

export async function connectToDatabase(): Promise<Db> {
    if (cache.client && cache.db) {
        try {
            await cache.client.db('admin').command({ ping: 1 })
            return cache.db
        } catch {
            console.warn('MongoDB connection lost — reconnecting…')
            cache.client = null
            cache.db = null
            cache.promise = null
        }
    }

    if (cache.promise) {
        const client = await cache.promise
        cache.db = client.db(DB_NAME)
        return cache.db
    }

    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is missing from environment variables.')

    try {
        cache.promise = MongoClient.connect(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
        })

        cache.client = await cache.promise
        cache.db = cache.client.db(DB_NAME)

        console.log('MongoDB connected to:', DB_NAME)
        return cache.db

    } catch (error) {
        cache.promise = null
        cache.client = null
        cache.db = null

        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('ECONNREFUSED')) {
            throw new Error('MongoDB refused connection. Is your Atlas cluster running and IP whitelisted?')
        }
        if (message.includes('Authentication failed')) {
            throw new Error('MongoDB auth failed. Check username/password in MONGODB_URI.')
        }
        throw new Error(`MongoDB connection failed: ${message}`)
    }
}

// ─── Collections ──────────────────────────────────────────────────────────────

export async function getReportsCollection(): Promise<Collection<ReportDocument>> {
    const db = await connectToDatabase()
    return db.collection<ReportDocument>('reports')
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if the report is less than CACHE_TTL_HOURS old (fresh cache)
 */
export function isReportFresh(report: ReportDocument): boolean {
    if (!report.analyzedAt) return false
    const ageMs = Date.now() - new Date(report.analyzedAt).getTime()
    const agHours = ageMs / (1000 * 60 * 60)
    return agHours < CACHE_TTL_HOURS
}

/**
 * Returns true if the report is older than CACHE_TTL_HOURS (stale cache)
 */
export function isReportStale(report: ReportDocument): boolean {
    return !isReportFresh(report)
}

// ─── Save report ──────────────────────────────────────────────────────────────

export async function saveReport(
    data: Omit<ReportDocument, '_id' | 'analyzedAt'>
): Promise<string> {
    try {
        const collection = await getReportsCollection()

        const result = await collection.insertOne({
            ...data,
            analyzedAt: new Date(),
        })

        console.log('Report saved:', result.insertedId.toString())
        return result.insertedId.toString()

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to save report: ${message}`)
    }
}

// ─── Update report ────────────────────────────────────────────────────────────

export async function updateReport(
    id: string,
    data: Partial<Omit<ReportDocument, '_id'>>
): Promise<void> {
    try {
        const collection = await getReportsCollection()
        await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...data, analyzedAt: new Date() } }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to update report: ${message}`)
    }
}

// ─── Get all reports ──────────────────────────────────────────────────────────

export async function getAllReports(): Promise<ReportDocument[]> {
    try {
        const collection = await getReportsCollection()
        return await collection
            .find({})
            .sort({ analyzedAt: -1 })
            .limit(20)
            .toArray()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to fetch reports: ${message}`)
    }
}

// ─── Get report by company ────────────────────────────────────────────────────

export async function getReportByCompany(company: string): Promise<ReportDocument | null> {
    try {
        const collection = await getReportsCollection()
        return await collection.findOne(
            { company: { $regex: company, $options: 'i' } },
            { sort: { analyzedAt: -1 } }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to fetch report for "${company}": ${message}`)
    }
}

// ─── Log search ───────────────────────────────────────────────────────────────

export async function logSearch(
    query: string,
    resolvedCompany: string,
    reportId: string
): Promise<void> {
    try {
        const db = await connectToDatabase()
        await db.collection('searches').insertOne({
            query,
            resolvedTo: resolvedCompany,
            reportId,
            searchedAt: new Date(),
        })
    } catch (error) {
        console.warn('Could not log search query:', error)
    }
}

// ─── Get report history ───────────────────────────────────────────────────────

export async function getReportHistory(
    company: string,
    limit = 20
): Promise<ReportDocument[]> {
    try {
        const collection = await getReportsCollection()
        return await collection
            .find({ company: { $regex: company, $options: 'i' } })
            .sort({ analyzedAt: -1 })
            .limit(limit)
            .toArray()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to fetch report history for "${company}": ${message}`)
    }
}