const { chromium } = require("playwright");
const supabase = require("./supabase");

// Target URL from CLI argument or environment variable
const DEFAULT_URL = "https://demo.inelabteamdev.com/product/632";
const targetUrl = process.argv[2] || process.env.PRODUCT_URL || DEFAULT_URL;

// Configuration
const MAX_CYCLES = 3;
const PER_CYCLE_TIMEOUT_MS = 35000;
const IS_HEADLESS = process.env.HEADLESS !== "false";

// ======================================================
// PARSING HELPERS (Bulletproof for all store variations)
// ======================================================

/**
 * Extracts integer price from raw price text.
 * Handles:
 * - Standard: "₹11,226" -> 11226
 * - Trailing taxes: "₹29,645/- (incl. of all taxes)" -> 29645
 * - European notation: "₹29.645,00" -> 29645
 * - Spaced notation: "₹ 29 645" -> 29645
 * - Unicode full-width numerals: "₹２９,６４５" -> 29645
 * - Lakh/decimal: "Rs. 29,645.00" -> 29645
 * - Zero-width spaces & non-breaking spaces (\u200B, \xA0)
 */
function parsePrice(raw) {
  if (!raw) return null;

  // 1. Convert full-width Unicode numerals (０-９) to ASCII (0-9)
  let s = raw.replace(/[\uFF10-\uFF19]/g, (m) =>
    String.fromCharCode(m.charCodeAt(0) - 65248),
  );

  // 2. Strip zero-width spaces, word joiners, and non-breaking spaces
  s = s.replace(/[\u200B\u200C\u200D\uFEFF\xA0]/g, " ");

  // 3. Strip trailing suffixes like "/- (incl. of all taxes)"
  s = s.replace(/\/.*$/i, "");

  // 4. Extract the currency block (₹ or Rs. followed by digits, dots, commas, spaces)
  const match = s.match(/(?:₹|Rs\.?)\s*([\d\s.,]+)/i);
  if (!match) return null;

  let numStr = match[1].trim();

  // 5. Detect European formatting (e.g. 29.645,00 or 1.207,00)
  if (/\.\d{3},\d{2}$/.test(numStr) || /,\d{2}$/.test(numStr)) {
    numStr = numStr.replace(/\./g, "").replace(/,\d+$/, "");
  } else {
    // Standard notation: remove thousand-separating commas and whitespace
    numStr = numStr.replace(/,/g, "").replace(/\s/g, "");
    // Remove trailing decimal cents (.00) if present
    if (/\.\d+$/.test(numStr)) {
      numStr = numStr.split(".")[0];
    }
  }

  const num = parseInt(numStr, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Extracts integer stock count from status badge text.
 * Handles:
 * - "OUT OF STOCK" or "Sold out" -> 0
 * - "In stock · 185 left" -> 185
 * - "Only 126 left" -> 126
 * - "2 in stock" -> 2
 * - "Selling fast — 4 left" -> 4
 * - "Hurry, just 104 left" -> 104
 */
function parseStock(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();

  if (s.includes("out of stock") || s.includes("sold out")) {
    return 0;
  }

  const match = s.match(/(\d[\d,]*)/);
  if (match) {
    const num = parseInt(match[1].replace(/,/g, ""), 10);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }

  return null;
}

// ======================================================
// DATABASE HELPERS (Supabase)
// ======================================================

async function saveTrackedProduct(productId, productName, productUrl) {
  try {
    const { error } = await supabase.from("tracked_products").upsert(
      {
        product_id: String(productId),
        product_name: productName,
        product_url: productUrl,
        is_active: true,
      },
      { onConflict: "product_id" },
    );

    if (error) {
      console.warn("⚠️ Database warning on tracked_products:", error.message);
    } else {
      console.log(`🗄️ Tracked product persisted (${productId}: "${productName}")`);
    }
  } catch (err) {
    console.warn("⚠️ Database exception on tracked_products:", err.message);
  }
}

async function savePriceHistory(productId, price, stock) {
  if (!Number.isFinite(price) || price <= 0) {
    console.error("❌ Refusing to save invalid price to price_history:", price);
    return;
  }
  if (!Number.isFinite(stock) || stock < 0) {
    console.error("❌ Refusing to save invalid stock to price_history:", stock);
    return;
  }

  try {
    const { error } = await supabase.from("price_history").insert({
      product_id: String(productId),
      price,
      stock,
      scraped_at: new Date().toISOString(),
    });

    if (error) {
      console.error("❌ Price history insert failed:", error.message);
    } else {
      console.log(`🗄️ Price history saved: ₹${price} | Stock: ${stock}`);
    }
  } catch (err) {
    console.error("❌ Database exception on price_history:", err.message);
  }
}

async function saveScrapeLog({
  productId,
  startedAt,
  finishedAt,
  status,
  attempts,
  price = null,
  stock = null,
  errorMessage = null,
}) {
  try {
    const { error } = await supabase.from("scrape_logs").insert({
      product_id: String(productId),
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      attempts,
      price,
      stock,
      error_message: errorMessage,
    });

    if (error) {
      console.warn("⚠️ Scrape log insert failed:", error.message);
    } else {
      console.log(`🗄️ Scrape log saved: status=${status}, attempts=${attempts}`);
    }
  } catch (err) {
    console.warn("⚠️ Database exception on scrape_logs:", err.message);
  }
}

// ======================================================
// MAIN SCRAPER ENGINE
// ======================================================

async function scrapeProduct(productUrl = targetUrl) {
  const startedAt = new Date().toISOString();
  const productId = productUrl.split("/product/").pop().replace(/\/$/, "");

  console.log("\n=======================================================");
  console.log(`🚀 INITIATING SCRAPER FOR PRODUCT: ${productId}`);
  console.log(`🔗 Target URL: ${productUrl}`);
  console.log(`🖥️ Browser Mode: ${IS_HEADLESS ? "Headless" : "Headed (Observable)"}`);
  console.log("=======================================================\n");

  let browser = null;
  let totalAttempts = 0;
  let lastError = null;

  try {
    browser = await chromium.launch({
      headless: IS_HEADLESS,
      slowMo: IS_HEADLESS ? 0 : 40,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    // Inject real-time MutationObserver to automatically click "ACCEPT"
    // the very millisecond the cookie banner is attached to the DOM.
    // The store's cookie popup requires up to 3 clicks to dismiss fully.
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const btns = Array.from(
          document.querySelectorAll(".cookie-overlay button, .cookie-banner button"),
        );
        const acceptBtn = btns.find(
          (b) => b.innerText && b.innerText.includes("ACCEPT"),
        );
        if (acceptBtn) {
          acceptBtn.click();
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });

    for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
      totalAttempts++;
      console.log(`\n🔄 Scrape cycle ${cycle}/${MAX_CYCLES}...`);

      try {
        await page.goto(productUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Read and persist product name
        const productName =
          (
            await page
              .locator("h1")
              .first()
              .innerText()
              .catch(() => "")
          ).trim() || `Product ${productId}`;

        console.log(`🛍️ Product: "${productName}"`);
        await saveTrackedProduct(productId, productName, productUrl);

        // Locate price block
        const priceBlock = page.locator(".price-block");
        await priceBlock.waitFor({ state: "visible", timeout: 15000 });

        const box = await priceBlock.boundingBox();
        if (!box) {
          throw new Error("Price block position not found");
        }

        console.log("📍 Simulating human mouse sweep across price area...");

        // Site requirement: minMoves >= 8, interval >= 40ms, dwellMs >= 600ms
        // We perform 16 moves across the box with 55ms delays (~900ms total hover)
        await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5);
        await page.waitForTimeout(60);

        for (let i = 1; i <= 16; i++) {
          const x = box.x + (box.width * i) / 17;
          const y = box.y + (box.height * (i % 2 === 0 ? 0.35 : 0.65));
          await page.mouse.move(x, y);
          await page.waitForTimeout(55);
        }

        await page.waitForTimeout(250);

        // Wait for the button to become enabled
        await page.waitForFunction(
          () => {
            const btn = document.querySelector(".price-block button");
            return btn && !btn.disabled;
          },
          { timeout: 10000 },
        );

        console.log("✅ Reveal Price button enabled. Clicking...");

        // Click Reveal Price
        const revealBtn = page.locator(".price-block button");
        await revealBtn.click({ timeout: 5000 }).catch(async () => {
          // If intercepted by any lingering overlay, force-click
          await revealBtn.click({ force: true });
        });

        // Monitor DOM state and handle retries/timeouts
        const cycleStart = Date.now();
        let cycleDone = false;

        while (Date.now() - cycleStart < PER_CYCLE_TIMEOUT_MS) {
          await page.waitForTimeout(400);

          const state = await page.evaluate(() => {
            const pb = document.querySelector(".price-block");
            if (!pb) return { phase: "unknown" };

            // SUCCESS
            if (pb.classList.contains("price-success")) {
              const main = pb.querySelector(".price-main");
              let sellingPrice = null;

              if (main) {
                // Filter out fake decoys (display: none), strikethrough MRP, and badges
                for (const child of main.children) {
                  const style = window.getComputedStyle(child);
                  if (style.display === "none" || style.visibility === "hidden") continue;
                  if (style.textDecorationLine.includes("line-through")) continue;

                  const text = child.innerText || "";
                  if (
                    text.includes("% off") ||
                    text.includes("Updating") ||
                    text.includes("Deal price") ||
                    text.includes("Price hidden")
                  ) {
                    continue;
                  }

                  const clean = text.replace(/[\u200B\u200C\u200D\uFEFF\xA0]/g, " ").trim();
                  if (clean.includes("₹") || clean.includes("Rs.")) {
                    sellingPrice = clean;
                  }
                }
              }

              const stockEl = document.querySelector(
                ".stock-badge, [class*='stock'], [class*='st-']",
              );

              return {
                phase: "success",
                rawPrice: sellingPrice,
                rawStock: stockEl ? stockEl.innerText.trim() : null,
              };
            }

            // STORE INTERNAL ERROR / CHALLENGE FAILURE
            if (pb.classList.contains("price-error")) {
              const btn = pb.querySelector("button");
              return {
                phase: "error",
                msg: pb.innerText.replace(/\n+/g, " "),
                canRetry: btn && /try again/i.test(btn.innerText),
              };
            }

            // IDLE OR LOADING/RETRYING
            const btn = pb.querySelector("button");
            return {
              phase: pb.classList.contains("price-idle") ? "idle" : "loading",
              statusText: pb.innerText.replace(/\n+/g, " "),
              buttonText: btn ? btn.innerText : null,
              buttonDisabled: btn ? btn.disabled : null,
            };
          });

          // Handle Success
          if (state.phase === "success") {
            const price = parsePrice(state.rawPrice);
            const stock = parseStock(state.rawStock);

            if (price === null || stock === null) {
              throw new Error(
                `Price or stock parsing failed: rawPrice="${state.rawPrice}", rawStock="${state.rawStock}"`,
              );
            }

            console.log("\n🎉 PRICE REVEALED SUCCESSFULLY!");
            console.log(`💰 Current Selling Price: ₹${price}`);
            console.log(`📦 Stock Quantity: ${stock}`);

            await savePriceHistory(productId, price, stock);
            await saveScrapeLog({
              productId,
              startedAt,
              finishedAt: new Date().toISOString(),
              status: "success",
              attempts: totalAttempts,
              price,
              stock,
            });

            cycleDone = true;
            return {
              success: true,
              productId,
              price,
              stock,
              attempts: totalAttempts,
            };
          }

          // Handle Store Error: Click "Try again"
          if (state.phase === "error" && state.canRetry) {
            console.log(`⚠️ Store error detected: "${state.msg}". Clicking Try Again...`);
            totalAttempts++;
            const retryBtn = page.getByRole("button", { name: /try again/i });
            await retryBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1000);
          }

          // Handle missed click in idle phase
          if (state.phase === "idle" && state.buttonDisabled === false) {
            const idleBtn = page.locator(".price-block button");
            await idleBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
          }
        }

        if (!cycleDone) {
          throw new Error("Timed out waiting for price state");
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`⚠️ Cycle ${cycle} notice: ${err.message} (will retry if cycles remaining)`);
        await page.waitForTimeout(1000);
      }
    }

    // If all cycles exhausted
    console.error(`\n❌ Scraper could not resolve price after ${MAX_CYCLES} cycles.`);
    await saveScrapeLog({
      productId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      attempts: totalAttempts,
      price: null,
      stock: null,
      errorMessage: lastError || "Failed after maximum retries",
    });

    return {
      success: false,
      productId,
      price: null,
      stock: null,
      attempts: totalAttempts,
      error: lastError,
    };
  } catch (fatalErr) {
    console.error(`\n❌ Scraper fatal exception for product ${productId}:`, fatalErr.message);
    await saveScrapeLog({
      productId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      attempts: Math.max(totalAttempts, 1),
      price: null,
      stock: null,
      errorMessage: fatalErr.message,
    });
    return {
      success: false,
      productId,
      price: null,
      stock: null,
      attempts: Math.max(totalAttempts, 1),
      error: fatalErr.message,
    };
  } finally {
    if (browser) {
      console.log("🔴 Closing browser...");
      await browser.close().catch(() => {});
    }
  }
}

// CLI Execution Entrypoint
if (require.main === module) {
  scrapeProduct(targetUrl)
    .then((result) => {
      console.log("\nExecution completed with result:", result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal exception:", err);
      process.exit(1);
    });
}

module.exports = { scrapeProduct, parsePrice, parseStock };
