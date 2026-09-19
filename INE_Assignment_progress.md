# INE Software Engineer Intern Assignment — Progress Tracker

## Goal

Build a Product Price Tracker for INE's mock store:

https://demo.inelabteamdev.com/

Core flow:

Mock Store → Scraper → Price/Stock → Supabase → React Dashboard

---

## ✅ DONE / UNDERSTOOD

### Assignment requirements

- [x] Product search by partial/full product name
- [x] Select and track a product
- [x] Scrape current price and stock
- [x] Scrape every 2 hours
- [x] Store tracked products + history in Supabase
- [x] Show price/stock history
- [x] Show per-product scrape logs
- [x] Handle slow/failing requests with retries
- [x] Never save invalid/empty scrape data
- [x] Provide headed scraper run + 2–4 min recording
- [x] Deploy frontend on Vercel
- [x] Deploy backend on Render
- [x] Use external cron (e.g. cron-job.org)
- [x] README + design note + PDF resume
- [x] Submit GitHub + live site + recording

### Mock store inspection

- [x] Found visible product price structure.
- [x] Price is rendered through an `<output>` with digits in separate `<span>` elements.
- [x] Found hidden price values too — must NOT blindly scrape hidden values.
- [x] Found stock element.
- [x] Stock can appear as `Hurry, Just 104 left`, `2 IN STOCK`, or `OUT OF STOCK`.
- [x] Need to extract the numeric stock value correctly.

### Initial technical decision

- [x] First test HTTP fetching + HTML parsing (Axios + Cheerio).
- [x] Do NOT jump to Playwright immediately.
- [x] Axios/Cheerio did not receive the required rendered price/stock reliably.
- [x] Playwright is required for the actual scraping flow because the price reveal is browser/interaction dependent.

---

## 🚀 SCRAPER — CURRENT STATUS

### Playwright setup

- [x] Installed Playwright.
- [x] Installed Chromium with `npx playwright install chromium`.
- [x] Product page opens successfully.
- [x] Cookie popup handling implemented.
- [x] Price area detection implemented.
- [x] Mouse movement/sweep implemented to trigger the site's interaction requirement.
- [x] Reveal Price button detection implemented.
- [x] Waits until Reveal Price becomes enabled.
- [x] Reveal Price click implemented.

### Price extraction

- [x] Handles zero-width characters in price text.
- [x] Handles `₹` format.
- [x] Handles `Rs.` format.
- [x] Handles commas in prices.
- [x] Validates that extracted price is a positive number.
- [x] Invalid price now causes a clean scraper failure instead of an infinite loop.
- [x] Example successful extraction: `₹​9​,​9​2​9` → `9929`.

### Stock extraction

- [x] `OUT OF STOCK` → `0`
- [x] `104 left` → `104`
- [x] `2 IN STOCK` → `2`
- [x] Does not treat `challenge_failed` as out of stock.

### Retry / failure handling

- [x] Maximum attempts configured (`8`).
- [x] Detects successful price state.
- [x] Detects `challenge_failed`.
- [x] Detects timeout while waiting for price state.
- [x] Detects `TRY AGAIN` and can click it.
- [x] Logs retry attempts.
- [x] Does not silently save invalid price data.
- [ ] Fully test a real `challenge_failed` / retry scenario.
- [ ] Fully test a real timeout scenario.
- [ ] Test multiple unattended runs with different products.
- [ ] Confirm final failure object/log format.

### Current scraper test result

Successful runs completed **3 consecutive times**.

Example:

```text
🌐 Product page opened
🍪 No cookie popup
💰 Price area found
💰 Reveal Price button found
🖱️ Mouse sweep completed
⏳ Reveal Price still disabled...
✅ Reveal Price button enabled
🖱️ Reveal Price clicked

🔄 Attempt 1/8
Raw price: ₹​9​,​9​2​9
Raw stock: OUT OF STOCK

🎉 SUCCESS
Price: 9929
Stock: 0
```

**Current position:** Normal successful scraping flow is working.  
**Next scraper task:** Force/test a failure and verify the retry path.

---

## 🚧 NEXT MAJOR TASK

### Step 3 — Make scraper reliability complete

Before moving to database/backend:

1. Test `challenge_failed`.
2. Test `TRY AGAIN`.
3. Test timeout.
4. Test invalid/missing price.
5. Test invalid/missing stock.
6. Run scraper multiple times.
7. Make sure every attempt has a clear outcome.
8. Make sure failed scrapes never create fake history entries.

Only after this is reliable → move to Supabase.

---

## ⏳ LEFT TO BUILD

### Database

- [ ] Create Supabase project
- [ ] Design tables
- [ ] `tracked_products` table
- [ ] `price_history` table
- [ ] `scrape_logs` table
- [ ] Connect backend to Supabase

### Backend API

- [ ] Product search API
- [ ] Track product API
- [ ] Get tracked products API
- [ ] Get price/stock history API
- [ ] Get scrape logs API
- [ ] Scrape endpoint for cron
- [ ] Secure/validate cron endpoint as appropriate

### Scheduling

- [ ] Configure cron-job.org
- [ ] Trigger scrape endpoint every 2 hours
- [ ] Verify Render sleep/free-tier behavior

### Frontend

- [ ] React setup
- [ ] Product search UI
- [ ] Search results
- [ ] Track button
- [ ] Tracked products dashboard
- [ ] Current price + stock
- [ ] Price/stock history table or chart
- [ ] Scrape log UI
- [ ] Loading/error states

### Deployment

- [ ] Deploy backend to Render
- [ ] Deploy frontend to Vercel
- [ ] Configure Supabase environment variables
- [ ] Configure frontend/backend URLs
- [ ] Test complete live flow

### Final submission

- [ ] Public GitHub repository
- [ ] README with setup, schedule, env variables
- [ ] Design note:
  - scraping reliability
  - trade-offs
  - AI first-attempt mistakes + corrections
- [ ] Headed scraper screen recording (2–4 min)
- [ ] PDF resume
- [ ] Email submission
- [ ] Final deadline: September 20, 2026, 11:59 PM IST

---

## ⭐ PRIORITY ORDER

1. Scraper works
2. Scraper is reliable
3. Database + history + logs
4. Scheduled scraping
5. Backend APIs
6. React dashboard
7. Deployment
8. Recording + README + design note
9. Bonus features ONLY if time remains

---

## 🚫 BONUS — DO LAST

- [ ] Price-drop alerts
- [ ] Back-in-stock alerts
- [ ] Multi-product dashboard enhancements
- [ ] Page-structure change detection
- [ ] Configurable scrape frequency
- [ ] GitHub Actions CI/CD

---

## 📍 CURRENT POSITION

➡️ **Scraper normal-success flow is DONE.**

➡️ **Currently working on scraper reliability testing.**

➡️ **Next:** Test failure + retry behavior → then move to Supabase.
