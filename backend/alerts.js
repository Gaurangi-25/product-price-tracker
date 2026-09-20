const supabase = require("./supabase");

// In-memory store for instant in-app alerts (with optional Supabase persistence)
let recentAlerts = [];
let domHealthState = {
  status: "stable",
  checkedAt: new Date().toISOString(),
  selectorsFound: 5,
  totalSelectors: 5,
  details: "All target store DOM selectors verified",
};

/**
 * Sends email alert via SendGrid v3 API if configured
 */
async function sendSendGridAlert(alert) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const toEmail = process.env.ALERT_EMAIL || process.env.ALERT_TO_EMAIL;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || "alerts@product-tracker.internal";

  if (!apiKey || !toEmail) {
    console.log(`ℹ️ In-app alert recorded: [${alert.type.toUpperCase()}] Product ${alert.productId}. (SendGrid email skipped: SENDGRID_API_KEY not configured)`);
    return;
  }

  const subject =
    alert.type === "price_drop"
      ? `📉 Price Drop Alert: ${alert.productName} dropped to ₹${alert.newPrice.toLocaleString("en-IN")} (-${alert.percentDrop}%)`
      : `🟢 Back in Stock: ${alert.productName} is now available (${alert.newStock} units left)!`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: ${alert.type === "price_drop" ? "#16a34a" : "#2563eb"};">
        ${alert.type === "price_drop" ? "📉 Price Drop Detected!" : "🟢 Back In Stock!"}
      </h2>
      <p style="font-size: 16px; color: #334155;">
        Good news! We noticed a change for <strong>${alert.productName}</strong>.
      </p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
        ${
          alert.type === "price_drop"
            ? `
          <p style="margin: 0; font-size: 18px;">
            <strong>New Price:</strong> <span style="color: #16a34a; font-weight: bold;">₹${alert.newPrice.toLocaleString("en-IN")}</span>
            <span style="text-decoration: line-through; color: #94a3b8; margin-left: 8px;">₹${alert.oldPrice.toLocaleString("en-IN")}</span>
            <span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-size: 14px; margin-left: 8px;">-${alert.percentDrop}% OFF</span>
          </p>
        `
            : `
          <p style="margin: 0; font-size: 18px;">
            <strong>Stock Quantity:</strong> <span style="color: #2563eb; font-weight: bold;">${alert.newStock} units available</span>
          </p>
        `
        }
      </div>
      <p style="font-size: 14px; color: #64748b;">
        Target Product ID: ${alert.productId}<br/>
        Detected At: ${new Date(alert.timestamp).toLocaleString("en-IN")}
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: "Product Price Tracker" },
        subject,
        content: [{ type: "text/html", value: htmlContent }],
      }),
    });

    if (res.ok) {
      console.log(`✉️ SendGrid email alert sent to ${toEmail} for product ${alert.productId}`);
    } else {
      const errText = await res.text();
      console.warn("⚠️ SendGrid email response error:", errText);
    }
  } catch (err) {
    console.warn("⚠️ Failed to send SendGrid email:", err.message);
  }
}

/**
 * Compares new scraped price/stock with previous entries and generates alerts
 */
async function evaluateAndRecordAlerts({ productId, productName, newPrice, newStock }) {
  try {
    let resolvedName = (productName || "").trim();
    if (!resolvedName || /^product\s+\d+$/i.test(resolvedName)) {
      const { data: tp } = await supabase
        .from("tracked_products")
        .select("product_name")
        .eq("product_id", String(productId))
        .single();
      if (tp && tp.product_name && !/^product\s+\d+$/i.test(tp.product_name.trim())) {
        resolvedName = tp.product_name.trim();
      }
    }
    if (!resolvedName) {
      resolvedName = `Product ${productId}`;
    }

    // Fetch last 2 price history entries to see the change
    const { data: history, error } = await supabase
      .from("price_history")
      .select("price, stock, scraped_at")
      .eq("product_id", String(productId))
      .order("scraped_at", { ascending: false })
      .limit(3);

    if (error || !history || history.length < 2) {
      return []; // Initial scrape or not enough history yet
    }

    const currentEntry = history[0];
    const previousEntry = history[1];

    const currentPrice = Number(newPrice || currentEntry.price);
    const prevPrice = Number(previousEntry.price);
    const currentStock = Number(newStock ?? currentEntry.stock);
    const prevStock = Number(previousEntry.stock);

    const generatedAlerts = [];

    // 1. Detect Price Drop
    if (currentPrice < prevPrice) {
      const diff = prevPrice - currentPrice;
      const percentDrop = Math.round((diff / prevPrice) * 100);

      const alert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: "price_drop",
        productId: String(productId),
        productName: resolvedName,
        oldPrice: prevPrice,
        newPrice: currentPrice,
        diff,
        percentDrop,
        stock: currentStock,
        timestamp: new Date().toISOString(),
        read: false,
      };

      generatedAlerts.push(alert);
      recentAlerts.unshift(alert);
      sendSendGridAlert(alert);
    }

    // 2. Detect Back In Stock
    if (prevStock === 0 && currentStock > 0) {
      const alert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: "back_in_stock",
        productId: String(productId),
        productName: resolvedName,
        oldStock: prevStock,
        newStock: currentStock,
        price: currentPrice,
        timestamp: new Date().toISOString(),
        read: false,
      };

      generatedAlerts.push(alert);
      recentAlerts.unshift(alert);
      sendSendGridAlert(alert);
    }

    // Keep max 50 recent alerts in memory
    if (recentAlerts.length > 50) {
      recentAlerts = recentAlerts.slice(0, 50);
    }

    return generatedAlerts;
  } catch (err) {
    console.warn("⚠️ Alert evaluation notice:", err.message);
    return [];
  }
}

/**
 * Returns all active alerts with computed alerts from history if empty
 */
async function getAlerts() {
  if (recentAlerts.length > 0) {
    return recentAlerts;
  }

  // Pre-seed from price_history if in-memory list was cleared on server restart
  try {
    const [{ data: rows }, { data: tracked }] = await Promise.all([
      supabase
        .from("price_history")
        .select("product_id, price, stock, scraped_at")
        .order("scraped_at", { ascending: false })
        .limit(100),
      supabase
        .from("tracked_products")
        .select("product_id, product_name"),
    ]);

    const productNameMap = {};
    if (tracked && Array.isArray(tracked)) {
      tracked.forEach((t) => {
        if (t.product_name && !/^product\s+\d+$/i.test(t.product_name.trim())) {
          productNameMap[String(t.product_id)] = t.product_name.trim();
        }
      });
    }

    if (rows && rows.length > 1) {
      // Group by product_id
      const byProduct = {};
      rows.forEach((r) => {
        if (!byProduct[r.product_id]) byProduct[r.product_id] = [];
        byProduct[r.product_id].push(r);
      });

      Object.entries(byProduct).forEach(([pid, entries]) => {
        if (entries.length >= 2) {
          const cur = entries[0];
          const prev = entries[1];
          const curP = Number(cur.price);
          const prevP = Number(prev.price);
          const pName = productNameMap[String(pid)] || `Product ${pid}`;

          if (curP < prevP) {
            recentAlerts.push({
              id: `alert-seed-${pid}-${Date.now()}`,
              type: "price_drop",
              productId: pid,
              productName: pName,
              oldPrice: prevP,
              newPrice: curP,
              diff: prevP - curP,
              percentDrop: Math.round(((prevP - curP) / prevP) * 100),
              stock: cur.stock,
              timestamp: cur.scraped_at,
              read: false,
            });
          }
          if (Number(prev.stock) === 0 && Number(cur.stock) > 0) {
            recentAlerts.push({
              id: `alert-seed-stock-${pid}-${Date.now()}`,
              type: "back_in_stock",
              productId: pid,
              productName: pName,
              oldStock: prev.stock,
              newStock: cur.stock,
              price: curP,
              timestamp: cur.scraped_at,
              read: false,
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn("⚠️ Alert seed skipped:", err.message);
  }

  return recentAlerts;
}

function markAlertsRead() {
  recentAlerts.forEach((a) => {
    a.read = true;
  });
  return { success: true, count: recentAlerts.length };
}

/**
 * Record and get DOM health state
 */
function recordDomHealth(auditResult) {
  domHealthState = {
    ...auditResult,
    checkedAt: new Date().toISOString(),
  };
}

function getSystemHealth() {
  return {
    status: domHealthState.status === "stable" ? "healthy" : "warning",
    domHealth: domHealthState,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

module.exports = {
  evaluateAndRecordAlerts,
  getAlerts,
  markAlertsRead,
  recordDomHealth,
  getSystemHealth,
};
