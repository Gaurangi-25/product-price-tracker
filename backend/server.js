const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");
const { chromium } = require("playwright");
const { spawn } = require("child_process");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

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

    res.json(data);
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

    const scraper = spawn("node", ["scraper.js"], {
      cwd: __dirname,
      env: {
        ...process.env,
        PRODUCT_URL: product.product_url,
      },
    });

    scraper.stdout.on("data", (data) => {
      console.log(`SCRAPER: ${data}`);
    });

    scraper.stderr.on("data", (data) => {
      console.error(`SCRAPER ERROR: ${data}`);
    });

    scraper.on("close", (code) => {
      console.log(`🛑 Scraper finished with code ${code}`);
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
// SEARCH PRODUCTS
// ----------------------------------------
app.get("/api/search", async (req, res) => {
  const search = (req.query.q || "").trim().toLowerCase();

  if (!search) {
    return res.status(400).json({
      error: "Search query is required",
    });
  }

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage();

    // Handle cookie popup whenever it appears
    const handleCookies = async () => {
      const acceptButton = page.getByRole("button", {
        name: "ACCEPT",
        exact: true,
      });

      if (await acceptButton.isVisible().catch(() => false)) {
        console.log("🍪 Cookie popup found");
        await acceptButton.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    };

    await page.goto("https://demo.inelabteamdev.com/", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await handleCookies();

    const results = [];

    for (let currentPage = 1; currentPage <= 50; currentPage++) {
      console.log(`📄 Searching page ${currentPage}/50`);

      await handleCookies();

      await page
        .locator(".tile")
        .first()
        .waitFor({
          state: "visible",
          timeout: 10000,
        })
        .catch(() => {});

      const cardCount = await page.locator(".tile").count();

      console.log(`📦 Products on page: ${cardCount}`);

      for (let i = 0; i < cardCount; i++) {
        await handleCookies();

        const card = page.locator(".tile").nth(i);
        const nameLocator = card.locator(".tile-name");

        if (!(await nameLocator.count())) {
          continue;
        }

        const productName = (await nameLocator.innerText()).trim();

        if (!productName.toLowerCase().includes(search)) {
          continue;
        }

        console.log(`🎯 Match found: ${productName}`);

        await handleCookies();

        const button = page.locator(".tile").nth(i).locator(".tile-cta");

        await button.click({ force: true });

        await page.waitForTimeout(1000);

        let productUrl = page.url();

        // Retry if product page did not open
        if (!productUrl.includes("/product/")) {
          console.log("⚠️ Product page did not open, retrying...");

          await handleCookies();

          const retryButton = page
            .locator(".tile")
            .nth(i)
            .locator(".tile-cta");

          await retryButton.click({ force: true });

          await page.waitForTimeout(1500);

          productUrl = page.url();
        }

        if (!productUrl.includes("/product/")) {
          console.log(`❌ Could not open: ${productName}`);

          await page.goBack({
            waitUntil: "networkidle",
          }).catch(() => {});

          continue;
        }

        const productId = productUrl
          .split("/product/")
          .pop()
          .split("/")
          .shift();

        console.log(`🔗 Product URL: ${productUrl}`);

        if (productId) {
          results.push({
            product_id: productId,
            product_name: productName,
            product_url: productUrl,
          });
        }

        // Return to product listing
        await page.goBack({
          waitUntil: "networkidle",
        });

        await page
          .locator(".tile")
          .first()
          .waitFor({
            state: "visible",
            timeout: 10000,
          })
          .catch(() => {});

        await page.waitForTimeout(500);
      }

      // If matches found, return them
      if (results.length > 0) {
        break;
      }

      // ----------------------------------------
      // NEXT PAGE
      // ----------------------------------------
      if (currentPage < 50) {
        await handleCookies();

        const nextButton = page
          .locator("button")
          .filter({ hasText: /NEXT/i })
          .last();

        const nextExists = await nextButton.count();

        if (!nextExists) {
          console.log("❌ NEXT button not found");
          break;
        }

        if (!(await nextButton.isVisible().catch(() => false))) {
          console.log("❌ NEXT button not visible");
          break;
        }

        if (await nextButton.isDisabled().catch(() => false)) {
          console.log("❌ NEXT button disabled");
          break;
        }

        await nextButton.click({ force: true });

        await page.waitForTimeout(1000);
      }
    }

    console.log("🔍 Search:", search);
    console.log("✅ Results:", results);

    res.json(results);

  } catch (error) {
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
});
