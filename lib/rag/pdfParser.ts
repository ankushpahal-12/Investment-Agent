// pdf-parse is required dynamically inside local functions to prevent Next.js build-time pre-render crashes (e.g. ReferenceError: DOMMatrix is not defined).

export interface SegmentedChunk {
    id: string
    content: string
    metadata: {
        company: string
        type: '10k' | '10q' | 'investor_presentation' | 'other'
        chunkType: 'table' | 'footnote' | 'text'
        pageNumber: number
        timestamp: string
    }
}

function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
    const paragraphs = text.split(/\n\s*\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        const trimmedPara = paragraph.trim();
        if (!trimmedPara) continue;

        // If paragraph fits in current chunk, add it
        if ((currentChunk + (currentChunk ? '\n\n' : '') + trimmedPara).length <= chunkSize) {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
        } else {
            // Push current chunk if not empty and restart
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }

            // If a single paragraph exceeds the chunk size, split by sentences
            if (trimmedPara.length > chunkSize) {
                const sentences = trimmedPara.split(/(?<=\. )/g);
                for (const sentence of sentences) {
                    const trimmedSent = sentence.trim();
                    if (!trimmedSent) continue;

                    if ((currentChunk + (currentChunk ? ' ' : '') + trimmedSent).length <= chunkSize) {
                        currentChunk += (currentChunk ? ' ' : '') + trimmedSent;
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk);
                        }
                        currentChunk = trimmedSent;
                    }
                }
            } else {
                currentChunk = trimmedPara;
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks.filter(c => c.trim().length > 40);
}

/**
 * Parses the PDF buffer and returns page-by-page text content
 */
export async function parsePdfByPages(buffer: Buffer): Promise<{ page: number; text: string }[]> {
    const pdf = require('pdf-parse')
    const pages: { page: number; text: string }[] = []

    try {
        await pdf(buffer, {
            pagerender: async function (pageData: any) {
                const textContent = await pageData.getTextContent()
                let lastY = 0
                let text = ''
                for (const item of textContent.items) {
                    if (lastY === item.transform[5] || !lastY) {
                        text += item.str + ' '
                    } else {
                        text += '\n' + item.str + ' '
                    }
                    lastY = item.transform[5]
                }
                pages.push({
                    page: pageData.pageIndex + 1,
                    text: text.trim()
                })
                return text
            }
        })
    } catch (err) {
        console.error('pdf-parse failed, attempting basic string rendering fallback:', err)
        // Fallback: If page-by-page text rendering fails, parse it as a whole string and split by form feed
        const pdf = require('pdf-parse')
        const data = await pdf(buffer)
        const rawPages = data.text.split(/\f/)
        return rawPages.map((txt: string, idx: number) => ({
            page: idx + 1,
            text: txt.trim()
        }))
    }

    // Sort by page number since page render callbacks can execute out of order
    pages.sort((a, b) => a.page - b.page)
    return pages
}

/**
 * Segments page text into tables, footnotes, and standard paragraphs
 */
export function segmentPageContent(
    pages: { page: number; text: string }[],
    company: string,
    docType: '10k' | '10q' | 'investor_presentation' | 'other'
): SegmentedChunk[] {
    const chunks: SegmentedChunk[] = []

    for (const { page, text } of pages) {
        // Split page text by double newlines or large whitespace to isolate paragraphs
        const paragraphs = text.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 20)

        paragraphs.forEach((p, idx) => {
            // ─── 1. Identify Footnotes / Legal Disclosures ───
            // Matches indicators like "Note 1:", "Footnote 3", "†", "*", or paragraph content containing specific legal keywords
            const hasFootnoteKeywords = /debt covenant|pending lawsuit|litigation|lawsuit|legal proceedings|covenants|borrowing capacity|contingencies|claims|restrictions|indemnification/i.test(p)
            const hasFootnoteStart = /^(Note\s+\d+|Footnote|[\*†‡§\d]|\(\d+\))\b/i.test(p)
            const isFootnote = (hasFootnoteStart && p.length < 600) || (hasFootnoteKeywords && p.length < 1200)

            // ─── 2. Identify Financial Tables ───
            // A financial table typically has multiple lines containing tabular rows.
            // A tabular row has multiple text/number columns separated by multiple spaces.
            const lines = p.split('\n').map(l => l.trim()).filter(l => l.length > 0)
            let tabularLineCount = 0

            lines.forEach(line => {
                const parts = line.split(/\s{2,}/).filter(part => part.trim().length > 0)
                if (parts.length >= 2) {
                    // Check if at least one column is a number or percentage or currency
                    const hasNumericValues = parts.some(part => /[\d$,%()\-—]/.test(part))
                    if (hasNumericValues) {
                        tabularLineCount++
                    }
                }
            })

            // If at least 30% of the paragraph lines are tabular/numeric columns, classify it as a table
            const isTable = lines.length >= 2 && (tabularLineCount / lines.length) >= 0.3

            let chunkType: 'table' | 'footnote' | 'text' = 'text'
            if (isTable) {
                chunkType = 'table'
            } else if (isFootnote) {
                chunkType = 'footnote'
            }

            const timestamp = new Date().toISOString()

            if (chunkType === 'table') {
                chunks.push({
                    id: `${company.toLowerCase()}_${docType}_p${page}_table_${idx}`,
                    content: `[TABLE] Company: ${company} | Page ${page}\n${p}`,
                    metadata: { company, type: docType, chunkType: 'table', pageNumber: page, timestamp }
                })
            } else if (chunkType === 'footnote') {
                chunks.push({
                    id: `${company.toLowerCase()}_${docType}_p${page}_footnote_${idx}`,
                    content: `[FOOTNOTE] Company: ${company} | Page ${page}\n${p}`,
                    metadata: { company, type: docType, chunkType: 'footnote', pageNumber: page, timestamp }
                })
            } else {
                // For standard text, chunk normally
                const textChunks = chunkText(p, 800, 150)
                textChunks.forEach((tc, tcIdx) => {
                    chunks.push({
                        id: `${company.toLowerCase()}_${docType}_p${page}_text_${idx}_c${tcIdx}`,
                        content: `[TEXT] Company: ${company} | Page ${page}\n${tc}`,
                        metadata: { company, type: docType, chunkType: 'text', pageNumber: page, timestamp }
                    })
                })
            }
        })
    }

    return chunks
}
