const { chromium } = require("playwright");
const supabase = require("./supabase");

const url =
  process.env.PRODUCT_URL || "https://demo.inelabteamdev.com/product/632";
const PRODUCT_ID = url.split("/").pop();

const MAX_ATTEMPTS = 8;
const PRICE_WAIT_TIMEOUT = 30000;
const CHECK_INTERVAL = 500;

// ======================================================
// SUPABASE HELPERS
// ======================================================

async function saveTrackedProduct(productName) {
  const { error } = await supabase.from("tracked_products").upsert(
    {
      product_id: PRODUCT_ID,
      product_name: productName,
      product_url: url,
      is_active: true,
    },
    {
      onConflict: "product_id",
    },
  );

  if (error) {
    throw new Error(`Tracked product save failed: ${error.message}`);
  }

  console.log("🗄️ Tracked product saved");
}

async function savePriceHistory(price, stock) {
  const { error } = await supabase.from("price_history").insert({
    product_id: PRODUCT_ID,
    price,
    stock,
    scraped_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Price history save failed: ${error.message}`);
  }

  console.log("🗄️ Price history saved");
}

async function saveScrapeLog({
  startedAt,
  finishedAt,
  status,
  attempts,
  price = null,
  stock = null,
  errorMessage = null,
}) {
  const { error } = await supabase.from("scrape_logs").insert({
    product_id: PRODUCT_ID,
    started_at: startedAt,
    finished_at: finishedAt,
    status,
    attempts,
    price,
    stock,
    error_message: errorMessage,
  });

  if (error) {
    console.log("⚠️ Scrape log save failed:", error.message);
  } else {
    console.log("🗄️ Scrape log saved");
  }
}

// ======================================================
// 1. HANDLE COOKIES
// ======================================================

async function handleCookies(page) {
  const acceptButton = page.getByRole("button", {
    name: "ACCEPT",
    exact: true,
  });

  const visible = await acceptButton.isVisible().catch(() => false);

  if (!visible) {
    return false;
  }

  console.log("🍪 Cookie popup detected");

  for (let i = 0; i < 3; i++) {
    try {
      await acceptButton.scrollIntoViewIfNeeded().catch(() => {});

      await acceptButton.click({
        force: true,
        timeout: 3000,
      });

      await page.waitForTimeout(500);

      const stillVisible = await acceptButton.isVisible().catch(() => false);

      if (!stillVisible) {
        console.log("✅ Cookie popup accepted");
        return true;
      }

      console.log(`⚠️ Cookie popup still visible - retry ${i + 1}/3`);
    } catch (error) {
      console.log(`⚠️ Cookie click failed - retry ${i + 1}/3`);
    }
  }

  return false;
}

// ======================================================
// 2. EXTRACT ACTUAL PRICE
// ======================================================

async function extractPrice(page) {
  const priceBlock = page.locator(".price-block");

  const text = await priceBlock.innerText().catch(() => "");

  console.log("💰 Current price-block text:");
  console.log(text);

  // Get every ₹ or Rs. price from the visible price block
  const matches = text.match(/(?:₹|Rs\.)[ \t]*[\d,]+(?:\.\d+)?/gi) || [];
  console.log("💰 Prices detected:", matches);

  if (matches.length === 0) {
    return null;
  }

  const prices = matches.map((value) =>
    Number(
      value
        .replace(/₹/g, "")
        .replace(/Rs\./gi, "")
        .replace(/[,\s]/g, "")
        .trim(),
    ),
  );

  console.log("💰 Numeric prices:", prices);

  /*
    Current page can show:

    ₹15,849
    Deal price ₹14,264
    ₹12,679

    OR:

    ₹15,849
    Deal price ₹14,264
    Rs. 12,679.00

    The actual displayed selling price is the LAST
    price amount in the price block.
  */

  const currentPrice = prices[prices.length - 1];

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    console.log("❌ Invalid current price");
    return null;
  }

  console.log("🎯 CURRENT PRICE DETECTED:", currentPrice);

  return currentPrice;
}

// ======================================================
// 3. EXTRACT STOCK
// ======================================================

async function extractStock(page) {
  const stockBadge = page.locator(".stock-badge");

  const stockText = await stockBadge.innerText().catch(() => "");

  console.log(`📦 Stock text: "${stockText}"`);

  if (/out of stock/i.test(stockText)) {
    return 0;
  }

  const leftMatch = stockText.match(/(\d[\d,]*)\s*left/i);

  const inStockMatch = stockText.match(/(\d[\d,]*)\s*in stock/i);

  if (leftMatch) {
    return Number(leftMatch[1].replace(/,/g, ""));
  }

  if (inStockMatch) {
    return Number(inStockMatch[1].replace(/,/g, ""));
  }

  return null;
}

// ======================================================
// 4. DEBUG CURRENT PRICE AREA
// ======================================================

async function printPriceDebug(page) {
  console.log("\n---------------- DEBUG ----------------");

  const priceBlockText = await page
    .locator(".price-block")
    .innerText()
    .catch(() => "");

  console.log("💰 PRICE BLOCK:");
  console.log(priceBlockText.trim());

  const outputs = page.locator("output");

  const outputCount = await outputs.count().catch(() => 0);

  console.log("🔢 OUTPUT COUNT:", outputCount);

  for (let i = 0; i < outputCount; i++) {
    const text = await outputs
      .nth(i)
      .innerText()
      .catch(() => "");

    const visible = await outputs
      .nth(i)
      .isVisible()
      .catch(() => false);

    console.log(`   Output ${i + 1}: visible=${visible}, text="${text}"`);
  }

  const buttons = page.locator(".price-block button");

  const buttonCount = await buttons.count().catch(() => 0);

  console.log("🔘 BUTTON COUNT:", buttonCount);

  for (let i = 0; i < buttonCount; i++) {
    const text = await buttons
      .nth(i)
      .innerText()
      .catch(() => "");

    const visible = await buttons
      .nth(i)
      .isVisible()
      .catch(() => false);

    const disabled = await buttons
      .nth(i)
      .isDisabled()
      .catch(() => false);

    console.log(
      `   Button ${i + 1}: visible=${visible}, disabled=${disabled}, text="${text}"`,
    );
  }

  console.log("----------------------------------------\n");
}

// ======================================================
// 5. CHECK TRY AGAIN
// ======================================================

async function isTryAgainVisible(page) {
  const retryButton = page.getByRole("button", {
    name: /TRY AGAIN/i,
  });

  return await retryButton.isVisible().catch(() => false);
}

// ======================================================
// 6. WAIT FOR RESULT
// ======================================================

async function waitForResult(page) {
  const startTime = Date.now();

  let lastDebugTime = 0;

  while (Date.now() - startTime < PRICE_WAIT_TIMEOUT) {
    // ------------------------------------------
    // Cookie can appear at any time
    // ------------------------------------------

    await handleCookies(page);

    // ------------------------------------------
    // MOST IMPORTANT:
    // ALWAYS CHECK ACTUAL PRICE FIRST
    // ------------------------------------------

    const price = await extractPrice(page);

    if (price !== null && Number.isFinite(price) && price > 0) {
      console.log(`\n🎯 ACTUAL PRICE FOUND: ₹${price}`);

      console.log("🛑 SUCCESS DETECTED — STOPPING CURRENT ATTEMPT");

      return {
        state: "success",
        price,
      };
    }

    // ------------------------------------------
    // Only if price NOT found,
    // check TRY AGAIN
    // ------------------------------------------

    const retryVisible = await isTryAgainVisible(page);

    if (retryVisible) {
      console.log("⚠️ TRY AGAIN is visible");

      return {
        state: "retry",
        price: null,
      };
    }

    // ------------------------------------------
    // Debug every ~2 seconds
    // ------------------------------------------

    if (Date.now() - lastDebugTime > 2000) {
      console.log("⏳ Price not available yet...");

      await printPriceDebug(page);

      lastDebugTime = Date.now();
    }

    await page.waitForTimeout(CHECK_INTERVAL);
  }

  return {
    state: "timeout",
    price: null,
  };
}

// ======================================================
// 7. MAIN SCRAPER
// ======================================================

async function scrape() {
  const startedAt = new Date().toISOString();
  let attempt = 0;

  console.log("\n=================================");
  console.log("🚀 STARTING SCRAPER");
  console.log("=================================\n");

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  console.log("🌐 Browser opened");

  const page = await browser.newPage();

  console.log("📄 ONE product page created");

  try {
    // ==================================================
    // OPEN PRODUCT
    // ==================================================

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("🌐 Product page opened");

    // ==================================================
    // SUPABASE - TRACK PRODUCT
    // ==================================================

    const productName =
      (
        await page
          .locator("h1")
          .first()
          .innerText()
          .catch(() => "")
      ).trim() || `Product ${PRODUCT_ID}`;

    console.log("🛍️ Product:", productName);

    await saveTrackedProduct(productName);

    // ==================================================
    // COOKIE
    // ==================================================

    await handleCookies(page);

    // ==================================================
    // PRICE AREA
    // ==================================================

    const priceArea = page.locator(".price-block");

    await priceArea.waitFor({
      state: "visible",
      timeout: 10000,
    });

    console.log("💰 Price area found");

    // ==================================================
    // REVEAL BUTTON
    // ==================================================

    const revealButton = page.getByRole("button", {
      name: /REVEAL PRICE/i,
    });

    await revealButton.waitFor({
      state: "visible",
      timeout: 10000,
    });

    console.log("💰 Reveal Price button found");

    // ==================================================
    // MOUSE INTERACTION
    // ==================================================

    const box = await priceArea.boundingBox();

    if (!box) {
      throw new Error("Could not find price area position");
    }

    console.log("📍 Price area position:", box);

    const centerX = box.x + box.width / 2;

    const centerY = box.y + box.height / 2;

    console.log("🖱️ Starting mouse interaction...");

    await page.mouse.move(box.x, box.y);

    await page.mouse.move(box.x + box.width * 0.25, centerY, {
      steps: 10,
    });

    await page.mouse.move(box.x + box.width * 0.5, centerY, {
      steps: 10,
    });

    await page.mouse.move(box.x + box.width * 0.75, centerY, {
      steps: 10,
    });

    await page.mouse.move(centerX, centerY, {
      steps: 10,
    });

    console.log("🖱️ Mouse sweep completed");

    // ==================================================
    // WAIT FOR REVEAL BUTTON
    // ==================================================

    let buttonEnabled = false;

    const revealStart = Date.now();

    while (Date.now() - revealStart < 20000) {
      // Cookie popup can appear at ANY time
      await handleCookies(page);

      // Keep interacting with price area
      await page.mouse.move(centerX, centerY, {
        steps: 3,
      });

      const disabled = await revealButton.isDisabled().catch(() => true);

      if (!disabled) {
        buttonEnabled = true;

        console.log("✅ Reveal Price button enabled");

        break;
      }

      console.log("⏳ Reveal Price still disabled...");

      await page.waitForTimeout(500);
    }

    if (!buttonEnabled) {
      throw new Error("Reveal Price button never became enabled");
    }

    // ==================================================
    // CLICK REVEAL
    // ==================================================

    console.log("🍪 Final cookie check before Reveal...");
    await handleCookies(page);

    console.log("🖱️ Clicking Reveal Price...");

    await revealButton.scrollIntoViewIfNeeded().catch(() => {});

    await revealButton.click({
      force: true,
      timeout: 5000,
    });

    console.log("🖱️ Reveal Price clicked successfully");

    await page.waitForTimeout(1000);

    await handleCookies(page);

    await revealButton.scrollIntoViewIfNeeded().catch(() => {});

    await revealButton.click({
      force: true,
      timeout: 5000,
    });

    console.log("🖱️ Reveal Price clicked successfully");

    await page.waitForTimeout(1000);

    await handleCookies(page);

    // ==================================================
    // REAL ATTEMPTS
    // ==================================================

    while (attempt < MAX_ATTEMPTS) {
      attempt++;

      console.log("\n=================================");
      console.log(`🔄 ATTEMPT ${attempt}/${MAX_ATTEMPTS}`);
      console.log("📄 SAME browser + SAME page");
      console.log("=================================");

      const result = await waitForResult(page);

      // ==================================================
      // SUCCESS
      // ==================================================

      if (result.state === "success") {
        const price = result.price;

        console.log("\n💰 FINAL PRICE:", price);

        const stock = await extractStock(page);

        if (stock === null || !Number.isFinite(stock) || stock < 0) {
          console.log("❌ Invalid stock");

          await saveScrapeLog({
            startedAt,
            finishedAt: new Date().toISOString(),
            status: "failed",
            attempts: attempt,
            price,
            stock: null,
            errorMessage: "Invalid stock",
          });

          return {
            success: false,
            price: null,
            stock: null,
          };
        }

        console.log("\n🎉 SCRAPING SUCCESSFUL");

        console.log("💰 Price:", price);

        console.log("📦 Stock:", stock);

        console.log("🛑 NO MORE ATTEMPTS");

        await savePriceHistory(price, stock);

        await saveScrapeLog({
          startedAt,
          finishedAt: new Date().toISOString(),
          status: "success",
          attempts: attempt,
          price,
          stock,
        });

        return {
          success: true,
          price,
          stock,
        };
      }

      // ==================================================
      // TRY AGAIN
      // ==================================================

      if (result.state === "retry") {
        console.log("🔁 TRY AGAIN detected");

        // IMPORTANT:
        // Before clicking retry,
        // check price ONE MORE TIME.

        const finalPrice = await extractPrice(page);

        if (finalPrice !== null && finalPrice > 0) {
          console.log("🎯 Price appeared just before retry!");

          const stock = await extractStock(page);

          if (stock !== null && Number.isFinite(stock) && stock >= 0) {
            await savePriceHistory(finalPrice, stock);

            await saveScrapeLog({
              startedAt,
              finishedAt: new Date().toISOString(),
              status: "success",
              attempts: attempt,
              price: finalPrice,
              stock,
            });
          }

          return {
            success: true,
            price: finalPrice,
            stock,
          };
        }

        const retryButton = page.getByRole("button", {
          name: /TRY AGAIN/i,
        });

        console.log("🖱️ Clicking TRY AGAIN...");

        await handleCookies(page);

        await retryButton.click({ force: true });

        await page.waitForTimeout(500);

        console.log(`➡️ Starting NEW attempt: ${attempt + 1}`);

        continue;
      }

      // ==================================================
      // TIMEOUT
      // ==================================================

      if (result.state === "timeout") {
        console.log("⏰ Current attempt timed out");

        const finalPrice = await extractPrice(page);

        if (finalPrice !== null && finalPrice > 0) {
          console.log("🎯 Price appeared during timeout!");

          const stock = await extractStock(page);

          if (stock !== null && Number.isFinite(stock) && stock >= 0) {
            await savePriceHistory(finalPrice, stock);

            await saveScrapeLog({
              startedAt,
              finishedAt: new Date().toISOString(),
              status: "success",
              attempts: attempt,
              price: finalPrice,
              stock,
            });
          }

          return {
            success: true,
            price: finalPrice,
            stock,
          };
        }

        const retryVisible = await isTryAgainVisible(page);

        if (retryVisible) {
          console.log("🔁 TRY AGAIN appeared after timeout");

          const retryButton = page.getByRole("button", {
            name: /TRY AGAIN/i,
          });

          await handleCookies(page);

          await retryButton.click({ force: true });

          await page.waitForTimeout(500);

          continue;
        }

        console.log("⚠️ No price and no TRY AGAIN");

        continue;
      }
    }

    console.log("\n❌ ALL ATTEMPTS FAILED");

    await saveScrapeLog({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      attempts: attempt,
      price: null,
      stock: null,
      errorMessage: "All scraping attempts failed",
    });

    return {
      success: false,
      price: null,
      stock: null,
    };
  } catch (error) {
    console.log("\n💥 SCRAPER ERROR:", error.message);

    await saveScrapeLog({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      attempts: attempt,
      price: null,
      stock: null,
      errorMessage: error.message,
    });

    return {
      success: false,
      price: null,
      stock: null,
      error: error.message,
    };
  } finally {
    console.log("\n🔴 SCRAPER FINISHED");

    console.log("🔴 Closing browser ONCE...");

    await browser.close();

    console.log("🔴 Browser closed");
  }
}

scrape();
