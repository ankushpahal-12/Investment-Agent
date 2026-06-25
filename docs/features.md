# Core & Upgraded Features

This document provides a detailed breakdown of the core functionalities and the 7-feature robustness upgrade suite implemented in StockSage.

---

## 1. RAG Quality Indicator

To make the Decision Agent's reasoning institutional-grade, StockSage includes a RAG Quality Auditor that tracks exactly what context was retrieved from the vector database.

### How It Works
- When a search is performed, the system counts the total retrieved chunks and categorizes them into Tables, Footnotes, and General Text.
- It computes an approximate relevance score and identifies the active vector storage engine (ChromaDB or local memory).
- The metrics are passed through the graph state and rendered on the results page as a visual badge:
  - High Quality (Green indicator): 8 or more chunks retrieved, ensuring deep filing coverage.
  - Partial Quality (Amber indicator): 3 to 7 chunks retrieved, indicating moderate context.
  - Limited Quality (Gray indicator): less than 3 chunks, warning the user that analysis relied primarily on web data.

---

## 2. Input Validation Agent

To prevent invalid queries from wasting API tokens and execution time, the pipeline starts with a dedicated, rule-based pre-flight validation agent.

### How It Works
- Rejects empty, excessively long, or non-alphabetic inputs.
- Queries Finnhub's symbolSearch to resolve the company name to a valid stock ticker.
- Resolves and fetches the company profile to verify it represents an actively traded entity.
- Early-Abortion Design: If validation fails, the agent writes the error to the graph state and triggers a conditional edge that bypasses all subsequent nodes, immediately returning a PASS recommendation with the validation error.

---

## 3. Streaming RAG Ingestion Progress

Processing large PDF or HTML financial filings (often 150+ pages) can take several minutes. StockSage replaces generic loading indicators with real-time streaming progress bars.

### How It Works
- The /api/ingest and /api/edgar ingestion routes are built as Server-Sent Event (SSE) streams using ReadableStream.
- The backend emits real-time events as it completes each phase of the document pipeline:
  1. parsing: Reading HTML/PDF pages and extracting text.
  2. segmenting: Cleaning and dividing text into manageable semantic sections.
  3. embedding: Generating dense vectors in batches, reporting progress percentage (e.g. "Embedding page 40 of 120 (33%)").
  4. indexing: Saving vectors into the database.
  5. complete: Handing control back to the UI.
- The React frontend consumes these events to display an accurate, animated progress bar.

---

## 4. Automated SEC Filing Fetch (EDGAR)

Rather than requiring users to manually locate, download, and upload PDF filings, StockSage connects directly to the SEC EDGAR system for one-click ingestion.

### How It Works
- CIK Resolution: Translates the stock ticker into a standard SEC Central Index Key (CIK) using SEC's ticker-to-CIK registry.
- Filing Search: Searches the SEC's index for the company's latest 10-K (Annual) or 10-Q (Quarterly) filings.
- Compliant Crawling: Downloads filing documents using a compliant, identified user-agent header:
  "User-Agent: InvestmentResearchAgent/1.0 (ankushpahal12@gmail.com)"
- HTML-to-Page Parsing: Parses the raw SEC HTML filing, cleaning out structural tags, and splitting the text into logical pages before embedding.

---

## 5. Rate Limit Handling (Resilience)

To withstand API rate limits (e.g. Finnhub free tier limits of 60 calls/minute, Groq TPM/RPM limits, or Gemini limits), the application integrates a resilient rate-limiting layer.

### How It Works
- Wraps all network requests and SDK integrations inside a robust retry utility:
  - fetchWithRetry() for HTTP client requests (NewsAPI, Tavily, Gemini).
  - callWithRetry() for third-party SDK calls (Finnhub).
- Exponential Backoff with Jitter: If an API returns a "429 Too Many Requests" or "5xx Server Error", the system waits and retries. The delay increases exponentially (e.g. 200ms, then 400ms, then 800ms) with a randomized "jitter" offset to prevent synchronized retry storms.
- Header Auditing: Respects the standard HTTP Retry-After header when supplied by the upstream server.

---

## 6. Export to PDF Report

StockSage generates professional, clean HTML investment research memos, formatted like institutional equity research reports, which can be printed or saved as PDFs.

### How It Works
- The /api/export endpoint fetches the completed report from MongoDB.
- It dynamically compiles the data into a structured HTML document styled with a professional corporate stylesheet (including a dark header, colored verdict badges, clear grid alignments, and a standard disclosure footer).
- When a user clicks Export PDF on the results page, the report opens in a new browser tab pre-configured for clean CSS page breaks, prompting the user to save it via the browser's native print-to-PDF engine.

---

## 7. Historical Trend Tracking

StockSage tracks how an asset's financial outlook, market sentiment, and analyst recommendations shift over time by comparing successive analysis runs.

### How It Works
- Every analysis run is persisted in MongoDB as a historical snapshot.
- The /api/trends endpoint aggregates previous runs for a specific company, sorting them chronologically.
- The results page includes a dedicated Trend tab that displays:
  - A visual timeline representing recommendation shifts (e.g. INVEST, then PASS).
  - An interactive confidence bar chart that colors positive verdicts green and pass verdicts red.
  - Snapshot cards comparing key metrics (such as Target Price, Sentiment, and Risk Score) across runs.
