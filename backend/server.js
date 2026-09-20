const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");
const { chromium } = require("playwright");
const { getAlerts, markAlertsRead, getSystemHealth } = require("./alerts");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// In-memory scrape frequency map (safe fallback even without schema migration)
const productFrequencyMap = {};

// ----------------------------------------
// TEST API
// ----------------------------------------
app.get("/", (req, res) => {
  res.json({
    message: "Product Price Tracker API is running",
  });
});

// ----------------------------------------
// GET TRACKED PRODUCTS
// ----------------------------------------
app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tracked_products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message,
      });
    }

    const enhanced = (data || []).map((p) => ({
      ...p,
      scrape_interval_minutes:
        productFrequencyMap[String(p.product_id)] || p.scrape_interval_minutes || 120,
    }));

    res.json(enhanced);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ----------------------------------------
// RUN SCRAPER FOR A PRODUCT
// ----------------------------------------
app.post("/api/scrape/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const { data: product, error } = await supabase
      .from("tracked_products")
      .select("*")
      .eq("product_id", productId)
      .eq("is_active", true)
      .single();

    if (error || !product) {
      return res.status(404).json({
        error: "Tracked product not found",
      });
    }

    const { scrapeProduct } = require("./scraper");

    // Run scraper in-process asynchronously without blocking HTTP response
    scrapeProduct(product.product_url)
      .then((result) => {
        console.log(`✅ Scraper completed for ${productId}:`, result);
      })
      .catch((err) => {
        console.error(`❌ Scraper execution error for ${productId}:`, err);
      });

    res.json({
      message: "Scraper started",
      product_id: product.product_id,
      product_name: product.product_name,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ----------------------------------------
// CRON / BULK SCRAPE ALL ACTIVE PRODUCTS (Frequency Aware)
// ----------------------------------------
app.all(["/api/cron/scrape", "/api/scrape-all"], async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = req.headers["x-cron-secret"] || req.query.secret;
    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized cron trigger" });
    }

    const { data: products, error } = await supabase
      .from("tracked_products")
      .select("*")
      .eq("is_active", true);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!products || products.length === 0) {
      return res.json({ message: "No active tracked products to scrape" });
    }

    // Filter products that are due based on their configured frequency
    const now = Date.now();
    const dueProducts = [];

    for (const p of products) {
      const intervalMins =
        productFrequencyMap[p.product_id] || p.scrape_interval_minutes || 120;
      const intervalMs = intervalMins * 60 * 1000;

      // Check last scrape time
      const { data: latestHistory } = await supabase
        .from("price_history")
        .select("scraped_at")
        .eq("product_id", p.product_id)
        .order("scraped_at", { ascending: false })
        .limit(1);

      if (!latestHistory || latestHistory.length === 0) {
        dueProducts.push(p);
      } else {
        const lastScrapedMs = new Date(latestHistory[0].scraped_at).getTime();
        if (now - lastScrapedMs >= intervalMs) {
          dueProducts.push(p);
        } else {
          const minsAgo = Math.round((now - lastScrapedMs) / 60000);
          console.log(
            `⏱️ Skipping product ${p.product_id} (${p.product_name}): scraped ${minsAgo}m ago (interval: ${intervalMins}m)`,
          );
        }
      }
    }

    console.log(
      `⏱️ Cron triggered: ${dueProducts.length}/${products.length} products due for scrape`,
    );

    if (dueProducts.length === 0) {
      return res.json({
        message: "All tracked products are up-to-date with their scrape intervals",
        total_tracked: products.length,
        scraped_count: 0,
      });
    }

    // Scrape sequentially in background so Render free-tier RAM isn't overloaded
    (async () => {
      const { scrapeProduct } = require("./scraper");
      for (const p of dueProducts) {
        try {
          console.log(`⏱️ Batch scraping product ${p.product_id}...`);
          await scrapeProduct(p.product_url);
        } catch (err) {
          console.error(`⏱️ Error scraping ${p.product_id}:`, err.message);
        }
      }
      console.log(`✅ Batch scrape complete (${dueProducts.length} items)`);
    })();

    res.json({
      message: "Scraping cycle started for due products",
      due_count: dueProducts.length,
      total_tracked: products.length,
      products: dueProducts.map((p) => ({ id: p.product_id, name: p.product_name })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// GET PRICE HISTORY
// ----------------------------------------
app.get("/api/products/:productId/history", async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .eq("product_id", productId)
      .order("scraped_at", { ascending: true });

    if (error) {
      return res.status(500).json({
        error: error.message,
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ----------------------------------------
// GET SCRAPE LOGS
// ----------------------------------------
app.get("/api/products/:productId/logs", async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from("scrape_logs")
      .select("*")
      .eq("product_id", productId)
      .order("started_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message,
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ----------------------------------------
// TRACK PRODUCT
// ----------------------------------------
app.post("/api/products/track", async (req, res) => {
  try {
    const { product_id, product_name, product_url } = req.body;

    if (!product_id || !product_name || !product_url) {
      return res.status(400).json({
        error: "product_id, product_name and product_url are required",
      });
    }

    const { data, error } = await supabase
      .from("tracked_products")
      .upsert(
        {
          product_id: String(product_id),
          product_name,
          product_url,
          is_active: true,
        },
        {
          onConflict: "product_id",
        },
      )
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: error.message,
      });
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ----------------------------------------
// UNTRACK PRODUCT
// ----------------------------------------
app.delete("/api/products/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from("tracked_products")
      .update({ is_active: false })
      .eq("product_id", String(productId))
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      message: "Product untracked successfully",
      product_id: productId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// UPDATE SCRAPE FREQUENCY PER PRODUCT
// ----------------------------------------
app.patch("/api/products/:productId/frequency", async (req, res) => {
  try {
    const { productId } = req.params;
    const { interval } = req.body; // in minutes (e.g. 30, 60, 120, 360, 1440)
    const mins = parseInt(interval, 10) || 120;
    productFrequencyMap[String(productId)] = mins;

    // Persist to Supabase if column exists (safely catch and ignore error if not migrated)
    await supabase
      .from("tracked_products")
      .update({ scrape_interval_minutes: mins })
      .eq("product_id", String(productId))
      .catch(() => {});

    console.log(`⏱️ Updated scrape frequency for product ${productId} to ${mins} minutes`);
    res.json({
      message: "Scrape frequency updated",
      product_id: productId,
      scrape_interval_minutes: mins,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// GET IN-APP ALERTS (Price drops & Restocks)
// ----------------------------------------
app.get("/api/alerts", async (req, res) => {
  try {
    const alerts = await getAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// MARK ALERTS AS READ
// ----------------------------------------
app.post("/api/alerts/mark-read", (req, res) => {
  try {
    const result = markAlertsRead();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// SYSTEM HEALTH & DOM DRIFT MONITORING
// ----------------------------------------
app.get("/api/system/health", (req, res) => {
  try {
    const health = getSystemHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// GET PRODUCT SPECS & REVIEWS (Store Details API)
// ----------------------------------------
const productDetailsCache = {};
const DETAILS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

app.get("/api/products/:productId/details", async (req, res) => {
  try {
    const { productId } = req.params;
    const now = Date.now();

    if (
      productDetailsCache[productId] &&
      now - productDetailsCache[productId].time < DETAILS_CACHE_TTL
    ) {
      return res.json(productDetailsCache[productId].data);
    }

    // Attempt fetch with retry on rate limit (mock store limits to ~1 req/sec)
    let data = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        `https://demo.inelabteamdev.com/api/product/${productId}`,
      );

      if (response.status === 429 || response.status === 503) {
        let retryDelay = 1200;
        try {
          const errBody = await response.json();
          if (errBody.retryAfter) {
            retryDelay = Math.max(1000, errBody.retryAfter * 1000 + 200);
          }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }

      if (!response.ok) {
        break;
      }

      data = await response.json();
      if (data && data.error === "rate_limited") {
        const retryDelay = (data.retryAfter || 1) * 1000 + 200;
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }

      break;
    }

    if (!data || data.error) {
      // Fallback: Check if we have this product in pre-warmed catalogCache
      const catalogItem = (catalogCache || []).find(
        (i) => String(i.id) === String(productId),
      );
      if (catalogItem) {
        data = {
          id: catalogItem.id,
          name: catalogItem.name,
          brand: catalogItem.brand,
          category: catalogItem.category,
          sku: catalogItem.sku,
          description: catalogItem.description,
          specs: {},
          reviews: [],
        };
      } else {
        return res
          .status(404)
          .json({ error: "Product details currently unavailable from store" });
      }
    }

    productDetailsCache[productId] = { time: now, data };
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------
// SEARCH PRODUCTS (Dynamic context with cancellation support)
// ----------------------------------------
let catalogCache = null;
let catalogCacheTime = 0;
const CATALOG_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function loadStoreCatalog(signal) {
  const items = [];
  for (let p = 1; p <= 20; p++) {
    if (signal && signal.aborted) break;
    const res = await fetch(
      `https://demo.inelabteamdev.com/api/catalog?page=${p}&pageSize=60`,
      { signal },
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!data.items || data.items.length === 0) break;
    items.push(...data.items);
    if (data.page >= data.pages) break;
  }
  return items;
}

// Pre-warm catalog cache on server start
(async () => {
  try {
    const items = await loadStoreCatalog();
    if (items.length > 0) {
      catalogCache = items;
      catalogCacheTime = Date.now();
      console.log(`📦 Catalog index pre-warmed with ${items.length} items`);
    }
  } catch (err) {
    console.warn("⚠️ Catalog pre-warm skipped:", err.message);
  }
})();

app.get("/api/search", async (req, res) => {
  const search = (req.query.q || "").trim().toLowerCase();

  if (!search) {
    return res.status(400).json({
      error: "Search query is required",
    });
  }

  let isAborted = false;
  const abortController = new AbortController();
  let browser = null;

  // Detect when client modifies input or aborts previous query
  req.on("close", () => {
    if (!res.writableEnded) {
      console.log(`⏹️ Client disconnected/aborted search for: "${search}"`);
      isAborted = true;
      abortController.abort();
      if (browser) {
        browser.close().catch(() => {});
      }
    }
  });

  try {
    // 1. Fast indexed search via store catalog
    const now = Date.now();
    if (!catalogCache || now - catalogCacheTime > CATALOG_CACHE_TTL) {
      const items = await loadStoreCatalog(abortController.signal);
      if (items.length > 0) {
        catalogCache = items;
        catalogCacheTime = now;
      }
    }

    if (isAborted || req.destroyed) return;

    if (catalogCache && catalogCache.length > 0) {
      const matches = catalogCache.filter((item) => {
        const name = (item.name || "").toLowerCase();
        const brand = (item.brand || "").toLowerCase();
        const category = (item.category || "").toLowerCase();
        const sku = (item.sku || "").toLowerCase();
        return (
          name.includes(search) ||
          brand.includes(search) ||
          category.includes(search) ||
          sku.includes(search)
        );
      });

      // Fetch any existing recorded prices for these products from price_history
      const pids = matches.slice(0, 50).map((item) => String(item.id));
      let latestPricesMap = {};
      try {
        const { data: priceRows } = await supabase
          .from("price_history")
          .select("product_id, price, stock, scraped_at")
          .in("product_id", pids)
          .order("scraped_at", { ascending: false });

        if (priceRows && priceRows.length > 0) {
          priceRows.forEach((row) => {
            if (!latestPricesMap[row.product_id]) {
              latestPricesMap[row.product_id] = {
                price: Number(row.price),
                stock: row.stock,
                scraped_at: row.scraped_at,
              };
            }
          });
        }
      } catch (err) {
        console.warn("⚠️ Price lookup for search skipped:", err.message);
      }

      const results = matches.slice(0, 50).map((item) => {
        const pid = String(item.id);
        const recorded = latestPricesMap[pid] || null;
        return {
          product_id: pid,
          product_name: item.name,
          product_url: `https://demo.inelabteamdev.com/product/${item.id}`,
          brand: item.brand || "",
          category: item.category || "",
          sku: item.sku || "",
          description: item.description || "",
          price: recorded ? recorded.price : null,
          stock: recorded ? recorded.stock : null,
          last_scraped_at: recorded ? recorded.scraped_at : null,
        };
      });

      if (isAborted || req.destroyed) return;

      console.log(
        `🔍 Search "${search}": found ${results.length} matches (with product details & recorded prices)`,
      );
      return res.json(results);
    }

    // 2. Fallback to Playwright if catalog API is unavailable
    if (isAborted || req.destroyed) return;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    } catch (launchErr) {
      if (
        launchErr.message.includes("Executable doesn't exist") ||
        launchErr.message.includes("npx playwright install")
      ) {
        console.warn("⚠️ Chromium executable missing. Auto-installing Playwright Chromium...");
        const { execSync } = require("child_process");
        execSync("npx playwright install chromium", { stdio: "inherit" });
        browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        });
      } else {
        throw launchErr;
      }
    }

    if (isAborted || req.destroyed) return;

    const page = await browser.newPage();

    // In-browser cookie auto-accept
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          /accept/i.test(b.textContent || ""),
        );
        if (btn && btn.offsetParent !== null) {
          btn.click();
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });

    await page.goto("https://demo.inelabteamdev.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const results = [];

    for (let currentPage = 1; currentPage <= 20; currentPage++) {
      if (isAborted || req.destroyed) break;

      await page
        .locator(".tile")
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {});

      const cardCount = await page.locator(".tile").count();

      for (let i = 0; i < cardCount; i++) {
        if (isAborted || req.destroyed) break;

        const card = page.locator(".tile").nth(i);
        const nameLocator = card.locator(".tile-name");

        if (!(await nameLocator.count())) continue;

        const productName = (await nameLocator.innerText()).trim();

        if (!productName.toLowerCase().includes(search)) continue;

        const button = card.locator(".tile-cta");
        await button.click({ force: true });
        await page.waitForTimeout(600);

        let productUrl = page.url();
        if (productUrl.includes("/product/")) {
          const productId = productUrl
            .split("/product/")
            .pop()
            .split("/")
            .shift();
          if (productId) {
            results.push({
              product_id: productId,
              product_name: productName,
              product_url: productUrl,
            });
          }
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        }
      }

      if (results.length > 0 || isAborted || req.destroyed) break;

      // Next page
      const nextBtn = page
        .locator("button")
        .filter({ hasText: /NEXT/i })
        .last();
      if (
        (await nextBtn.count()) &&
        (await nextBtn.isVisible().catch(() => false))
      ) {
        await nextBtn.click({ force: true });
        await page.waitForTimeout(600);
      } else {
        break;
      }
    }

    if (isAborted || req.destroyed) return;

    return res.json(results);
  } catch (error) {
    if (isAborted || error.name === "AbortError" || req.destroyed) {
      console.log(`⏹️ Search cleanly aborted for: "${search}"`);
      return;
    }
    console.error("Search failed:", error.message);
    res.status(500).json({
      error: "Failed to search products",
      message: error.message,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

// ----------------------------------------
// START SERVER
// ----------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);

  // In cloud Linux environments (e.g. Render), ensure Playwright Chromium binary is downloaded at runtime
  if (process.env.RENDER || process.platform === "linux") {
    setTimeout(() => {
      try {
        console.log("🔍 Checking Playwright Chromium runtime availability...");
        const { execSync } = require("child_process");
        execSync("npx playwright install chromium", { stdio: "inherit" });
        console.log("✅ Playwright Chromium ready for scraping");
      } catch (err) {
        console.warn("⚠️ Playwright auto-install warning:", err.message);
      }
    }, 1000);
  }
});
