# Design Note: Scraping Reliability, Architectural Trade-offs, and Iteration Learnings

**Project**: Product Price Tracker (INE Software Engineer Intern Assignment)  
**Author**: Candidate  
**Target Store**: `https://demo.inelabteamdev.com/`  

---

## 1. How We Made the Scraping Reliable

The mock storefront provided by INE is intentionally difficult to scrape, embedding multiple layers of anti-bot protections, asynchronous challenges, randomized currency formats, and deceptive DOM structures. To ensure high reliability across unattended runs, we decompiled and inspected the store's frontend JavaScript bundle (`assets/index-B9UiQq4X.js`) to reverse-engineer its exact requirements and state machine.

### A. Overcoming the Interaction & Dwell Challenge
The store does not reveal prices upon clicking or hovering naively. The client-side component instantiates an interaction monitor:
```javascript
new Ar({ minMoves: 8, minDwellMs: 600 })
```
- **Requirements**:
  - `minMoves >= 8`: At least 8 mouse move events must occur within `.price-block`.
  - `minInterval >= 40ms` (`kr = 40`): Rapid programmatic events fired $<40$ms apart are discarded.
  - `minDwellMs >= 600`: The mouse must have entered the bounding box at least 600ms prior to clicking.
  - `isTrusted: true`: The click event must originate from real browser pointer events.
- **Our Implementation**: We built a 16-step zigzag mouse sweep across the `.price-block` bounding box with 55ms delays between movements ($\approx 900$ms total hover). This reliably satisfies the moves count, time interval, and dwell threshold on every run, enabling the "Reveal Price" button deterministically.

### B. Defeating the Asynchronous Cookie Trap with Click-Counter
The store uses a multi-faceted cookie dialog designed to disrupt automation:
1. **Random Delay**: Rather than rendering immediately, the popup is scheduled via `setTimeout` with a randomized delay (1–3 seconds into the session).
2. **Click Counter**: The consent dialog initializes an internal counter (`i.current`) set randomly to **1, 2, or 3** (`Jr()`). Clicking "ACCEPT" decrements the counter; the modal only closes once the counter reaches 0.
3. **Pointer Interception**: If Playwright invokes `.click()` while `<div class="cookie-overlay">` is mounted, Playwright pauses for its default actionability timeout (30,000ms), waiting for the intercepting element to vanish.

**Our Implementation**: We injected an in-browser `MutationObserver` directly into the DOM via `page.addInitScript`:
```javascript
const observer = new MutationObserver(() => {
  const btns = Array.from(document.querySelectorAll(".cookie-overlay button, .cookie-banner button"));
  const acceptBtn = btns.find(b => b.innerText && b.innerText.includes("ACCEPT"));
  if (acceptBtn) acceptBtn.click();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
```
The exact millisecond the store's timer attaches `.cookie-overlay`, the browser-level observer catches it and clicks "ACCEPT" in 0ms until the counter reaches zero, preventing Playwright pointer interception entirely.

### C. Defeating Decoys and Normalizing Currency Formats
The store injects fake prices and rotates across multiple international formats:
- **Decoys**: Hidden elements with `style="display: none;"` (`.price-value`, `.amount[data-price="true"]`), original strikethrough MRP (`.mr-q9`), and discount badges (`.bd-q9`, e.g. `55% off`).
- **Formatting Variations**: The store randomly cycles between `spaced` (`₹ 29 645`), `euro` (`₹29.645,00`), `trailing` (`₹29,645/- (incl. of all taxes)`), `unicode` (full-width numerals `０-９`), `lakh` (`Rs. 29,645.00`), and `split` (digits split across individual `<span>` tags with zero-width spaces `\u200B`).
- **Our Implementation**:
  1. We evaluate computed CSS styles in the browser, filtering out any element where `display === "none"` or `textDecorationLine.includes("line-through")`, or that contains `% off` or `Deal price`.
  2. Our parser normalizes full-width Unicode characters (`\uFF10-\uFF19`) to standard ASCII digits, strips zero-width spaces (`\u200B`), removes trailing tax strings, and parses both European and Indian comma notation into clean positive integers.

### D. Multi-Cycle Fault Recovery & Honest Logging
- When upstream network requests fail (429 or 500), the store enters `phase: 'retrying'` (up to 6 internal retries). If exhausted, it transitions to `phase: 'error'` with a `"Try again"` button.
- Our scraper observes these states: if `"Try again"` appears, it clicks it; if the page stalls, it gracefully reloads the page and restarts a fresh cycle (up to 3 page cycles).
- **Integrity**: If all retries fail, it logs the failure honestly to `scrape_logs` and **never writes empty or fabricated data** to `price_history`.

---

## 2. Architectural Trade-offs

### A. Headless Browser (Playwright) vs. Lightweight HTTP (Axios + Cheerio)
- **Trade-off Considered**: Lightweight HTTP fetching is fast and consumes minimal RAM.
- **Decision**: We initially attempted HTTP fetching via Axios and Cheerio. However, inspecting the store revealed that price and stock are **not** present in the initial HTML or static API endpoints. Prices are encrypted and only decrypted after solving a WebAssembly challenge, generating an ephemeral session token, and sending client-side mouse telemetry (`snapshot({ trusted: true, moves, dwellMs })`). A headless browser was genuinely mandatory to execute the WebAssembly and interaction pipeline.

### B. Sequential vs. Parallel Batch Scraping on Free-Tier Render
- **Trade-off Considered**: Scraping multiple tracked products concurrently reduces total run duration.
- **Decision**: Free-tier cloud instances (like Render) have strict memory limits (512MB RAM). Launching multiple Chromium instances simultaneously causes memory spikes and Out-Of-Memory (OOM) SIGKILL crashes. We opted for **sequential processing** in `/api/cron/scrape`, reusing the scraper instance cleanly to guarantee memory stability within free-tier limits.

### C. In-Browser MutationObserver vs. Node-Level Polling for Cookies
- **Trade-off Considered**: Polling for the cookie banner from Node.js using `page.locator().click()`.
- **Decision**: Node-to-browser CDP (Chrome DevTools Protocol) round-trips introduce a 50–200ms lag. If the cookie popup appears while Playwright is executing an action, Playwright locks up waiting for the interception to clear. Running a native `MutationObserver` directly on the browser's DOM thread handles the popup synchronously with zero network latency.

---

## 3. What AI Tools Got Wrong on the First Attempt & How We Corrected It

During early experimentation, naive code generated by AI coding assistants introduced subtle, critical bugs that caused intermittent failures:

### 1. The Whitespace Regex & Discount Concatenation Bug
- **What Went Wrong**: An early AI-generated regex for extracting prices used `/(?:₹|Rs\.)[\s\d,]+/g`. When the store rendered `₹11,312` immediately followed by `<span class="badge">55% off</span>`, the regex matched the price digits, the trailing space, and the discount digits (`55`), resulting in an erroneous price of `1131255`.
- **How We Corrected It**: We restricted the regex strictly to price characters, stripped any trailing text before parsing, and filtered out non-price elements (such as `% off`, `Deal price`, and `Updating…`) at the DOM level using computed CSS rules before extracting text.

### 2. The Double-Click WebAssembly Challenge Abort
- **What Went Wrong**: To "ensure" the button was clicked, an AI suggestion clicked the "Reveal Price" button, waited 1000ms, and clicked it a second time as a fallback.
- **How We Corrected It**: Inspecting the network requests revealed that at 1000ms, the store's `/api/challenge` and WebAssembly computation were actively in progress. Clicking a second time aborted the active request or reset the component's internal state machine back to idle. We removed the secondary click, replacing it with a single trusted click followed by polling the component's phase (`price-success`, `price-error`, or `retrying`).

### 3. Blind Polling and False Timeouts
- **What Went Wrong**: Early AI code placed `revealButton.click()` outside the retry loop. Inside the loop, it checked `waitForResult()`. If a timeout occurred, it logged "TRY AGAIN not visible" and looped to attempt 2—waiting another 30 seconds without ever re-clicking or interacting with the page.
- **How We Corrected It**: We redesigned the retry mechanism as a multi-cycle state machine. If the store displays "Try again", it clicks it. If a cycle stalls, it performs a complete page reload and re-sweeps, allowing legitimate recovery from transient 500 errors.

### 4. Zero-Width Space & Full-Width Unicode Character Truncation
- **What Went Wrong**: When the store selected the `split` layout, each digit was wrapped in a `<span>` with zero-width spaces (`\u200B`). Simple string checks failed to match, and standard `parseInt` truncated at non-breaking spaces or full-width Unicode numerals (`０-９`).
- **How We Corrected It**: We built a dedicated parsing pipeline that strips `\u200B`, `\u200C`, `\u200D`, `\uFEFF`, and `\xA0`, and maps Unicode full-width digits (`\uFF10-\uFF19`) directly back to ASCII `0-9`.
