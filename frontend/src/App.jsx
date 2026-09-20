import { useEffect, useState, useRef, useCallback } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ============================================================================
// INTERACTIVE PRICE CHANGE CHART (Native SVG, zero external dependencies)
// ============================================================================
function PriceChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="chart-empty">
        No price history recorded yet. Trigger a scrape to record initial data.
      </div>
    );
  }

  // Sort chronological (oldest to newest)
  const sorted = [...history].sort(
    (a, b) => new Date(a.scraped_at) - new Date(b.scraped_at)
  );

  const prices = sorted.map((h) => Number(h.price));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const currentPrice = prices[prices.length - 1];

  // Single data point view
  if (sorted.length === 1) {
    const item = sorted[0];
    return (
      <div className="chart-single-container">
        <div className="chart-stats-summary">
          <div className="chart-stat-item">
            <span className="stat-label">Current Price</span>
            <span className="stat-value">₹{Number(item.price).toLocaleString("en-IN")}</span>
          </div>
          <div className="chart-stat-item">
            <span className="stat-label">Stock Status</span>
            <span className="stat-value">
              {item.stock > 0 ? `${item.stock} in stock` : "Out of stock"}
            </span>
          </div>
          <div className="chart-stat-item">
            <span className="stat-label">Initial Scrape</span>
            <span className="stat-value">
              {new Date(item.scraped_at).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <div className="chart-single-note">
          <span className="single-dot"></span>
          <span>
            Initial price recorded at ₹{Number(item.price).toLocaleString("en-IN")}. Scheduled checks and manual scrapes will plot price changes over time.
          </span>
        </div>
      </div>
    );
  }

  // Multi-point SVG chart dimensions
  const svgWidth = 620;
  const svgHeight = 210;
  const pad = { top: 25, right: 35, bottom: 35, left: 65 };

  const chartWidth = svgWidth - pad.left - pad.right;
  const chartHeight = svgHeight - pad.top - pad.bottom;

  const priceDiff = maxPrice === minPrice ? 100 : maxPrice - minPrice;
  const yMin = Math.max(0, minPrice - priceDiff * 0.12);
  const yMax = maxPrice + priceDiff * 0.12;
  const ySpan = yMax - yMin;

  const coords = sorted.map((d, idx) => {
    const x = pad.left + (idx / (sorted.length - 1)) * chartWidth;
    const y = pad.top + chartHeight - ((Number(d.price) - yMin) / ySpan) * chartHeight;
    return { x, y, data: d };
  });

  const linePath = coords.reduce(
    (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
    ""
  );

  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(pad.top + chartHeight).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(pad.top + chartHeight).toFixed(1)} Z`;

  // Grid levels
  const gridLevels = [
    { price: yMin, y: pad.top + chartHeight },
    { price: yMin + ySpan * 0.5, y: pad.top + chartHeight * 0.5 },
    { price: yMax, y: pad.top },
  ];

  return (
    <div className="price-chart-box">
      <div className="chart-stats-summary">
        <div className="chart-stat-item">
          <span className="stat-label">Current</span>
          <span className="stat-value">₹{currentPrice.toLocaleString("en-IN")}</span>
        </div>
        <div className="chart-stat-item">
          <span className="stat-label">Lowest</span>
          <span className="stat-value stat-low">₹{minPrice.toLocaleString("en-IN")}</span>
        </div>
        <div className="chart-stat-item">
          <span className="stat-label">Highest</span>
          <span className="stat-value stat-high">₹{maxPrice.toLocaleString("en-IN")}</span>
        </div>
        <div className="chart-stat-item">
          <span className="stat-label">Total Checks</span>
          <span className="stat-value">{sorted.length} records</span>
        </div>
      </div>

      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="svg-graph"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="priceGraphGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Reference gridlines */}
          {gridLevels.map((g, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                y1={g.y}
                x2={svgWidth - pad.right}
                y2={g.y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text
                x={pad.left - 10}
                y={g.y + 4}
                textAnchor="end"
                className="axis-price-label"
              >
                ₹{Math.round(g.price).toLocaleString("en-IN")}
              </text>
            </g>
          ))}

          {/* Gradient area under line */}
          <path d={areaPath} fill="url(#priceGraphGrad)" />

          {/* Connected Price Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Plot Points */}
          {coords.map((pt, i) => (
            <g key={i} className="plot-point-group">
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth="2.5"
              />
              <title>
                {`₹${Number(pt.data.price).toLocaleString("en-IN")} (Stock: ${pt.data.stock}) on ${new Date(pt.data.scraped_at).toLocaleString("en-IN")}`}
              </title>
            </g>
          ))}

          {/* X Axis Time Boundaries */}
          <text
            x={pad.left}
            y={svgHeight - 10}
            textAnchor="start"
            className="axis-time-label"
          >
            {new Date(sorted[0].scraped_at).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
            })}
          </text>
          <text
            x={svgWidth - pad.right}
            y={svgHeight - 10}
            textAnchor="end"
            className="axis-time-label"
          >
            {new Date(sorted[sorted.length - 1].scraped_at).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </text>
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Modal inspection state
  const [modalProduct, setModalProduct] = useState(null); // product object
  const [modalTab, setModalTab] = useState("history"); // 'history' | 'logs' | 'specs'

  // Extension features states
  const [alerts, setAlerts] = useState([]);
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [systemHealth, setSystemHealth] = useState({
    status: "healthy",
    domHealth: { status: "stable", details: "All store structure anchors intact" },
  });
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'in_stock' | 'out_of_stock' | 'price_drop'
  const [sortBy, setSortBy] = useState("recent"); // 'recent' | 'discount' | 'price_asc' | 'price_desc' | 'name'
  const [productDetails, setProductDetails] = useState({}); // { [productId]: detailsData }
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Cancellation and debounce refs
  const searchAbortControllerRef = useRef(null);
  const searchDebounceTimerRef = useRef(null);
  const activeQueryRef = useRef("");

  // Per-product state
  const [productHistory, setProductHistory] = useState({});
  const [productLogs, setProductLogs] = useState({});
  const [scrapingStatus, setScrapingStatus] = useState({}); // { [productId]: boolean }
  const [notification, setNotification] = useState(null);

  const showNotification = (text, type = "info") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setModalProduct(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Cleanup search refs on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    };
  }, []);

  // ----------------------------------------------------
  // DATA FETCHING
  // ----------------------------------------------------

  const loadProductHistory = useCallback(async (productId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/products/${productId}/history`
      );
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setProductHistory((prev) => ({ ...prev, [productId]: data }));
        return data;
      }
      return [];
    } catch (error) {
      console.error(`Failed to load history for ${productId}:`, error);
      return [];
    }
  }, []);

  const loadProductLogs = useCallback(async (productId) => {
    try {
      const response = await fetch(`${API_URL}/api/products/${productId}/logs`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setProductLogs((prev) => ({ ...prev, [productId]: data }));
        return data;
      }
      return [];
    } catch (error) {
      console.error(`Failed to load logs for ${productId}:`, error);
      return [];
    }
  }, []);

  const loadTrackedProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const response = await fetch(`${API_URL}/api/products`);
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        const withSavedFreq = data.map((p) => {
          let freq = p.scrape_interval_minutes;
          try {
            const saved = localStorage.getItem(`scrape_freq_${p.product_id}`);
            if (saved) freq = parseInt(saved, 10);
          } catch (_) {}
          return {
            ...p,
            scrape_interval_minutes: freq || 120,
          };
        });
        setTrackedProducts(withSavedFreq);
        data.forEach((p) => {
          loadProductHistory(p.product_id);
          loadProductLogs(p.product_id);
        });
      }
    } catch (error) {
      console.error("Failed to load tracked products:", error);
      showNotification("Failed to load tracked products from server", "error");
    } finally {
      setLoadingProducts(false);
    }
  }, [loadProductHistory, loadProductLogs]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("Alerts fetch notice:", e.message);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/health`);
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (e) {
      console.warn("Health check notice:", e.message);
    }
  }, []);

  const markAllAlertsRead = async () => {
    try {
      await fetch(`${API_URL}/api/alerts/mark-read`, { method: "POST" });
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch (e) {
      console.warn("Mark alerts read notice:", e.message);
    }
  };

  const handleFrequencyChange = async (productId, interval) => {
    const mins = parseInt(interval, 10) || 120;

    // 1. Instant optimistic UI update (never sticks or jumps back)
    setTrackedProducts((prev) =>
      prev.map((p) =>
        String(p.product_id) === String(productId)
          ? { ...p, scrape_interval_minutes: mins }
          : p,
      ),
    );

    // 2. Persist locally in browser storage immediately
    try {
      localStorage.setItem(`scrape_freq_${productId}`, String(mins));
    } catch (_) {}

    const label = mins < 60 ? `${mins}m` : `${mins / 60}h`;
    showNotification(`Scrape frequency updated to every ${label}`, "info");

    // 3. Sync to backend API in background
    try {
      await fetch(`${API_URL}/api/products/${productId}/frequency`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: mins }),
      });
    } catch (err) {
      console.warn("Backend frequency sync notice:", err.message);
    }
  };

  const loadProductDetails = useCallback(
    async (productId, force = false) => {
      if (!force && productDetails[productId]) return;
      try {
        setLoadingDetails(true);
        const res = await fetch(`${API_URL}/api/products/${productId}/details`);
        if (res.ok) {
          const data = await res.json();
          setProductDetails((prev) => ({ ...prev, [productId]: data }));
          if (data && data.name) {
            setModalProduct((prev) => {
              if (
                prev &&
                String(prev.product_id) === String(productId) &&
                (!prev.product_name || /^product\s+\d+$/i.test(prev.product_name))
              ) {
                return { ...prev, product_name: data.name };
              }
              return prev;
            });
            setTrackedProducts((prev) =>
              prev.map((p) =>
                String(p.product_id) === String(productId) &&
                (!p.product_name || /^product\s+\d+$/i.test(p.product_name))
                  ? { ...p, product_name: data.name }
                  : p
              )
            );
          }
        }
      } catch (err) {
        console.error("Failed to load product details:", err);
      } finally {
        setLoadingDetails(false);
      }
    },
    [productDetails],
  );

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const response = await fetch(`${API_URL}/api/products`);
        const data = await response.json();
        if (!ignore && response.ok && Array.isArray(data)) {
          const withSavedFreq = data.map((p) => {
            let freq = p.scrape_interval_minutes;
            try {
              const saved = localStorage.getItem(`scrape_freq_${p.product_id}`);
              if (saved) freq = parseInt(saved, 10);
            } catch (_) {}
            return {
              ...p,
              scrape_interval_minutes: freq || 120,
            };
          });
          setTrackedProducts(withSavedFreq);
          data.forEach((p) => {
            loadProductHistory(p.product_id);
            loadProductLogs(p.product_id);
          });
        }
      } catch (err) {
        console.error("Failed to load tracked products:", err);
      } finally {
        if (!ignore) setLoadingProducts(false);
      }
      loadAlerts();
      loadHealth();
    }
    init();
    return () => {
      ignore = true;
    };
  }, [loadProductHistory, loadProductLogs, loadAlerts, loadHealth]);

  // ----------------------------------------------------
  // DYNAMIC SEARCH ACTIONS
  // ----------------------------------------------------

  const executeSearch = useCallback(async (targetQuery) => {
    const trimmed = (targetQuery || "").trim();

    if (!trimmed) {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
        searchAbortControllerRef.current = null;
      }
      activeQueryRef.current = "";
      setResults([]);
      setSearching(false);
      setHasSearched(false);
      return;
    }

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    activeQueryRef.current = trimmed;

    setSearching(true);
    setHasSearched(true);

    try {
      const response = await fetch(
        `${API_URL}/api/search?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      );
      const data = await response.json();

      if (activeQueryRef.current === trimmed) {
        if (response.ok && Array.isArray(data)) {
          setResults(data);
          // Pre-load history/logs for any search results that are already tracked
          data.forEach((item) => {
            const isTracked = trackedProducts.some(
              (p) => String(p.product_id) === String(item.product_id)
            );
            if (isTracked) {
              loadProductHistory(item.product_id);
              loadProductLogs(item.product_id);
            }
          });
        } else {
          setResults([]);
          showNotification(data.error || "Search request failed", "error");
        }
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Search error:", error);
      if (activeQueryRef.current === trimmed) {
        showNotification("Could not reach search endpoint.", "error");
        setResults([]);
      }
    } finally {
      if (activeQueryRef.current === trimmed) {
        setSearching(false);
      }
    }
  }, [trackedProducts, loadProductHistory, loadProductLogs]);

  const handleQueryChange = (val) => {
    setQuery(val);

    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (!trimmed) {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
        searchAbortControllerRef.current = null;
      }
      activeQueryRef.current = "";
      setResults([]);
      setSearching(false);
      setHasSearched(false);
      return;
    }

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }

    searchDebounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 350);
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }
    executeSearch(query);
  };

  const handleClearSearch = () => {
    setQuery("");
    handleQueryChange("");
  };

  // ----------------------------------------------------
  // PRODUCT TRACKING & SCRAPING
  // ----------------------------------------------------

  const trackProduct = async (product) => {
    try {
      const response = await fetch(`${API_URL}/api/products/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      const data = await response.json();
      if (response.ok) {
        showNotification(`Tracking "${product.product_name}". Fetching initial price...`, "info");
        await loadTrackedProducts();
        handleScrapeNow(product.product_id);
      } else {
        showNotification(data.error || "Failed to track product", "error");
      }
    } catch (error) {
      console.error("Tracking failed:", error);
      showNotification("Network error while adding product to tracking list.", "error");
    }
  };

  const handleScrapeNow = async (productId) => {
    try {
      setScrapingStatus((prev) => ({ ...prev, [productId]: true }));
      showNotification(`Scraper running for product ${productId}...`, "info");

      const response = await fetch(`${API_URL}/api/scrape/${productId}`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        showNotification(data.error || `Scraping failed for product ${productId}`, "error");
        await loadProductLogs(productId);
      } else {
        showNotification(`Updated latest data for product ${productId}!`, "success");
        await loadProductHistory(productId);
        await loadProductLogs(productId);
        await loadTrackedProducts();
        await loadAlerts();
      }
    } catch (error) {
      console.error("Scrape trigger failed:", error);
      showNotification("Could not complete scraper process.", "error");
    } finally {
      setScrapingStatus((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const openProductModal = (product, tab = "history") => {
    setModalProduct(product);
    setModalTab(tab);
    loadProductHistory(product.product_id);
    loadProductLogs(product.product_id);
    if (tab === "specs") {
      loadProductDetails(product.product_id);
    }
  };

  // ----------------------------------------------------
  // DASHBOARD SUMMARY METRICS & CROSS-CATALOG KPIS
  // ----------------------------------------------------
  const totalTracked = trackedProducts.length;
  let inStockCount = 0;
  let outOfStockCount = 0;
  let latestSyncTime = null;
  let activePriceDropsCount = 0;
  let maxDiscountPercent = 0;

  trackedProducts.forEach((p) => {
    const history = productHistory[p.product_id] || [];
    if (history.length > 0) {
      const latest = history[history.length - 1];
      if (latest.stock > 0) {
        inStockCount++;
      } else {
        outOfStockCount++;
      }
      const syncDate = new Date(latest.scraped_at);
      if (!latestSyncTime || syncDate > latestSyncTime) {
        latestSyncTime = syncDate;
      }

      // Check price drop vs history peak or previous entry
      const prices = history
        .map((h) => Number(h.price))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (prices.length >= 2) {
        const highestPrice = Math.max(...prices);
        const currentP = prices[prices.length - 1];
        if (currentP < highestPrice) {
          activePriceDropsCount++;
          const discountPct = Math.round(
            ((highestPrice - currentP) / highestPrice) * 100,
          );
          if (discountPct > maxDiscountPercent) {
            maxDiscountPercent = discountPct;
          }
        }
      }
    }
  });

  const lastSyncFormatted = latestSyncTime
    ? latestSyncTime.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "Never";

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------

  return (
    <div className="dashboard-container">
      {/* Header with Dashboard Summary & Extension Actions */}
      <header className="dashboard-header">
        <div className="header-top-row">
          <h1>Product Price Tracker</h1>

          <div className="header-actions-group">
            {/* System / Store DOM Health Badge */}
            <div
              className={`health-pill ${systemHealth.status}`}
              title={
                systemHealth.domHealth?.details ||
                "Store structure selectors intact"
              }
            >
              <span className="health-dot"></span>
              <span>
                {systemHealth.domHealth?.status === "stable"
                  ? "Store DOM Stable"
                  : "DOM Drift Detected"}
              </span>
            </div>

            {/* In-App Alerts Bell Button */}
            <button
              className={`alerts-bell-btn ${showAlertsDrawer ? "active" : ""}`}
              onClick={() => setShowAlertsDrawer((prev) => !prev)}
              title="View Price Drop & Restock Alerts"
              aria-label="Alerts"
            >
              <svg
                className="bell-icon"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              {unreadAlertsCount > 0 && (
                <span className="alerts-badge">
                  <span className="alerts-badge-ping"></span>
                  <span className="alerts-badge-count">{unreadAlertsCount}</span>
                </span>
              )}
            </button>

            {/* Alerts Dropdown Drawer */}
            {showAlertsDrawer && (
              <div className="alerts-dropdown">
                <div className="alerts-header">
                  <div className="alerts-header-title">
                    <h4>Activity & Price Alerts</h4>
                    <span className="alerts-count-chip">{alerts.length}</span>
                  </div>
                  {unreadAlertsCount > 0 && (
                    <button className="btn-mark-all-read" onClick={markAllAlertsRead}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>Mark all read</span>
                    </button>
                  )}
                </div>

                <div className="alerts-list">
                  {alerts.length === 0 ? (
                    <div className="alerts-empty">
                      No alerts triggered yet. Price drops and restocks will
                      appear here.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        className={`alert-item ${!alert.read ? "unread" : ""}`}
                        key={alert.id}
                      >
                        <div className="alert-item-header">
                          <span className={`alert-tag ${alert.type}`}>
                            {alert.type === "price_drop"
                              ? `📉 Price Drop -${alert.percentDrop}%`
                              : "🟢 Back In Stock"}
                          </span>
                          <span className="alert-time">
                            {new Date(alert.timestamp).toLocaleTimeString(
                              "en-IN",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        <div className="alert-product-title">
                          {alert.productName}
                        </div>
                        <div className="alert-item-body">
                          {alert.type === "price_drop" ? (
                            <>
                              Now{" "}
                              <span className="alert-new-price">
                                ₹{Number(alert.newPrice).toLocaleString("en-IN")}
                              </span>
                              <span className="alert-old-price">
                                ₹{Number(alert.oldPrice).toLocaleString("en-IN")}
                              </span>
                            </>
                          ) : (
                            <span>{alert.newStock} units available in store</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Summary KPIs */}
        <div className="dashboard-summary-bar">
          <div className="summary-metric">
            <span className="summary-value">{totalTracked}</span>
            <span className="summary-label">Tracked Products</span>
          </div>
          <span className="summary-divider">•</span>
          <div className="summary-metric">
            <span className="summary-value in-stock">{inStockCount}</span>
            <span className="summary-label">In Stock</span>
          </div>
          <span className="summary-divider">•</span>
          <div className="summary-metric">
            <span className="summary-value out-stock">{outOfStockCount}</span>
            <span className="summary-label">Out of Stock</span>
          </div>
          <span className="summary-divider">•</span>
          <div className="summary-metric">
            <span className="summary-value green">{activePriceDropsCount}</span>
            <span className="summary-label">Active Price Drops</span>
          </div>
          <span className="summary-divider">•</span>
          <div className="summary-metric">
            <span className="summary-label">Last Sync:</span>
            <span className="summary-value sync-time">{lastSyncFormatted}</span>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className={`notification-banner ${notification.type}`}>
          {notification.text}
        </div>
      )}

      {/* Search Section */}
      <section className="dashboard-section search-section">
        <div className="section-header-row">
          <h2>Search Mock Store</h2>
          {searching && <span className="search-live-badge">Searching...</span>}
        </div>

        <form className="search-form" onSubmit={handleSearchSubmit}>
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Type to search dynamically (e.g. air fryer, watch, skillet)..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit(e)}
            />
            {query && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="search-clear-btn"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="btn-search-submit"
          >
            {searching ? (
              <>
                <span className="btn-spinner"></span>
                <span>Searching...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>Search</span>
              </>
            )}
          </button>
        </form>

        {/* Search Results (3-4 Cards in a Row) */}
        {results.length > 0 && (
          <div className="search-results-box">
            <h3>Search Results ({results.length})</h3>
            <div className="cards-grid">
              {results.map((product) => {
                const isAlreadyTracked = trackedProducts.some(
                  (p) => String(p.product_id) === String(product.product_id)
                );
                const history = productHistory[product.product_id] || [];
                const logs = productLogs[product.product_id] || [];
                const latest = history.length > 0 ? history[history.length - 1] : null;
                const effectivePrice = latest?.price ?? product.price ?? null;
                const effectiveStock = latest?.stock ?? product.stock ?? null;
                const isScraping = !!scrapingStatus[product.product_id];

                return (
                  <div className="product-card" key={product.product_id}>
                    {/* Top: ID & Store Link */}
                    <div className="card-top">
                      <div className="card-tag-row">
                        <span className="product-id-tag">ID: {product.product_id}</span>
                        <div className="card-tags-right">
                          {isAlreadyTracked && (
                            <span className="badge badge-tracked">Tracked</span>
                          )}
                          <a
                            href={product.product_url}
                            target="_blank"
                            rel="noreferrer"
                            className="external-link"
                            title="View on store"
                          >
                            Store ↗
                          </a>
                        </div>
                      </div>
                      <h4 className="card-title" title={product.product_name}>
                        {product.product_name}
                      </h4>
                      <div className="card-subtitle-row">
                        {product.brand && <span>{product.brand}</span>}
                        {product.brand && product.category && <span className="bullet">·</span>}
                        {product.category && <span className="product-cat-text">{product.category}</span>}
                      </div>
                    </div>

                    {/* Middle: Price & Stock metrics */}
                    <div className="card-body-section">
                      {effectivePrice !== null && effectivePrice !== undefined ? (
                        <div className="card-price-row">
                          <div className="card-price-block">
                            <span className="metric-label">Current Price</span>
                            <span className="metric-value price-text">
                              ₹{Number(effectivePrice).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="card-stock-block">
                            <span className="metric-label">Stock Status</span>
                            {effectiveStock !== null && effectiveStock !== undefined ? (
                              effectiveStock > 0 ? (
                                <span className="badge badge-success">
                                  In Stock ({effectiveStock})
                                </span>
                              ) : (
                                <span className="badge badge-danger">Out of Stock</span>
                              )
                            ) : (
                              <span className="badge badge-neutral">Scraped</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="card-price-row">
                          <div className="card-price-block">
                            <span className="metric-label">Price</span>
                            <span className="metric-value price-text text-muted">—</span>
                          </div>
                          <div className="card-stock-block">
                            <span className="metric-label">Status</span>
                            <span className="badge badge-neutral">
                              {isScraping
                                ? "Scraping..."
                                : isAlreadyTracked
                                ? "Awaiting Scrape"
                                : "Not Tracked"}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="card-last-updated">
                        {latest
                          ? `Last updated: ${new Date(latest.scraped_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : isScraping
                          ? "Scraping in progress..."
                          : isAlreadyTracked
                          ? "Awaiting initial scrape"
                          : "Not monitored yet"}
                      </div>
                    </div>

                    {/* Bottom: Action Buttons */}
                    <div className="card-actions-row">
                      {isAlreadyTracked ? (
                        <>
                          <button
                            onClick={() => handleScrapeNow(product.product_id)}
                            disabled={isScraping}
                            className="btn-card-scrape"
                            title="Scrape price & stock now"
                          >
                            {isScraping ? (
                              <>
                                <span className="btn-spinner"></span>
                                <span>Scraping...</span>
                              </>
                            ) : (
                              <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                </svg>
                                <span>Scrape Now</span>
                              </>
                            )}
                          </button>
                          <div className="card-secondary-actions">
                            <button
                              onClick={() => openProductModal(product, "history")}
                              className="btn-card-action"
                              title="View price history chart"
                            >
                              <span className="action-icon">📈</span>
                              <span>History</span>
                              {history.length > 0 && <span className="btn-badge">{history.length}</span>}
                            </button>
                            <button
                              onClick={() => openProductModal(product, "logs")}
                              className="btn-card-action"
                              title="View scraper run logs"
                            >
                              <span className="action-icon">📋</span>
                              <span>Logs</span>
                              {logs.length > 0 && <span className="btn-badge">{logs.length}</span>}
                            </button>
                            <button
                              onClick={() => openProductModal(product, "specs")}
                              className="btn-card-action btn-card-specs"
                              title="View technical specifications and reviews"
                            >
                              <span className="action-icon">✨</span>
                              <span>Specs</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => trackProduct(product)}
                          disabled={isScraping}
                          className="btn-card-track"
                        >
                          {isScraping ? (
                            <>
                              <span className="btn-spinner"></span>
                              <span>Tracking & Scraping...</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                              </svg>
                              <span>Track Product</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state when query finishes with zero results */}
        {!searching && hasSearched && query.trim() && results.length === 0 && (
          <div className="search-empty-state">
            No products found matching &ldquo;{query.trim()}&rdquo;
          </div>
        )}
      </section>

      {/* Tracked Products Section (3-4 Cards in a Row) */}
      <section className="dashboard-section">
        <div className="section-header-row">
          <div className="section-title-wrap">
            <h2>Tracked Products</h2>
            <span className="section-count-badge">{trackedProducts.length}</span>
          </div>
          <button
            onClick={loadTrackedProducts}
            className="btn-refresh-action"
            title="Refresh tracked products and latest prices"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter and Sort Toolbar */}
        <div className="tracked-controls-bar">
          <div className="filter-pills-group">
            <button
              className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              <span>All</span>
              <span className="pill-badge">{trackedProducts.length}</span>
            </button>
            <button
              className={`filter-pill filter-pill-instock ${statusFilter === "in_stock" ? "active" : ""}`}
              onClick={() => setStatusFilter("in_stock")}
            >
              <span className="pill-dot dot-green"></span>
              <span>In Stock</span>
              <span className="pill-badge">{inStockCount}</span>
            </button>
            <button
              className={`filter-pill filter-pill-outstock ${statusFilter === "out_of_stock" ? "active" : ""}`}
              onClick={() => setStatusFilter("out_of_stock")}
            >
              <span className="pill-dot dot-red"></span>
              <span>Out of Stock</span>
              <span className="pill-badge">{outOfStockCount}</span>
            </button>
            <button
              className={`filter-pill filter-pill-pricedrop ${statusFilter === "price_drop" ? "active" : ""}`}
              onClick={() => setStatusFilter("price_drop")}
            >
              <span className="pill-icon">📉</span>
              <span>Price Drops</span>
              <span className="pill-badge badge-accent">{activePriceDropsCount}</span>
            </button>
          </div>

          <div className="sort-select-wrapper">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="4"></line>
              <polyline points="21 7 18 4 15 7"></polyline>
              <line x1="6" y1="4" x2="6" y2="20"></line>
              <polyline points="3 17 6 20 9 17"></polyline>
            </svg>
            <span className="sort-label">Sort:</span>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Recently Updated</option>
              <option value="discount">Highest Discount</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name">Product Name (A-Z)</option>
            </select>
          </div>
        </div>

        {loadingProducts ? (
          <div className="empty-state">Loading tracked products...</div>
        ) : trackedProducts.length === 0 ? (
          <div className="empty-state">
            No products tracked yet. Search above to start monitoring prices.
          </div>
        ) : (
          <div className="cards-grid">
            {trackedProducts
              .filter((p) => {
                const history = productHistory[p.product_id] || [];
                const latest =
                  history.length > 0 ? history[history.length - 1] : null;
                if (statusFilter === "in_stock")
                  return latest && latest.stock > 0;
                if (statusFilter === "out_of_stock")
                  return latest && latest.stock === 0;
                if (statusFilter === "price_drop") {
                  if (history.length < 2) return false;
                  return (
                    Number(latest?.price || 0) <
                    Number(history[history.length - 2].price)
                  );
                }
                return true;
              })
              .sort((a, b) => {
                const histA = productHistory[a.product_id] || [];
                const histB = productHistory[b.product_id] || [];
                const latA = histA.length > 0 ? histA[histA.length - 1] : null;
                const latB = histB.length > 0 ? histB[histB.length - 1] : null;

                if (sortBy === "name")
                  return a.product_name.localeCompare(b.product_name);
                if (sortBy === "price_asc")
                  return (latA?.price || 0) - (latB?.price || 0);
                if (sortBy === "price_desc")
                  return (latB?.price || 0) - (latA?.price || 0);
                if (sortBy === "discount") {
                  const discA =
                    histA.length >= 2
                      ? Number(histA[histA.length - 2].price) -
                        Number(latA?.price || 0)
                      : 0;
                  const discB =
                    histB.length >= 2
                      ? Number(histB[histB.length - 2].price) -
                        Number(latB?.price || 0)
                      : 0;
                  return discB - discA;
                }
                const timeA = latA ? new Date(latA.scraped_at).getTime() : 0;
                const timeB = latB ? new Date(latB.scraped_at).getTime() : 0;
                return timeB - timeA;
              })
              .map((product) => {
                const history = productHistory[product.product_id] || [];
                const logs = productLogs[product.product_id] || [];
                const latest =
                  history.length > 0 ? history[history.length - 1] : null;
                const isScraping = !!scrapingStatus[product.product_id];

                const prices = history
                  .map((h) => Number(h.price))
                  .filter((v) => Number.isFinite(v) && v > 0);
                const minPrice = prices.length > 0 ? Math.min(...prices) : null;
                const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

                return (
                  <div className="product-card" key={product.product_id}>
                    {/* Top: ID & Store Link */}
                    <div className="card-top">
                      <div className="card-tag-row">
                        <span className="product-id-tag">
                          ID: {product.product_id}
                        </span>
                        <a
                          href={product.product_url}
                          target="_blank"
                          rel="noreferrer"
                          className="external-link"
                          title="View on store"
                        >
                          Store ↗
                        </a>
                      </div>
                      <h4 className="card-title" title={product.product_name}>
                        {product.product_name}
                      </h4>
                      <div className="card-subtitle-row">
                        {product.brand && <span>{product.brand}</span>}
                        {product.brand && product.category && (
                          <span className="bullet">·</span>
                        )}
                        {product.category && (
                          <span className="product-cat-text">
                            {product.category}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Price & Stock metrics */}
                    <div className="card-body-section">
                      {latest ? (
                        <div className="card-price-row">
                          <div className="card-price-block">
                            <span className="metric-label">Current Price</span>
                            <span className="metric-value price-text">
                              ₹{latest.price.toLocaleString("en-IN")}
                            </span>
                            {minPrice !== null &&
                              maxPrice !== null &&
                              prices.length > 1 && (
                                <div className="card-price-range">
                                  Range: ₹{minPrice.toLocaleString("en-IN")} – ₹
                                  {maxPrice.toLocaleString("en-IN")}
                                </div>
                              )}
                          </div>
                          <div className="card-stock-block">
                            <span className="metric-label">Stock Status</span>
                            {latest.stock > 0 ? (
                              <span className="badge badge-success">
                                In Stock ({latest.stock})
                              </span>
                            ) : (
                              <span className="badge badge-danger">
                                Out of Stock
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="card-price-row">
                          <div className="card-price-block">
                            <span className="metric-label">Current Price</span>
                            <span className="metric-value price-text text-muted">
                              —
                            </span>
                          </div>
                          <div className="card-stock-block">
                            <span className="metric-label">Status</span>
                            <span className="badge badge-neutral">
                              {isScraping
                                ? "Scraping..."
                                : "Pending initial scrape"}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="card-last-updated">
                        {latest
                          ? `Last updated: ${new Date(latest.scraped_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : isScraping
                            ? "Scraping price & stock..."
                            : "Awaiting initial scrape"}
                      </div>

                      {/* Per-Product Scrape Frequency Selector */}
                      <div className="card-frequency-row">
                        <div className="frequency-label-wrap">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          <span>Check Interval</span>
                        </div>
                        <select
                          className="frequency-select"
                          value={String(product.scrape_interval_minutes || 120)}
                          onChange={(e) =>
                            handleFrequencyChange(
                              product.product_id,
                              e.target.value,
                            )
                          }
                        >
                          <option value="15">Every 15m</option>
                          <option value="30">Every 30m</option>
                          <option value="60">Every 1h</option>
                          <option value="120">Every 2h (default)</option>
                          <option value="360">Every 6h</option>
                          <option value="720">Every 12h</option>
                          <option value="1440">Every 24h</option>
                        </select>
                      </div>
                    </div>

                    {/* Bottom: Actions */}
                    <div className="card-actions-row">
                      <button
                        onClick={() => handleScrapeNow(product.product_id)}
                        disabled={isScraping}
                        className="btn-card-scrape"
                        title="Scrape price & stock now"
                      >
                        {isScraping ? (
                          <>
                            <span className="btn-spinner"></span>
                            <span>Scraping...</span>
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                            <span>Scrape Now</span>
                          </>
                        )}
                      </button>

                      <div className="card-secondary-actions">
                        <button
                          onClick={() => openProductModal(product, "history")}
                          className="btn-card-action"
                          title="View price history chart"
                        >
                          <span className="action-icon">📈</span>
                          <span>History</span>
                          {history.length > 0 && <span className="btn-badge">{history.length}</span>}
                        </button>
                        <button
                          onClick={() => openProductModal(product, "logs")}
                          className="btn-card-action"
                          title="View scraper run logs"
                        >
                          <span className="action-icon">📋</span>
                          <span>Logs</span>
                          {logs.length > 0 && <span className="btn-badge">{logs.length}</span>}
                        </button>
                        <button
                          onClick={() => openProductModal(product, "specs")}
                          className="btn-card-action btn-card-specs"
                          title="View technical specifications and reviews"
                        >
                          <span className="action-icon">✨</span>
                          <span>Specs</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* ================================================================== */}
      {/* PRODUCT DETAILS MODAL (Spacious Graph, History & Logs Inspection)   */}
      {/* ================================================================== */}
      {modalProduct && (
        <div className="modal-overlay" onClick={() => setModalProduct(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3>{modalProduct.product_name}</h3>
                <div className="modal-meta-bar">
                  <span className="product-id-tag">ID: {modalProduct.product_id}</span>
                  <a
                    href={modalProduct.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="external-link"
                  >
                    View Store Page ↗
                  </a>
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setModalProduct(null)}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Bar */}
            <div className="modal-tab-nav">
              <div className="modal-tabs-group">
                <button
                  className={`modal-tab-btn ${modalTab === "history" ? "active" : ""}`}
                  onClick={() => setModalTab("history")}
                >
                  <span className="tab-icon">📈</span>
                  <span>Price History</span>
                  <span className="tab-badge">{(productHistory[modalProduct.product_id] || []).length}</span>
                </button>
                <button
                  className={`modal-tab-btn ${modalTab === "logs" ? "active" : ""}`}
                  onClick={() => setModalTab("logs")}
                >
                  <span className="tab-icon">📋</span>
                  <span>Scrape Logs</span>
                  <span className="tab-badge">{(productLogs[modalProduct.product_id] || []).length}</span>
                </button>
                <button
                  className={`modal-tab-btn ${modalTab === "specs" ? "active" : ""}`}
                  onClick={() => {
                    setModalTab("specs");
                    loadProductDetails(modalProduct.product_id);
                  }}
                >
                  <span className="tab-icon">✨</span>
                  <span>Specs & Reviews</span>
                </button>
              </div>
              <button
                onClick={() => handleScrapeNow(modalProduct.product_id)}
                disabled={scrapingStatus[modalProduct.product_id]}
                className="btn-modal-scrape"
              >
                {scrapingStatus[modalProduct.product_id] ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Scraping...</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    <span>Scrape Now</span>
                  </>
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-content-body">
              {modalTab === "history" && (
                <div className="tab-pane">
                  {/* Visual Price Change Graph */}
                  <div className="section-block">
                    <h4 className="pane-section-title">Price Change Graph</h4>
                    <PriceChart history={productHistory[modalProduct.product_id] || []} />
                  </div>

                  {/* Price History Table */}
                  <div className="section-block">
                    <h4 className="pane-section-title">Price & Stock History Table</h4>
                    {(productHistory[modalProduct.product_id] || []).length === 0 ? (
                      <p className="drawer-empty">No price history recorded yet.</p>
                    ) : (
                      <div className="table-wrapper">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Timestamp</th>
                              <th>Price</th>
                              <th>Stock</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(productHistory[modalProduct.product_id] || [])
                              .slice()
                              .reverse()
                              .map((item, idx, arr) => (
                                <tr key={item.id || idx}>
                                  <td>{arr.length - idx}</td>
                                  <td>
                                    {new Date(item.scraped_at).toLocaleString("en-IN", {
                                      dateStyle: "medium",
                                      timeStyle: "medium",
                                    })}
                                  </td>
                                  <td className="table-price">
                                    ₹{Number(item.price).toLocaleString("en-IN")}
                                  </td>
                                  <td>{item.stock}</td>
                                  <td>
                                    {item.stock > 0 ? (
                                      <span className="badge badge-success">In Stock</span>
                                    ) : (
                                      <span className="badge badge-danger">Out of Stock</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalTab === "logs" && (
                <div className="tab-pane">
                  <h4 className="pane-section-title">Scrape Audit Logs</h4>
                  {(productLogs[modalProduct.product_id] || []).length === 0 ? (
                    <p className="drawer-empty">No scrape logs recorded yet.</p>
                  ) : (
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Outcome</th>
                            <th>Attempts</th>
                            <th>Extracted Price</th>
                            <th>Extracted Stock</th>
                            <th>Notes / Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(productLogs[modalProduct.product_id] || []).map((log) => (
                            <tr key={log.id}>
                              <td>
                                {new Date(log.started_at).toLocaleString("en-IN", {
                                  dateStyle: "short",
                                  timeStyle: "medium",
                                })}
                              </td>
                              <td>
                                {log.status === "success" ? (
                                  <span className="badge badge-success">SUCCESS</span>
                                ) : (
                                  <span className="badge badge-danger">FAILED</span>
                                )}
                              </td>
                              <td>
                                {log.attempts > 1
                                  ? `${log.attempts} (${log.attempts - 1} ${log.attempts - 1 === 1 ? "retry" : "retries"})`
                                  : (log.attempts || 1)}
                              </td>
                              <td className="table-price">
                                {log.price ? `₹${Number(log.price).toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td>
                                {log.stock !== null && log.stock !== undefined ? log.stock : "—"}
                              </td>
                              <td className="log-error-cell">{log.error_message || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {modalTab === "specs" && (
                <div className="tab-pane">
                  {loadingDetails ? (
                    <div className="tab-loading-state">
                      <span className="btn-spinner tab-spinner"></span>
                      <span>Loading specifications & customer reviews from store...</span>
                    </div>
                  ) : !productDetails[modalProduct.product_id] ? (
                    <div className="tab-error-state">
                      <p>Could not load specs and reviews for this product from the store catalog.</p>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => loadProductDetails(modalProduct.product_id, true)}
                      >
                        🔄 Retry Loading
                      </button>
                    </div>
                  ) : (
                    <>
                      {productDetails[modalProduct.product_id].description && (
                        <div className="specs-section-block">
                          <h4 className="pane-section-title">Product Description</h4>
                          <p className="product-overview-desc">
                            {productDetails[modalProduct.product_id].description}
                          </p>
                        </div>
                      )}

                      <div className="specs-section-block">
                        <h4 className="pane-section-title">Technical Specifications</h4>
                        {productDetails[modalProduct.product_id].specs &&
                        Object.keys(productDetails[modalProduct.product_id].specs).length > 0 ? (
                          <table className="specs-table">
                            <tbody>
                              {Object.entries(
                                productDetails[modalProduct.product_id].specs,
                              ).map(([key, val]) => (
                                <tr key={key}>
                                  <td className="specs-label">
                                    {key
                                      .replace(/([A-Z])/g, " $1")
                                      .replace(/^./, (s) => s.toUpperCase())}
                                  </td>
                                  <td className="specs-val">{String(val)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="drawer-empty">No additional specifications listed for this product.</p>
                        )}
                      </div>

                      <div className="specs-section-block">
                        <h4 className="pane-section-title">
                          Customer Reviews (
                          {
                            (
                              productDetails[modalProduct.product_id].reviews || []
                            ).length
                          }
                          )
                        </h4>
                        {(productDetails[modalProduct.product_id].reviews || []).length === 0 ? (
                          <p className="drawer-empty">No reviews posted yet for this product.</p>
                        ) : (
                          <div className="reviews-grid">
                            {(
                              productDetails[modalProduct.product_id].reviews || []
                            ).map((rev) => (
                              <div className="review-card" key={rev.id}>
                                <div className="review-header">
                                  <div className="review-author-row">
                                    <span className="review-author">{rev.author}</span>
                                    <span className="review-stars">
                                      {"★".repeat(rev.rating)}
                                      {"☆".repeat(5 - rev.rating)}
                                    </span>
                                    {rev.verifiedPurchase && (
                                      <span className="verified-tag">
                                        Verified Purchase
                                      </span>
                                    )}
                                  </div>
                                  <span className="review-date">{rev.date}</span>
                                </div>
                                <div className="review-title">{rev.title}</div>
                                <div className="review-body">{rev.body}</div>
                                {rev.helpfulVotes > 0 && (
                                  <div className="review-helpful">
                                    👍 {rev.helpfulVotes} people found this helpful
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;