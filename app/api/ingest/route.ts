import { NextRequest, NextResponse } from 'next/server'
import { parsePdfByPages, segmentPageContent } from '../../../lib/rag/pdfParser'
import { addDocumentsToRAG } from '../../../lib/rag/vectorStore'

export const maxDuration = 180 // PDF parsing and embedding can take time

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const company = formData.get('company') as string | null
        const type = formData.get('type') as '10k' | '10q' | 'investor_presentation' | 'other' | null

        if (!file || !company || !type) {
            return NextResponse.json(
                { error: 'Missing required fields: file, company, and document type must be provided.' },
                { status: 400 }
            )
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            async start(controller) {
                function send(event: string, data: unknown) {
                    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                    controller.enqueue(encoder.encode(msg))
                }

                try {
                    // Step 1: Parse PDF
                    send('progress', { step: 'parsing', message: `Parsing "${file.name}"...`, percent: 10 })
                    const pages = await parsePdfByPages(buffer)

                    if (pages.length === 0) {
                        send('error', { error: 'PDF is empty or text could not be extracted.' })
                        controller.close()
                        return
                    }

                    send('progress', {
                        step: 'parsed',
                        message: `Extracted ${pages.length} pages successfully.`,
                        percent: 25,
                        pages: pages.length,
                    })

                    // Step 2: Segment
                    send('progress', { step: 'segmenting', message: 'Segmenting into tables, footnotes, and text blocks...', percent: 35 })
                    const chunks = segmentPageContent(pages, company, type)

                    const tablesCount = chunks.filter(c => c.metadata.chunkType === 'table').length
                    const footnotesCount = chunks.filter(c => c.metadata.chunkType === 'footnote').length
                    const textCount = chunks.filter(c => c.metadata.chunkType === 'text').length

                    send('progress', {
                        step: 'segmented',
                        message: `${chunks.length} segments: ${tablesCount} tables, ${footnotesCount} footnotes, ${textCount} text blocks`,
                        percent: 50,
                        stats: { totalChunks: chunks.length, tables: tablesCount, footnotes: footnotesCount, textBlocks: textCount },
                    })

                    // Step 3: Embed and index
                    send('progress', { step: 'embedding', message: `Generating embeddings for ${chunks.length} chunks...`, percent: 60 })

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

                    send('progress', { step: 'indexed', message: 'Embeddings stored in vector database.', percent: 95 })

                    // Done
                    send('complete', {
                        success: true,
                        message: `Ingested ${chunks.length} segments from "${file.name}" successfully!`,
                        percent: 100,
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
                    console.error('PDF ingestion failed:', err)
                    send('error', { error: `PDF Ingestion failed: ${msg}` })
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

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('PDF ingestion failed:', err)
        return NextResponse.json(
            { error: `PDF Ingestion failed: ${msg}` },
            { status: 500 }
        )
    }
}
