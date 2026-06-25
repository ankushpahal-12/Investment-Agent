# StockSage: AI-Powered Institutional-Grade Investment Research Platform

StockSage is an advanced investment research platform that automates company analysis using a multi-agent pipeline orchestrated with LangGraph and LangChain. By combining real-time fundamental data, global market news, and semantic vector retrieval (RAG) over official SEC corporate filings, StockSage provides comprehensive, objective, and institutional-grade investment recommendations.

---

##  Documentation Directory

For deep-dive topics, please refer to the modular developer guides created in the docs folder:

- **[Getting Started Guide](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/getting-started.md)**: Onboarding instructions, environment configurations, dependencies, and vector database setups.
- **[System Architecture](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/architecture.md)**: Technology stack breakdown, folder layouts, system flowcharts, and MongoDB database schemas.
- **[How It Works (Pipeline & Agents)](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/how-it-works.md)**: Detailed examination of the LangGraph state machine, individual agent prompts/models, and the multi-query RAG semantic retrieval engine.
- **[Core & Upgraded Features](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/features.md)**: In-depth reviews of the 7-feature robustness upgrades (RAG auditor, validation agent, SSE streams, SEC crawler, rate-limiter, PDF generator, and trends).
- **[Troubleshooting & Error Resolution](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/troubleshooting.md)**: Developer guide for resolving API rate limits, database timeouts, SEC crawling blocks, and ChromaDB fallbacks.

---

## The Multi-Agent Orchestrator

StockSage models the investment research process as a stateful directed graph. Instead of a single large language model trying to synthesize diverse financial dimensions, the platform delegates tasks to a network of specialized agent nodes powered by llama-3.3-70b-versatile (via Groq) that write to a shared, thread-safe state.

```
                  ┌──────────────────────┐
                  │      __start__       │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │   Validation Agent   │ ---> Resolves stock ticker & verifies company.
                  └──────────┬───────────┘      Fails fast if invalid.
                             │
                     { Is Valid Ticker? }
                     /                \
                   No                 Yes
                   /                    \
                  ▼                      ▼
        ┌──────────────────┐    ┌──────────────────┐
        │     __end__      │    │  Research Agent  │ ---> Fetches corporate history, CEO,
        │ (Early Abortion) │    └────────┬─────────┘      products, and key competitors.
        └──────────────────┘             │
                                         ▼
                                ┌──────────────────┐
                                │ Financial Agent  │ ---> Analyzes valuation, growth ratios, FCF,
                                └────────┬─────────┘      margins, and balance sheet health.
                                         │
                                         ▼
                                ┌──────────────────┐
                                │    News Agent    │ ---> Gathers news articles from last 7 days
                                └────────┬─────────┘      and computes net sentiment score.
                                         │
                                         ▼
                                ┌──────────────────┐
                                │  RAG Router Node │ ---> Performs 5 targeted semantic lookups
                                └────────┬─────────┘      over indexed SEC filings (10-K/10-Q).
                                         │
                                         ▼
                                ┌──────────────────┐
                                │    Risk Agent    │ ---> Plays devil's advocate; outlines bull/bear
                                └────────┬─────────┘      cases, systemic risks, credit warnings.
                                         │
                                         ▼
                                ┌──────────────────┐
                                │  Decision Agent  │ ---> Synthesizes all nodes + RAG context, writes
                                └────────┬─────────┘      thesis, price target, and BUY/HOLD/SELL.
                                         │
                                         ▼
                                ┌──────────────────┐
                                │      __end__     │ ---> Saves to MongoDB and updates history.
                                └──────────────────┘
```

---

## Quick Start (60-Second Setup)

For full setup details, refer to the [Getting Started Guide](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/getting-started.md). Here is the rapid command sequence to get the platform running locally:

### 1. Configure the Environment
Create a `.env` file in the root directory:
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

---

## Quick Start Setup

For full installation guidelines, see the Getting Started Guide. Below is a summary of commands to run the project locally:

### 1. Install Dependencies
Navigate to the project root directory and run the package installer:
```bash
npm install
```

### 2. Configure Environment Variables
Create a .env file using the template provided in the section above and fill in all the required API credentials.

### 3. Launch the Application
Run the Next.js development server:
```bash
npm run dev
```

Open a web browser and go to http://localhost:3000. You can now use the interface to launch company investment analyses and query SEC filings.
