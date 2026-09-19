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
  const [modalTab, setModalTab] = useState("history"); // 'history' | 'logs'

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
      }
    } catch (error) {
      console.error(`Failed to load history for ${productId}:`, error);
    }
  }, []);

  const loadProductLogs = useCallback(async (productId) => {
    try {
      const response = await fetch(`${API_URL}/api/products/${productId}/logs`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setProductLogs((prev) => ({ ...prev, [productId]: data }));
      }
    } catch (error) {
      console.error(`Failed to load logs for ${productId}:`, error);
    }
  }, []);

  const loadTrackedProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const response = await fetch(`${API_URL}/api/products`);
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        setTrackedProducts(data);
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

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const response = await fetch(`${API_URL}/api/products`);
        const data = await response.json();
        if (!ignore && response.ok && Array.isArray(data)) {
          setTrackedProducts(data);
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
    }
    init();
    return () => {
      ignore = true;
    };
  }, [loadProductHistory, loadProductLogs]);

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
        showNotification(`Updated latest data for product ${productId}`, "success");
        await loadProductHistory(productId);
        await loadProductLogs(productId);
        await loadTrackedProducts();
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
  };

  // ----------------------------------------------------
  // DASHBOARD SUMMARY METRICS
  // ----------------------------------------------------
  const totalTracked = trackedProducts.length;
  let inStockCount = 0;
  let outOfStockCount = 0;
  let latestSyncTime = null;

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
    }
  });

  const lastSyncFormatted = latestSyncTime
    ? latestSyncTime.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "Never";

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------

  return (
    <div className="dashboard-container">
      {/* Header with Dashboard Summary */}
      <header className="dashboard-header">
        <h1>Product Price Tracker</h1>
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
            className="btn btn-primary"
          >
            {searching ? "Searching..." : "Search"}
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
                              {isScraping ? "Scraping..." : "Not Tracked"}
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
                            className="btn btn-sm btn-primary"
                          >
                            {isScraping ? "Scraping..." : "Scrape Now"}
                          </button>
                          <button
                            onClick={() => openProductModal(product, "history")}
                            className="btn btn-sm btn-outline"
                          >
                            History & Graph ({history.length})
                          </button>
                          <button
                            onClick={() => openProductModal(product, "logs")}
                            className="btn btn-sm btn-outline"
                          >
                            Logs ({logs.length})
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => trackProduct(product)}
                          disabled={isScraping}
                          className="btn btn-primary btn-sm btn-full"
                        >
                          {isScraping ? "Tracking & Scraping..." : "Track Product"}
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
          <h2>Tracked Products ({trackedProducts.length})</h2>
          <button
            onClick={loadTrackedProducts}
            className="btn btn-sm btn-outline"
            title="Refresh list"
          >
            Refresh List
          </button>
        </div>

        {loadingProducts ? (
          <div className="empty-state">Loading tracked products...</div>
        ) : trackedProducts.length === 0 ? (
          <div className="empty-state">
            No products tracked yet. Search above to start monitoring prices.
          </div>
        ) : (
          <div className="cards-grid">
            {trackedProducts.map((product) => {
              const history = productHistory[product.product_id] || [];
              const logs = productLogs[product.product_id] || [];
              const latest = history.length > 0 ? history[history.length - 1] : null;
              const isScraping = !!scrapingStatus[product.product_id];

              return (
                <div className="product-card" key={product.product_id}>
                  {/* Top: ID & Store Link */}
                  <div className="card-top">
                    <div className="card-tag-row">
                      <span className="product-id-tag">ID: {product.product_id}</span>
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
                      {product.brand && product.category && <span className="bullet">·</span>}
                      {product.category && <span className="product-cat-text">{product.category}</span>}
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
                        </div>
                        <div className="card-stock-block">
                          <span className="metric-label">Stock Status</span>
                          {latest.stock > 0 ? (
                            <span className="badge badge-success">
                              In Stock ({latest.stock})
                            </span>
                          ) : (
                            <span className="badge badge-danger">Out of Stock</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="card-price-row">
                        <div className="card-price-block">
                          <span className="metric-label">Current Price</span>
                          <span className="metric-value price-text text-muted">—</span>
                        </div>
                        <div className="card-stock-block">
                          <span className="metric-label">Status</span>
                          <span className="badge badge-neutral">
                            {isScraping ? "Scraping..." : "Pending initial scrape"}
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
                  </div>

                  {/* Bottom: Actions */}
                  <div className="card-actions-row">
                    <button
                      onClick={() => handleScrapeNow(product.product_id)}
                      disabled={isScraping}
                      className="btn btn-sm btn-primary"
                    >
                      {isScraping ? "Scraping..." : "Scrape Now"}
                    </button>
                    <button
                      onClick={() => openProductModal(product, "history")}
                      className="btn btn-sm btn-outline"
                    >
                      History & Graph ({history.length})
                    </button>
                    <button
                      onClick={() => openProductModal(product, "logs")}
                      className="btn btn-sm btn-outline"
                    >
                      Logs ({logs.length})
                    </button>
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
                  Price & Stock History ({(productHistory[modalProduct.product_id] || []).length})
                </button>
                <button
                  className={`modal-tab-btn ${modalTab === "logs" ? "active" : ""}`}
                  onClick={() => setModalTab("logs")}
                >
                  Scrape Logs ({(productLogs[modalProduct.product_id] || []).length})
                </button>
              </div>
              <button
                onClick={() => handleScrapeNow(modalProduct.product_id)}
                disabled={scrapingStatus[modalProduct.product_id]}
                className="btn btn-sm btn-primary"
              >
                {scrapingStatus[modalProduct.product_id] ? "Scraping..." : "Scrape Now"}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;