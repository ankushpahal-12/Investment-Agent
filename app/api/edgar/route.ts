import { NextRequest, NextResponse } from 'next/server'
import { searchFilings, downloadFiling, parseHtmlFilingToPages } from '../../../lib/tools/edgar'
import { parsePdfByPages, segmentPageContent } from '../../../lib/rag/pdfParser'
import { addDocumentsToRAG } from '../../../lib/rag/vectorStore'

export const maxDuration = 180

// GET — Search for available filings
export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('ticker')
    const formType = (req.nextUrl.searchParams.get('type') ?? '10-K') as '10-K' | '10-Q'

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker parameter required' }, { status: 400 })
    }

    try {
        const filings = await searchFilings(ticker, formType, 5)
        return NextResponse.json({ filings })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: `EDGAR search failed: ${msg}` }, { status: 500 })
    }
}

// POST — Fetch a specific filing, parse it, and ingest into RAG
export async function POST(req: NextRequest) {
    const body = await req.json()
    const { ticker, filingUrl, company, formType } = body

    if (!ticker || !company) {
        return NextResponse.json(
            { error: 'ticker and company are required' },
            { status: 400 }
        )
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            function send(event: string, data: unknown) {
                const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(msg))
            }

            try {
                // Step 1: If no filingUrl, find the latest filing
                let url = filingUrl
                if (!url) {
                    send('progress', { step: 'searching', message: `Searching SEC EDGAR for ${ticker} ${formType || '10-K'}...` })
                    const filings = await searchFilings(ticker, formType || '10-K', 1)
                    if (filings.length === 0) {
                        send('error', { error: `No ${formType || '10-K'} filings found for ${ticker} on SEC EDGAR.` })
                        controller.close()
                        return
                    }
                    url = filings[0].filingUrl
                    send('progress', {
                        step: 'found',
                        message: `Found: ${filings[0].primaryDocDescription} (${filings[0].filingDate})`,
                        filing: filings[0],
                    })
                }

                // Step 2: Download the filing
                send('progress', { step: 'downloading', message: 'Downloading filing from SEC EDGAR...' })
                const buffer = await downloadFiling(url)
                if (!buffer) {
                    send('error', { error: 'Failed to download filing from SEC EDGAR.' })
                    controller.close()
                    return
                }

                // Step 3: Parse the document
                send('progress', { step: 'parsing', message: 'Parsing filing content...' })
                const isPdf = url.toLowerCase().endsWith('.pdf')
                let pages: { page: number; text: string }[]

                if (isPdf) {
                    pages = await parsePdfByPages(buffer)
                } else {
                    // Most EDGAR filings are HTML
                    pages = parseHtmlFilingToPages(buffer)
                }

                if (pages.length === 0) {
                    send('error', { error: 'Could not extract text content from the filing.' })
                    controller.close()
                    return
                }

                send('progress', { step: 'parsed', message: `Extracted ${pages.length} pages of content.` })

                // Step 4: Segment into tables, footnotes, text
                send('progress', { step: 'segmenting', message: 'Segmenting into tables, footnotes, and text blocks...' })
                const docType = (formType === '10-Q' ? '10q' : '10k') as '10k' | '10q'
                const chunks = segmentPageContent(pages, company, docType)

                const tablesCount = chunks.filter(c => c.metadata.chunkType === 'table').length
                const footnotesCount = chunks.filter(c => c.metadata.chunkType === 'footnote').length
                const textCount = chunks.filter(c => c.metadata.chunkType === 'text').length

                send('progress', {
                    step: 'segmented',
                    message: `${chunks.length} segments: ${tablesCount} tables, ${footnotesCount} footnotes, ${textCount} text blocks`,
                })

                // Step 5: Embed and store
                send('progress', { step: 'embedding', message: 'Generating embeddings and indexing...' })
                const ragDocs = chunks.map(chunk => ({
                    id: chunk.id,
                    content: chunk.content,
                    metadata: {
                        company: chunk.metadata.company,
                        type: chunk.metadata.type,
                        timestamp: chunk.metadata.timestamp,
                        chunkType: chunk.metadata.chunkType,
                        pageNumber: chunk.metadata.pageNumber,
                    }
                }))
                await addDocumentsToRAG(ragDocs)

                // Done
                send('complete', {
                    success: true,
                    message: `Successfully ingested ${chunks.length} segments from SEC EDGAR filing.`,
                    stats: {
                        totalChunks: chunks.length,
                        tables: tablesCount,
                        footnotes: footnotesCount,
                        textBlocks: textCount,
                        pages: pages.length,
                    },
                })
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                send('error', { error: `EDGAR ingestion failed: ${msg}` })
            } finally {
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}
