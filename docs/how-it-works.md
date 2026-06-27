# How It Works (Pipeline & Agents)

This document explains the inner workings of the StockSage multi-agent pipeline, the state management orchestrator, individual agent responsibilities, and the Retrieval-Augmented Generation (RAG) mechanism.

---

## The Orchestration Pipeline (LangGraph)

StockSage uses LangGraph to model the research process as a stateful, directed acyclic graph. This approach treats agents as graph nodes that read from and write to a centralized thread-safe state object.

### Execution Flow

The graph executes sequentially through the following nodes:

1. Entry: The pipeline starts execution at the __start__ node.
2. Validation Node: The input query (company name) is passed to the validation agent.
3. Decision Fork (Conditional Edge):
   - If the validation agent determines the company is not found or is invalid, it writes an error message to the state and redirects the execution directly to the __end__ node, aborting the rest of the research pipeline.
   - If validation is successful and resolves the name to a stock ticker, the graph continues to the Research Agent.
4. Research Agent: Runs web searches and gathers basic company profiles, then continues to the Financial Agent.
5. Financial Agent: Gathers and computes financial ratios, margins, and operating numbers, then continues to the News Agent.
6. News Agent: Extracts global news articles and calculates sentiment indicators, then continues to the RAG Node.
7. RAG Node: Performs semantic vector searches against company profiles and ingested SEC filings, then continues to the Risk Agent.
8. Risk Agent: Identifies potential bear risks and forms bull/bear scenarios, then continues to the Decision Agent.
9. Decision Agent: Analyzes all accumulated information, issues the final BUY/PASS recommendation, and completes the execution at the __end__ node.

### State Management (GraphState)

The centralized state acts as the shared memory across the entire run. It accumulates data as each node completes:

- company: string. Name of the company to analyze.
- ticker: string. Resolved market ticker.
- researchData: ResearchData object. Core company background info.
- financialData: FinancialData object. Ratios, metrics, and financials.
- newsData: NewsData object. Live articles and sentiment analysis.
- riskData: RiskData object. Structural, sector, and credit risks.
- verdict: Verdict object. Final decision recommendation.
- ragContext: string. Raw context loaded from Vector DB.
- ragQuality: RAGQualityStats object. Quality metrics of RAG retrieval.
- error: string. Pipeline error message if aborted.

---

## Agent Node Roles and Responsibilities

Each node in the graph is a specialized assistant utilizing a tailored system prompt and external data sources.

### 1. Validation Agent (validationAgent.ts)
- Objective: Rejects invalid, non-alphabetic, or untrackable input names before wasting API tokens.
- Data Sources: Finnhub symbolSearch and getCompanyProfile API.
- Workflow:
  - Validates query structure.
  - Matches company name to an active trading symbol.
  - Returns resolved ticker and normalized company name to state.
  - If no asset profile or ticker is found, sets state.error to halt the pipeline.

### 2. Research Agent (researchAgent.ts)
- Objective: Extracts high-level qualitative company context.
- Data Sources: Finnhub Company Profile, Wikipedia API, Tavily Web Search.
- Model: llama-3.3-70b-versatile (Groq) with **Zod Structured Schema**
- Output: Strict type-safe JSON object detailing CEO, founding year, headquarters, product lines, competitors, and key structural strengths.
- Side Effect: Indexes the compiled company profile into the RAG vector database.

### 3. Financial Agent (financialAgent.ts)
- Objective: Audits the asset's numerical performance and corporate health.
- Data Sources: Finnhub Financials (recommendation trends, basic financials, price targets).
- Model: None (Pure deterministic calculation and rule-based parsing for speed and zero hallucination risk).
- Output: Analyzes operating margins, revenue growth, debt-to-equity ratios, free cash flow trends, and valuation metrics (P/E, EV/EBITDA).

### 4. News Agent (newsAgent.ts)
- Objective: Gathers current market sentiment and news coverage.
- Data Sources: NewsAPI + Finnhub News (retrieves articles from the last 7 days).
- Model: **Local NLP Text Analysis Engine** (Uses `Sentiment` library with custom financial dictionaries containing positive/negative market indicators like "beat", "rally", "lawsuit", "downgrade", etc.).
- Output: Computes overall news sentiment score (-100 to +100), extracts positive/negative signals, and details media attention.

### 5. RAG Node (ragNode in graph.ts)
- Objective: Performs semantic vector searches over indexed filings to inject institutional-grade context.
- Data Sources: ChromaDB or local MongoDB chunk replica.
- Workflow:
  - Issues multiple targeted semantic searches (e.g. debt covenants, pending lawsuits, regulatory risks).
  - Retrieves candidate chunks and processes them via **Reciprocal Rank Fusion (RRF)** to combine vector search and keyword match ranking.
  - Computes RAG Quality metrics and updates the state with the contextual text block.

### 6. Risk Agent (riskAgent.ts)
- Objective: Plays devil's advocate to identify operational bottlenecks and bearish forces.
- Data Sources: Financial data, news summaries, and retrieved RAG context.
- Model: None (Pure rule-based scoring derived from leverage, profit margins, sector vectors, and news sentiment).
- Output: Formulates bull-case and bear-case scenarios, rates systemic credit/market risks, and highlights key competitive threats.

### 7. Decision Agent (decisionAgent.ts)
- Objective: Consolidates all collected evidence and drafts the final investment report.
- Data Sources: Accumulated state (Research + Financial + News + RAG + Risk).
- Model: llama-3.3-70b-versatile (Groq) with **Zod Structured Output Schema**
- Output: Renders the final recommendation (INVEST or PASS) and rating (BUY, HOLD, SELL) in a strict JSON format verified at the API level, ensuring no parse errors or formatting halts.

---

## RAG Retrieval Mechanism

The RAG node bridges the gap between general web knowledge and institutional corporate filings.

The process functions through these chronological steps:

1. Document Ingestion: Raw SEC 10-K or 10-Q filing documents are downloaded in HTML or PDF format.
2. Ingestion Progress: Real-time progress is streamed back to the client using SSE.
3. Content Chunking: Paragraphs are parsed and partitioned using a **Recursive Character Splitter** that splits on paragraph boundaries (`\n\n`) and sentence endpoints (`. `) to ensure numbers and financial disclosures remain intact.
4. Content Embedding: The document pages are cleaned, partitioned, and processed using the Google Gemini text-embedding-004 model.
5. Vector Storage: The generated 768-dimensional embeddings are indexed in ChromaDB (and duplicated to MongoDB as a backup).
6. Multi-Query Retrieval: When a search is triggered, the RAG Node generates five search queries targeting distinct topics.
7. Hybrid Blending (RRF): Results from the semantic vector query and local keyword token matching are blended using **Reciprocal Rank Fusion (RRF)** to optimize both conceptual accuracy and exact keyword precision.
8. Context Generation: The blended vector results are merged, deduplicated, and combined into a formatted markdown text block, which is then passed to the Decision Agent to inform its analysis.

### Multi-Query Retrieval Strategy

Instead of executing a single search query, the RAG node spawns a series of highly targeted semantic lookups concerning the asset:
1. General performance: "[company] financial performance and sector risks"
2. Regulatory & litigation risks: "[company] legal proceedings, lawsuits, and regulatory actions"
3. Credit & debt terms: "[company] debt covenants, credit facilities, and liquidity terms"
4. Segment performance: "[company] revenue segments, geographic performance, and product lines"
5. R&D and Capital Expenditures: "[company] research development, capital expenditures, and strategic investments"

### Processing and Indexing
- Parsing: Documents (PDF or SEC EDGAR HTML) are segmented into clean text pages.
- Semantic Chunking: Pages are chunked recursively, separating narrative sections, tabular data, and financial footnotes.
- Vectorization: Gemini's text-embedding-004 model generates a 768-dimensional vector representation for each chunk.
- Retrieval & Merging: The RAG node queries the vector database using cosine similarity, blends with keyword scores, and formats the output into clean, structured markdown blocks complete with source attributions.
