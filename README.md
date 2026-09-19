# Product Price Tracker

A robust, full-stack web application designed for the **INE Software Engineer Intern Assignment**. The system tracks product prices and stock availability on INE's mock e-commerce storefront ([demo.inelabteamdev.com](https://demo.inelabteamdev.com/)), persisting historical price trends and honest scrape attempt logs into Supabase, and displaying them on an intuitive React dashboard.

---

## 🏛️ System Architecture

```
                       ┌──────────────────────────────┐
                       │   External Cron Service      │
                       │   (e.g., cron-job.org / 2h)  │
                       └──────────────┬───────────────┘
                                      │ HTTP GET/POST /api/cron/scrape
                                      ▼
┌─────────────────────────┐       ┌──────────────────────────────┐
│  React Dashboard        │ <───> │  Express 5 REST API          │
│  (Vite + React 19)      │       │  (Node.js Backend)           │
└─────────────────────────┘       └───────┬──────────────┬───────┘
                                          │              │
                                          │ Invokes      │ Stores / Reads
                                          ▼              ▼
                          ┌────────────────────────┐   ┌────────────────────────┐
                          │ Playwright Headless /  │   │  Supabase PostgreSQL   │
                          │ Headed Scraper Engine  │   │  • tracked_products    │
                          └───────────┬────────────┘   │  • price_history       │
                                      │                │  • scrape_logs         │
                                      ▼                └────────────────────────┘
                          ┌────────────────────────┐
                          │ INE Mock Storefront    │
                          │ (demo.inelabteamdev)   │
                          └────────────────────────┘
```

---

## 🚀 Tech Stack

- **Frontend**: React 19, Vite, Plain CSS (clean, responsive, no bloated frameworks)
- **Backend**: Node.js, Express 5, CORS, Dotenv
- **Scraper**: Playwright (Chromium) with custom human mouse sweeps and in-browser MutationObserver
- **Database**: Supabase (PostgreSQL)
- **Scheduler**: External cron service (cron-job.org) hitting the backend batch scrape endpoint

---

## ✨ Core Features

1. **Dynamic Product Search & Tracking**:
   - Live catalog search by partial or full product name.
   - Dynamic context updates with `AbortController` request cancellation to abort obsolete in-flight searches on rapid input.
   - Clean 3-cards-per-row grid layout with product ID, brand, category, SKU, direct store link, and live track status.
   - One-click tracking persisted into Supabase `tracked_products` with immediate initial scrape.
2. **Resilient Scraper Engine**:
   - **Interaction Bypassing**: Automatically executes a 16-step human-like mouse sweep over 900ms to fulfill `minMoves >= 8`, $\ge 40$ms interval, and `dwellMs >= 600ms` requirements.
   - **Real-Time Cookie Dismissal**: Uses an in-browser `MutationObserver` to instantly dismiss the store's delayed cookie popup and click-counter (requiring up to 3 clicks) without blocking pointer events.
   - **Price Normalization & Decoy Filtering**: Filters out hidden fake prices (`display: none`), strikethrough original MRPs, and discount tags. Correctly parses standard (`₹11,226`), trailing (`/- (incl. taxes)`), European (`.00,00`), full-width Unicode numerals (`０-９`), and split span structures.
   - **Stock Extraction**: Accurately parses stock badges (`OUT OF STOCK` $\rightarrow 0$, `In stock · 185 left` $\rightarrow 185$, `Only 126 left` $\rightarrow 126$).
3. **Honest Scrape Telemetry & Logging**:
   - Records every scrape attempt (status, timestamp, duration, attempt count, price, stock, error message).
   - Displayed with clean `SUCCESS` / `FAILED` indicators and clear attempt counts.
   - **Never saves invalid or corrupt data** to `price_history`.
4. **Interactive Monitoring Dashboard**:
   - **Top Summary Metrics Bar**: Live counts for total tracked products, in-stock count, out-of-stock count, and last synchronized timestamp.
   - **Product Card Insights**: Current price, stock badge (`In Stock` / `Out of Stock`), SKU, and last updated time.
   - **Interactive SVG Price Chart**: Dynamic visual trend line graph showing price trajectory over time with interactive point details.
   - **Chronological History Table**: Complete price and stock audit log per product.
   - **On-Demand Scraping**: One-click "⚡ Scrape Now" button on each card with polling feedback.
5. **Observable Headed Mode**:
   - Can run headlessly for scheduled cron runs or headed (`npm run scrape:headed`) for visual demonstration and screen recording.

---

## 🗄️ Database Schema (Supabase)

If setting up a fresh Supabase project, execute the following SQL in the Supabase SQL Editor:

```sql
-- 1. Tracked Products Table
CREATE TABLE IF NOT EXISTS tracked_products (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  product_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Price History Table
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  price NUMERIC NOT NULL,
  stock INTEGER NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Scrape Logs Table
CREATE TABLE IF NOT EXISTS scrape_logs (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL, -- 'success' or 'failed'
  attempts INTEGER DEFAULT 1,
  price NUMERIC,
  stock INTEGER,
  error_message TEXT
);
```

---

## ⚙️ Environment Variables

### Backend (`backend/.env` or Render environment)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase Service Role or API Secret Key | `sb_secret_...` |
| `PORT` | Port for Express server | `5000` |
| `CRON_SECRET` | *(Optional)* Secret token to secure `/api/cron/scrape` | `my_cron_secret_token` |

### Frontend (`frontend/.env` or Vercel environment)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base URL of the backend API | `http://localhost:5000` (local) or `https://backend.onrender.com` |

---

## 🛠️ Local Setup & Running

### 1. Prerequisites
- Node.js (v18+ recommended, v22 supported)
- Git

### 2. Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd product-price-tracker

# Install root dependencies
npm install

# Install Playwright browser binaries
npx playwright install chromium

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Environment Configuration
Create a `backend/.env` file:
```env
SUPABASE_URL=https://<your-supabase-id>.supabase.co
SUPABASE_SECRET_KEY=<your-supabase-secret-key>
PORT=5000
```

### 4. Running the Application

#### Start the Backend API Server:
```bash
npm run start:backend
# Server runs on http://localhost:5000
```

#### Start the Frontend React Dashboard:
```bash
cd frontend
npm run dev
# Dashboard opens on http://localhost:5173
```

#### Run Scraper Directly (CLI):
```bash
# Headless run on default product:
npm run scrape

# Headless run on a specific product URL:
node backend/scraper.js https://demo.inelabteamdev.com/product/101

# Headed (Observable) mode for video recording / inspection:
npm run scrape:headed
```

---

## 📡 Backend API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Health check endpoint |
| `GET` | `/api/products` | Lists all active tracked products |
| `POST` | `/api/products/track` | Upserts a product to `tracked_products` (`{ product_id, product_name, product_url }`) |
| `POST` | `/api/scrape/:productId` | Spawns scraper for a single product |
| `ALL` | `/api/cron/scrape` | Batch scrapes all active tracked products sequentially (for cron-job.org) |
| `GET` | `/api/products/:productId/history` | Chronological price & stock history for a product |
| `GET` | `/api/products/:productId/logs` | Scrape attempt logs with duration, attempts, and error details |
| `GET` | `/api/search?q=<query>` | Scrapes the store catalog for matching products |

---

## ⏱️ Scheduling Strategy (cron-job.org)

Free-tier backends (such as Render) spin down during periods of inactivity. An internal `setInterval` timer would stop running when the instance sleeps.

To resolve this constraint:
1. We exposed a dedicated endpoint: `GET /api/cron/scrape` (or `POST /api/scrape-all`).
2. Configured on **[cron-job.org](https://cron-job.org)**:
   - **URL**: `https://<your-render-url>/api/cron/scrape`
   - **Schedule**: Every 2 hours (`0 */2 * * *`)
   - **Headers / Auth**: Optional `x-cron-secret: <CRON_SECRET>`
3. When triggered, the external ping automatically wakes up the Render container, sequentially scrapes all active products, and logs each outcome to Supabase.
