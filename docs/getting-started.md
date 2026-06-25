# Getting Started

This guide walks you through setting up the StockSage investment research agent platform on your local machine.

---

## Prerequisites

Before running the application, ensure you have the following installed:
- **Node.js**: Version 18.x or later (Next.js 16 requires Node.js 18+).
- **MongoDB**: A running MongoDB instance (either local or a MongoDB Atlas cloud database).
- **Python** (Optional): Version 3.10+ if you plan to run ChromaDB as a standalone local server. If omitted, the system defaults to in-memory storage for RAG operations.

---

## Environment Configuration

Create a `.env` file in the root directory of the project. You can copy the structure below. Replace placeholders with your own API keys and credentials.

```env
# Groq API Keys for Agent Nodes
# You can use the same key or different keys to segregate rate limits.
GROQ_API_KEY_RESEARCH=your_groq_api_key_here
GROQ_API_KEY_FINANCIAL=your_groq_api_key_here
GROQ_API_KEY_NEWS=your_groq_api_key_here
GROQ_API_KEY_RISK=your_groq_api_key_here
GROQ_API_KEY_DECISION=your_groq_api_key_here

# External Data APIs
TAVILY_API_KEY=your_tavily_api_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
FINHUB_API_KEY=your_finnhub_api_key_here
NEWS_API_KEY=your_news_api_key_here

# Database Configuration
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/investment_agent?retryWrites=true&w=majority

# Next.js Settings
NEXTAUTH_URL=http://localhost:3000
NODE_ENV=development

# Vector Store Configurations
# To run ChromaDB locally, set this to http://localhost:8000
# To connect to Chroma Cloud, set this to https://api.trychroma.com
# The system falls back to in-memory storage if ChromaDB is unreachable.
CHROMA_URL=https://api.trychroma.com
CHROMA_API_KEY=your_chroma_api_key_here
CHROMA_TENANT=your_chroma_tenant_id_here
CHROMA_DATABASE=your_chroma_database_name_here

# Gemini Embedding API Key (Required for semantic chunking and search)
# Retrieve your key from https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_api_key_here
```

### Key Descriptions

| Variable | Required / Optional | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY_*` | Required | API keys for the Groq inference platform, used to run Llama-3.3-70b-versatile models for the multi-agent nodes. |
| `TAVILY_API_KEY` | Required | Tavily search API key, utilized by the Research Agent to query recent web information. |
| `FINHUB_API_KEY` | Required | Finnhub API key, used to fetch company financial profiles, live tickers, and market pricing. |
| `NEWS_API_KEY` | Required | NewsAPI key, used to fetch recent market articles for sentiment analysis. |
| `MONGODB_URI` | Required | Connection string to your MongoDB cluster, used for saving report runs and historical trends. |
| `CHROMA_URL` | Optional | Endpoint for the ChromaDB vector database (e.g. `http://localhost:8000` or `https://api.trychroma.com`). If unreachable, the system utilizes in-memory storage. |
| `CHROMA_API_KEY`| Optional | Your Chroma Cloud authentication token/API key. Required when using Chroma Cloud. |
| `CHROMA_TENANT` | Optional | Tenant ID to use in Chroma Cloud/DB for dataset isolation. |
| `CHROMA_DATABASE`| Optional | Database name to connect to on the Chroma host. |
| `GEMINI_API_KEY` | Required | Google AI Studio API key. Crucial for generating embeddings (`text-embedding-004`) used in the RAG retrieval pipeline. |

---

## Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd investment-agent
   ```

2. Install the Node.js dependencies:
   ```bash
   npm install
   ```

---

## Running the Standalone Vector Database (ChromaDB)

StockSage uses ChromaDB to index SEC filings and company profiles. You can run ChromaDB locally in a Docker container or via Python.

### Option A: Running via Python (Recommended)
1. Install ChromaDB:
   ```bash
   pip install chromadb
   ```
2. Start the ChromaDB server:
   ```bash
   chroma run --path ./chroma_data
   ```
This will start the vector database on `http://localhost:8000`.

### Option B: Running via Docker
```bash
docker run -p 8000:8000 chromadb/chroma
```

*Note: If `CHROMA_URL` is omitted or the server is offline, StockSage will automatically fall back to an in-memory vector storage mechanism.*

---

## Running the Application

### Development Mode
To start the Next.js development server:
```bash
npm run dev
```
The application will be accessible at `http://localhost:3000`.

### Production Build
To compile the TypeScript code and generate the optimized production build:
```bash
npm run build
```

To run the built production application:
```bash
npm run start
```
