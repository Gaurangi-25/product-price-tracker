import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [productHistory, setProductHistory] = useState({});

  // Load tracked products from backend
  const loadTrackedProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/api/products`);
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        setTrackedProducts(data);

        data.forEach((product) => {
          loadProductHistory(product.product_id);
        });
      }
    } catch (error) {
      console.error("Failed to load tracked products:", error);
    }
  };

  // Load price history for a product
  const loadProductHistory = async (productId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/products/${productId}/history`,
      );

      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        setProductHistory((prev) => ({
          ...prev,
          [productId]: data,
        }));
      }
    } catch (error) {
      console.error("Failed to load product history:", error);
    }
  };

  // Load tracked products when page opens
  useEffect(() => {
    loadTrackedProducts();
  }, []);

  // Search products
  const searchProducts = async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/search?q=${encodeURIComponent(query)}`,
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Search failed:", data);
        setResults([]);
        return;
      }

      setResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Track product
  const trackProduct = async (product) => {
    try {
      const response = await fetch(`${API_URL}/api/products/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(product),
      });

      const data = await response.json();

      console.log("Tracked:", data);
      alert("Product tracked successfully!");

      // Refresh tracked products
      loadTrackedProducts();
    } catch (error) {
      console.error("Tracking failed:", error);
    }
  };

  return (
    <div className="app">
      <h1>Product Price Tracker</h1>

      <div className="search-box">
        <input
          type="text"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              searchProducts();
            }
          }}
        />

        <button onClick={searchProducts}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Search Results */}
      <section>
        <h2>Search Results</h2>

        {results.length === 0 && !loading && <p>No products found.</p>}

        <div className="products">
          {results.map((product) => (
            <div className="product-card" key={product.product_id}>
              <h3>{product.product_name}</h3>

              <p>Product ID: {product.product_id}</p>

              <button onClick={() => trackProduct(product)}>
                Track Product
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Tracked Products */}
      <section>
        <h2>Tracked Products</h2>

        {trackedProducts.length === 0 ? (
          <p>No tracked products yet.</p>
        ) : (
          <div className="products">
            {trackedProducts.map((product) => {
              const history = productHistory[product.product_id] || [];

              const latest =
                history.length > 0 ? history[history.length - 1] : null;

              return (
                <div className="product-card" key={product.id}>
                  <h3>{product.product_name}</h3>

                  <p>Product ID: {product.product_id}</p>

                  {latest ? (
                    <>
                      <p>Price: ₹{latest.price}</p>
                      <p>Stock: {latest.stock}</p>
                      <p>
                        Last Updated:{" "}
                        {new Date(latest.scraped_at).toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p>Price/Stock: Not scraped yet</p>
                  )}

                  <p>
                    <a
                      href={product.product_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Product
                    </a>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;