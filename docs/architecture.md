# Architecture

This document describes the high-level system architecture, technology stack, directory structure, database models, and external integrations of the StockSage investment research agent platform.

---

## Technology Stack

The application is built using a modern JavaScript/TypeScript stack:
- Frontend and Routing: Next.js 16 (App Router) with React 19 and Tailwind CSS v4.
- Agent Orchestration: LangGraph and LangChain.
- Database: MongoDB (via official native mongodb driver) for operational persistence and historical data.
- Vector Database: ChromaDB (with local/in-memory fallback) for retrieving contextual information from SEC filings and company reports.
- Embeddings: Google Gemini API (text-embedding-004) for generating high-dimensional dense vector embeddings.
- Inference: Groq Inference API running llama-3.3-70b-versatile for agent reasoning.
- PDF Generation: jsPDF for creating styled investment research memos.

---

## System Design and Data Flow

StockSage operates on a decoupled architecture where the Next.js API layer orchestrates requests, schedules tasks in a multi-agent LangGraph workflow, and streams live state updates to the React client using Server-Sent Events (SSE).

### Execution Lifecycle and Layer Interactions

1. Client Layer:
   The React client interface displays the inputs, loading states, and analysis reports. When a user submits a company name for analysis, the page starts a Server-Sent Events (SSE) listener connecting to the /api/analyze route handler.

2. API Router Layer:
   The API route handler initializes the input, constructs the initial state schema, and runs the compiled LangGraph workflow. As the graph executes, the route handler intercepts progress callbacks from the active nodes and streams them back to the client interface in real-time.

3. Multi-Agent Pipeline Layer:
   The orchestration layer compiles nodes and conditional edges. The request passes through the Validation Agent, Research Agent, Financial Agent, Valuation Agent, News Agent, RAG Context Node, Risk Agent, Decision Agent, and the Self-RAG Audit Agent in sequence (with conditional loops back to Decision Agent if the compliance audit fails).

4. External Integrations Layer:
   Agents connect to global APIs to gather raw input. The Validation, Research, and Financial agents query Finnhub. The Research Agent queries Wikipedia and Tavily. The News Agent retrieves articles via NewsAPI.

5. Document Ingestion and Vector Store Layer:
   Users can ingest SEC filings or PDFs. The API downloader queries the SEC EDGAR portal, downloads HTML filings, parses and cleans the content, embeds it in 768-dimensional vectors using Google Gemini API, and saves it in Chroma Cloud. The RAG Context Node queries these collections via semantic search.

6. Persistence and Export Layer:
   When the Decision Agent completes its run, the finalized verdict, risk data, and summaries are saved to MongoDB. The export route compiles the saved MongoDB document into a professional HTML report and utilizes the browser to save it as a PDF.

---

## Directory Structure

- app/: Next.js App Router Pages and API Routes
  - api/: API Routes (SSE endpoints, imports, exports)
    - analyze/: SSE endpoint for running LangGraph analysis
    - edgar/: SEC EDGAR filing search and ingest API
    - export/: HTML and PDF report generator
    - ingest/: Vector RAG PDF document ingestion
    - trends/: Historical recommendation snapshots
  - results/: Visual analysis dashboard
  - layout.tsx: Application shell layout
  - page.tsx: Analysis launchpad page
- components/: Shared UI Components
  - RAGIngestionCard.tsx: PDF upload and SEC EDGAR ingestion UI
  - TrendTracker.tsx: Historical recommendation visualizer
- docs/: Platform Documentation
- lib/: Core Domain Logic and Agents
  - agents/: LangGraph Agent nodes
    - auditAgent.ts: Audits final report drafts to check factual consistency (Self-RAG)
    - decisionAgent.ts: Consolidates all data into a final recommendation (with SSE token streaming)
    - financialAgent.ts: Extracts and analyzes balance sheets, operating margins
    - newsAgent.ts: Analyzes news sentiment using a local NLP engine
    - researchAgent.ts: Extracts core company profile, products, competitors
    - riskAgent.ts: Outlines micro/macro risks, barriers, bull/bear cases
    - validationAgent.ts: Pre-flight input validation and ticker resolution
    - valuationAgent.ts: Projects financial estimates to build a deterministic DCF model
  - rag/: Retrieval-Augmented Generation infrastructure
    - pdfParser.ts: Parses and segments document content into tables, footnotes, and text paragraphs
    - vectorStore.ts: ChromaDB client, local MongoDB backup, and local in-memory vector fallback
  - tools/: SDKs and wrappers for external APIs
    - edgar.ts: SEC EDGAR fetcher and parser
    - finnhub.ts: Finnhub API client
    - newsData.ts: NewsAPI client
    - tavilySearch.ts: Tavily search wrapper
  - utils/: Shared utilities
    - rateLimiter.ts: Exponential backoff retry handler
  - graph.ts: LangGraph network compiling and runner
- types/: TypeScript definitions and system interfaces
- package.json: Dependencies and npm scripts
- tsconfig.json: TypeScript configuration

---

## Data Schema and Operational Storage

Operational database operations are managed in lib/mongodb.ts. The primary model is the ReportDocument which encapsulates the complete output of a LangGraph execution, supporting historical analysis and caching.

### ReportDocument Schema Fields

- _id: ObjectId. Auto-generated unique database identifier.
- company: string. Normalized full name of the analyzed corporation.
- ticker: string. Resolved company equity exchange ticker (e.g. MSFT).
- analyzedAt: Date. Timestamp recording when the analysis run occurred.
- verdict: Verdict object. Output recommendation details (INVEST/PASS, confidence, reasoning, target price).
- confidence: number. Confidence rating percentage (0 to 100) assigned by the Decision Agent.
- researchData: Object. Extracted corporate profile (founded, headquarters, CEO, products, competitors).
- financialData: Object. Extracted key ratios, margins, balance sheet items, and growth percentages.
- newsData: Object. Articles retrieved, sentiment scores, and major narratives.
- riskData: Object. Identified business risks, sector barriers, and bull/bear scenarios.
- ragContext: string. Combined RAG text block retrieved from SEC filings and company profiles.
- ragQuality: Object. Quality metadata describing the retrieval effectiveness.
- error: string. Error messages if the execution failed.

### RAG Quality Schema Fields

The ragQuality sub-document tracks retrieval effectiveness using these numerical metrics:
- totalChunks: number. Sum of all chunks retrieved from the vector database.
- tables: number. Count of financial tables parsed and retrieved from vector data.
- footnotes: number. Count of reporting footnotes parsed and retrieved from vector data.
- textBlocks: number. Count of general textual blocks retrieved.
- avgRelevanceScore: number. Combined similarity/relevance score from the vector search.
- queriesIssued: number. Total search queries executed during retrieval.
- sourcesUsed: string. Storage source (chromadb, mongodb, or in-memory).

---

## External Integrations

StockSage connects to multiple external data feeds:

1. Groq (Inference): Uses Llama-3.3-70b-versatile for rapid reasoning and schema-conforming JSON extractions.
2. Finnhub (Fundamentals and Ticker Resolution): Used to resolve company names to tickers, extract basic financial summaries, and fetch basic company details.
3. NewsAPI (Market Sentiment): Provides global news articles spanning the past 7 days concerning the target asset.
4. Tavily (Active Research): Used by the Research Agent to bypass static search limits, performing multi-query web lookups on current events.
5. SEC EDGAR (Institutional RAG): Direct HTTP connections to SEC servers using SEC-compliant headers to crawl HTML financial filings (10-K and 10-Q).
6. Google Gemini (Embeddings): High-dimension vectorization of raw documents for semantic indexation.
