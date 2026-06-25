# Troubleshooting & Error Resolution

This guide addresses common runtime issues, database connectivity problems, API rate limits, and fallback behaviors you may encounter when running StockSage.

---

## 1. MongoDB Connection Failures

### Symptom
- Console logs display: "MongoDB connection failed: ..." or "Authentication failed" or "ECONNREFUSED".
- The application crashes or hangs on start.

### Diagnostic Steps & Solutions
1. IP Whitelisting (MongoDB Atlas):
   - If you are using MongoDB Atlas, the most common cause is that your current IP address is not whitelisted.
   - Go to your MongoDB Atlas Dashboard, navigate to Network Access, and then IP Access List.
   - Click Add IP Address and add your current IP address (or select Allow Access From Anywhere for testing).
2. Incorrect Credentials:
   - Verify the username and password in the MONGODB_URI environment variable.
   - Ensure special characters in your password (like @, /, :) are URL-encoded.
3. Cluster Status:
   - Check if your Atlas database cluster is active or currently paused.

---

## 2. API Rate Limiting (HTTP 429)

### Symptom
- High latency in agent steps or errors in logs referencing "429 Too Many Requests".
- The News Agent, Research Agent, or Financial Agent slows down.

### Diagnostic Steps & Solutions
- Finnhub Free Tier: Finnhub restricts free accounts to 60 requests per minute. If you analyze several companies rapidly, you will trigger this limit.
- Groq Token Limits: Free Groq accounts have strict Token-Per-Minute (TPM) and Request-Per-Minute (RPM) limitations.
- StockSage Resilience:
  - You do not need to restart the application. StockSage features a built-in exponential backoff retry system in lib/utils/rateLimiter.ts.
  - The system will pause, print a retry warning in the console, and automatically attempt the call again.
  - If rate limits are consistently hit, consider separating your Groq keys across different accounts and setting GROQ_API_KEY_RESEARCH, GROQ_API_KEY_FINANCIAL, etc. to different keys in .env.

---

## 3. SEC EDGAR Ingestion Failures or Throttling

### Symptom
- SEC EDGAR searches return empty results or timeout.
- Ingestion fails with a "403 Forbidden" error when trying to fetch filings.

### Diagnostic Steps & Solutions
- User-Agent Restriction: The SEC strictly blocks anonymous scrapers or generic user-agents (like axios or curl).
- StockSage Compliance:
  - StockSage includes a compliant User-Agent in lib/tools/edgar.ts:
    "User-Agent: InvestmentResearchAgent/1.0 (ankushpahal12@gmail.com)"
  - If your requests are still blocked, open lib/tools/edgar.ts and modify the HEADERS object to specify your own name and contact email:
    ```typescript
    const HEADERS = {
      'User-Agent': 'YourAppName/1.0 (your-email@domain.com)',
      'Accept-Encoding': 'gzip, deflate',
    }
    ```

---

## 4. ChromaDB Server or Cloud Offline / Unauthorized

### Symptom
- Console prints: "ChromaDB unavailable — using MongoDB RAG fallback. Details: Error: ..."
- Connection to Chroma Cloud returns "401 Unauthorized" or "404 Not Found".

### Diagnostic Steps & Solutions
- Operational Fallback: StockSage is designed to run even if ChromaDB is not installed or offline. It will transparently fall back to MongoDB or in-memory vector storage.
- Local Database Setup:
  - To utilize local persistent vector storage, verify ChromaDB is running locally:
    ```bash
    pip install chromadb
    chroma run --path ./chroma_data
    ```
  - Confirm CHROMA_URL in your .env points to http://localhost:8000.
- Cloud Database (Chroma Cloud) Setup:
  - Verify your .env contains:
    - CHROMA_URL=https://api.trychroma.com (or your regional endpoint, e.g. https://us-east-1.gcp.trychroma.com).
    - CHROMA_API_KEY: Ensure it starts with "ck-" and has no trailing whitespaces or hidden characters.
    - CHROMA_TENANT: Verify this matches your exact tenant UUID.
    - CHROMA_DATABASE: Verify the target database exists in your Chroma Cloud console under that tenant.
  - If you receive authentication errors, test the API Key directly using curl or Postman to ensure it is still active and valid.

---

## 5. Missing or Expired API Keys

### Symptom
- The research agent fails to extract CEO/competitor details.
- News columns return empty tables.
- RAG searches yield no chunks.

### Diagnostic Steps & Solutions
- Groq API Key: If no Groq key is found, the platform falls back to a rule-based profile builder (buildResearchData in researchAgent.ts) using basic Wikipedia and Finnhub data, bypassing LLM-powered extraction to keep the app functional.
- Tavily / NewsAPI Key: If Tavily or NewsAPI keys are missing, the corresponding search queries will return empty arrays rather than crashing the pipeline.
- Gemini Key: The Gemini API key is required for RAG. If GEMINI_API_KEY is missing, semantic embedding generation will fail, disabling the PDF ingestion and SEC auto-fetch pipelines. Ensure you get an API key from Google AI Studio.
