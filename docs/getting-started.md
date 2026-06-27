# Getting Started

This guide walks you through setting up the StockSage investment research agent platform on your local machine.

---

## Prerequisites

Before running the application, ensure you have the following installed:
- Node.js: Version 18.x or later. Next.js 16 requires Node.js 18 or above.
- MongoDB: A running MongoDB instance. This can be a MongoDB Atlas cloud cluster or a local MongoDB database server.
- Python: Version 3.10 or later is recommended if you wish to run a local instance of ChromaDB for development. If not running a local server, the system connects directly to Chroma Cloud, or falls back to an in-memory vector store.

---

## Environment Configuration

Create a file named .env in the root directory of the project. Copy the template below and configure the credentials:

```env
# Groq API Keys for Agent Nodes
# These keys authenticate your connection to the Groq API. You can use the same key for all fields
# or distribute them across different keys to segregate rate limits.
GROQ_API_KEY_RESEARCH=your_groq_api_key_here
GROQ_API_KEY_FINANCIAL=your_groq_api_key_here
GROQ_API_KEY_NEWS=your_groq_api_key_here
GROQ_API_KEY_RISK=your_groq_api_key_here
GROQ_API_KEY_DECISION=your_groq_api_key_here

# External Data APIs
# Tavily API is used by the Research Agent to bypass search engine scrapers and extract clean corporate info.
TAVILY_API_KEY=your_tavily_api_key_here
# Alpha Vantage API key is used as an optional financial data source.
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
# Finnhub API key is required to fetch real-time stock profiles, market quotes, metrics, and financials.
FINHUB_API_KEY=your_finnhub_api_key_here
# NewsAPI key is required to retrieve global news headlines and stories for sentiment scoring.
NEWS_API_KEY=your_news_api_key_here

# Database Configuration
# MongoDB connection URI (e.g. MongoDB Atlas or local MongoDB). Used to persist reports and history.
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/investment_agent?retryWrites=true&w=majority

# Next.js Settings
# NextAuth settings and deployment node environment configuration.
NEXTAUTH_URL=http://localhost:3000
NODE_ENV=development

# Vector Store Configurations
# CHROMA_URL connects to the remote Chroma Cloud API host (default is https://api.trychroma.com).
CHROMA_URL=https://api.trychroma.com
# CHROMA_API_KEY is your secure Chroma Cloud API Token (typically prefixed with ck-).
CHROMA_API_KEY=your_chroma_api_key_here
# CHROMA_TENANT is the tenant UUID assigned to your cloud account to isolate workspaces.
CHROMA_TENANT=your_chroma_tenant_id_here
# CHROMA_DATABASE is the target database name created within your Chroma tenant workspace.
CHROMA_DATABASE=your_chroma_database_name_here

# Gemini Embedding API Key (Required for RAG)
# Used to generate 768-dimensional vector embeddings for indexing and searching SEC documents.
# Get your API key from Google AI Studio.
GEMINI_API_KEY=your_gemini_api_key_here
```

### Detailed Key Descriptions

1. GROQ_API_KEY_RESEARCH, GROQ_API_KEY_DECISION:
   These variables specify the API key used for the LLM agent nodes (Research Agent and Decision Agent) in the LangGraph workflow. The Financial, News, and Risk Agents operate deterministically and are LLM-free to ensure high performance, zero rate-limit collisions, and no hallucinations. If you only have one Groq API key, you can use the same key for both parameters.

2. TAVILY_API_KEY:
   Tavily is a search engine optimized for LLMs. The Research Agent queries Tavily to retrieve up-to-date qualitative context regarding a company's background, competitors, and leadership structure.

3. FINHUB_API_KEY:
   Required by the Validation Agent, Research Agent, and Financial Agent. It connects to the Finnhub Stock API to perform name-to-ticker resolution, pull basic company profiles, fetch current share prices, and retrieve analyst price targets and recommendations.

4. NEWS_API_KEY:
   Used by the News Agent to download articles from global news outlets covering the target asset over the preceding seven days.

5. MONGODB_URI:
   The database connection string. This is used by the Next.js backend to save completed research runs, log company queries, and load historical trend data.

6. CHROMA_URL, CHROMA_API_KEY, CHROMA_TENANT, CHROMA_DATABASE:
   These options configure connection parameters for the remote vector store.
   - CHROMA_URL: The connection endpoint of the vector database server. For Chroma Cloud, set this to https://api.trychroma.com.
   - CHROMA_API_KEY: The secure cloud API token used to authenticate requests to Chroma Cloud.
   - CHROMA_TENANT: The tenant UUID assigned to your cloud account to isolate datasets.
   - CHROMA_DATABASE: The database name where collections are stored.

7. GEMINI_API_KEY:
   Required by the embedding system. It accesses Google Gemini text-embedding-004 to create 768-dimensional vector embeddings of SEC filings, investor slides, and company profiles during document ingestion and search queries.

---

## Installation

1. Navigate to the project root directory:
   ```bash
   cd investment-agent
   ```

2. Install the package dependencies using npm:
   ```bash
   npm install
   ```

---

## Running the Vector Database locally (Optional Python Setup)

If you prefer to run a local ChromaDB instance for testing instead of using Chroma Cloud:

1. Install the Python packages:
   ```bash
   pip install chromadb
   ```

2. Start the local server:
   ```bash
   chroma run --path ./chroma_data
   ```

3. Update the .env file to match:
   ```env
   CHROMA_URL=http://localhost:8000
   CHROMA_API_KEY=
   CHROMA_TENANT=
   CHROMA_DATABASE=
   ```

Note: If the vector server is offline or not configured, the system falls back to in-memory vector storage.

---

## Running the Application

### Development Mode
To start the Next.js development server:
```bash
npm run dev
```
Open a browser and navigate to http://localhost:3000.

### Production Mode
To build and compile the TypeScript code:
```bash
npm run build
```

To run the optimized production application:
```bash
npm run start
```
