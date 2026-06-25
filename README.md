# StockSage: AI-Powered Institutional-Grade Investment Research Platform

StockSage is a state-of-the-art investment research platform that automates company analysis using a multi-agent pipeline orchestrated with **LangGraph** and **LangChain**. By combining real-time fundamental data, global market news, and semantic vector retrieval (RAG) over official SEC corporate filings, StockSage provides comprehensive, objective, and institutional-grade investment recommendations.

---

##  Documentation Directory

For deep-dive topics, please refer to the modular developer guides created in the [docs](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs) folder:

- **[Getting Started Guide](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/getting-started.md)**: Onboarding instructions, environment configurations, dependencies, and vector database setups.
- **[System Architecture](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/architecture.md)**: Technology stack breakdown, folder layouts, system flowcharts, and MongoDB database schemas.
- **[How It Works (Pipeline & Agents)](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/how-it-works.md)**: Detailed examination of the LangGraph state machine, individual agent prompts/models, and the multi-query RAG semantic retrieval engine.
- **[Core & Upgraded Features](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/features.md)**: In-depth reviews of the 7-feature robustness upgrades (RAG auditor, validation agent, SSE streams, SEC crawler, rate-limiter, PDF generator, and trends).
- **[Troubleshooting & Error Resolution](file:///c:/Users/ankus/Desktop/Assigment%20Task/investment-agent/docs/troubleshooting.md)**: Developer guide for resolving API rate limits, database timeouts, SEC crawling blocks, and ChromaDB fallbacks.

---

## The Multi-Agent Orchestrator

StockSage models the investment research process as a stateful directed graph. Instead of a single LLM trying to synthesize diverse financial dimensions, the platform delegates tasks to a network of specialized agent nodes powered by `llama-3.3-70b-versatile` (via Groq) that write to a shared, thread-safe state.

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
GROQ_API_KEY_RESEARCH=your_groq_api_key
GROQ_API_KEY_FINANCIAL=your_groq_api_key
GROQ_API_KEY_NEWS=your_groq_api_key
GROQ_API_KEY_RISK=your_groq_api_key
GROQ_API_KEY_DECISION=your_groq_api_key

TAVILY_API_KEY=your_tavily_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
FINHUB_API_KEY=your_finnhub_key
NEWS_API_KEY=your_news_key
GEMINI_API_KEY=your_gemini_key

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/investment_agent
NEXTAUTH_URL=http://localhost:3000
NODE_ENV=development
CHROMA_URL=http://localhost:8000
```

### 2. Start ChromaDB (Optional Vector Storage)
```bash
pip install chromadb
chroma run --path ./chroma_data
```
*Note: The platform transparently redirects writes and lookups to a local in-memory store if ChromaDB is offline.*

### 3. Install and Launch StockSage
```bash
# Install dependencies
npm install

# Run the Next.js development server
npm run dev
```

Open your browser and navigate to `http://localhost:3000` to run your first investment analysis.
