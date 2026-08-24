import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import "./App.css";
import logo from "./assets/acteon-logo.jpg";
import { parseNordicPricesFromUrls } from "./parseNordicPrices";
import { parseBottomPricesFromUrl } from "./parseBottomPrices";
import catalogueLookup from "./catalogueLookup.json";
import {
  CURRENCY_META, DEFAULT_RATES, DEFAULT_CURRENCY,
  loadRates, saveRates, resetRates, buildCurrencies, formatCurrency
} from "./exchangeRates";

const netUrl = `${process.env.PUBLIC_URL}/data/nordic-net-prices.xlsx`;
const extraOralUrl = `${process.env.PUBLIC_URL}/data/nordic-extra-oral.xlsx`;
const bottomUrl = `${process.env.PUBLIC_URL}/data/nordic-bottom-prices.xlsx`;
const NUM_SLOTS = 5;

function formatPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function cataloguePageUrl(pageNum) {
  const padded = String(pageNum).padStart(3, "0");
  return `${process.env.PUBLIC_URL}/catalogue/page-${padded}.jpg`;
}

function emptySlot() {
  return { product: null, qty: 1, foc: false };
}

// ── Currency Selector ───────────────────────────────────────────────────────
function CurrencySelector({ activeCurrency, onChange }) {
  return (
    <div className="currency-selector">
      {Object.entries(CURRENCIES).map(([code, cur]) => (
        <button
          key={code}
          className={`currency-btn ${activeCurrency === code ? "currency-active" : ""}`}
          onClick={() => onChange(code)}
          title={cur.label}
        >
          <span className="currency-flag">{cur.flag}</span>
          <span className="currency-code">{code}</span>
        </button>
      ))}
    </div>
  );
}

// ── Edit Rates Modal ────────────────────────────────────────────────────────
function EditRatesModal({ rates, onSave, onReset, onClose }) {
  const [draft, setDraft] = useState({ ...rates });

  function handleChange(code, val) {
    setDraft(prev => ({ ...prev, [code]: val }));
  }

  function handleSave() {
    const parsed = {};
    let valid = true;
    for (const [code, val] of Object.entries(draft)) {
      const n = parseFloat(val);
      if (!Number.isFinite(n) || n <= 0) { valid = false; break; }
      parsed[code] = n;
    }
    if (!valid) { alert("Please enter valid positive numbers for all rates."); return; }
    onSave(parsed);
    onClose();
  }

  function handleReset() {
    if (window.confirm("Reset all rates to defaults?")) {
      onReset();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Edit Exchange Rates</div>
          <div className="modal-subtitle">1 EUR = X local currency. Saved to this browser.</div>
        </div>
        <div className="modal-body">
          {Object.entries(CURRENCY_META).filter(([code]) => code !== "EUR").map(([code, meta]) => (
            <div className="rate-row" key={code}>
              <span className="rate-flag">{meta.flag}</span>
              <span className="rate-label">{meta.label} ({code})</span>
              <span className="rate-eq">1 EUR =</span>
              <input
                className="rate-input field-input"
                type="number"
                min="0.01"
                step="0.01"
                value={draft[code]}
                onChange={e => handleChange(code, e.target.value)}
              />
              <span className="rate-symbol">{meta.symbol}</span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="modal-reset-btn" onClick={handleReset}>Reset to defaults</button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="modal-save-btn" onClick={handleSave}>Save rates</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function ProductSearchDropdown({ priceData, bottomData, currency, value, onSelect, placeholder }) {
  const [query, setQuery] = useState(value ? `${value.code} — ${value.name}` : "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (value) setQuery(`${value.code} — ${value.name}`);
    else setQuery("");
  }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const results = useMemo(() => {
    if (!priceData || !query.trim() || value) return [];
    const q = query.trim().toLowerCase();
    return priceData.products
      .filter(p => p.code.toLowerCase().includes(q) || (p.name && p.name.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [priceData, query, value]);

  function handleChange(e) {
    setQuery(e.target.value);
    if (value) onSelect(null);
    setOpen(true);
  }

  function handlePick(product) {
    onSelect(product);
    setQuery(`${product.code} — ${product.name}`);
    setOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="psd-wrap" ref={ref}>
      <div className="psd-input-row">
        <input
          className="field-input psd-input"
          type="text"
          placeholder={placeholder || "Search product…"}
          value={query}
          onChange={handleChange}
          onFocus={() => !value && setOpen(true)}
        />
        {value && <button className="psd-clear" onClick={handleClear} title="Clear">✕</button>}
      </div>
      {open && results.length > 0 && (
        <div className="psd-dropdown">
          {results.map((p, i) => {
            const bp = bottomData?.byCode[p.code.toLowerCase()];
            return (
              <div key={i} className="psd-option" onMouseDown={() => handlePick(p)}>
                <span className="psd-code">{p.code}</span>
                <span className="psd-name">{p.name}</span>
                {bp?.target != null && (
                  <span className="psd-hint">Target {formatCurrency(bp.target, currency)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Deal Builder ────────────────────────────────────────────────────────────
function DealBuilder({ priceData, bottomData, currency }) {
  const [slots, setSlots] = useState(() => Array.from({ length: NUM_SLOTS }, emptySlot));
  const [desiredNet, setDesiredNet] = useState("");

  function updateSlot(i, patch) {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  function resetAll() {
    setSlots(Array.from({ length: NUM_SLOTS }, emptySlot));
    setDesiredNet("");
  }

  // desiredNet is always entered in the active currency, convert to EUR for calculation
  const desiredNetEur = useMemo(() => {
    if (desiredNet === "") return null;
    const val = parseFloat(desiredNet);
    return Number.isFinite(val) ? val / currency.rate : null;
  }, [desiredNet, currency]);

  const analysis = useMemo(() => {
    const activeSlots = slots.filter(s => s.product !== null);
    if (activeSlots.length === 0) return null;

    const tiers = [
      { key: "target",      label: "Target Price",       cls: "bp-target" },
      { key: "keyAccount",  label: "Key Account Bottom", cls: "bp-key-account" },
      { key: "bigDealer",   label: "Big Dealer Bottom",  cls: "bp-big-dealer" },
      { key: "otherDealer", label: "Other Dealer Bottom",cls: "bp-other-dealer" },
    ];

    // All internal calculations in EUR, display in active currency
    const rows = activeSlots.map(s => {
      const bp = bottomData?.byCode[s.product.code.toLowerCase()] || null;
      return {
        code: s.product.code,
        name: s.product.name,
        net: s.product.net,                            // EUR
        netLine: s.product.net != null ? s.product.net * s.qty : null, // EUR
        qty: s.qty,
        foc: s.foc,
        bp,
      };
    });

    const paidNetTotal = rows.filter(r => !r.foc).reduce((acc, r) => acc + (r.netLine || 0), 0); // EUR
    const comparisonEur = desiredNetEur !== null ? desiredNetEur : paidNetTotal;
    const usingDefault = desiredNetEur === null;

    const tierResults = tiers.map(({ key, label, cls }) => {
      let revenueTotal = 0; // EUR
      let focCost = 0;      // EUR

      const lineItems = rows.map(r => {
        const unitFloor = r.bp ? r.bp[key] : null; // EUR
        const lineFloor = unitFloor != null ? unitFloor * r.qty : null; // EUR
        if (r.foc) {
          if (lineFloor != null) focCost += lineFloor;
        } else {
          if (lineFloor != null) revenueTotal += lineFloor;
        }
        return { ...r, unitFloor, lineFloor };
      });

      const bundleFloor = revenueTotal + focCost; // EUR
      const desiredNetMargin = comparisonEur - bundleFloor; // EUR
      const desiredFeasible = desiredNetMargin >= 0;

      return { key, label, cls, lineItems, revenueTotal, focCost, bundleFloor, desiredNetMargin, desiredFeasible };
    });

    return { tierResults, rows, comparisonEur, usingDefault, paidNetTotal };
  }, [slots, bottomData, desiredNetEur]);

  const hasProducts = slots.some(s => s.product !== null);
  const cur = currency;

  return (
    <div className="deal-builder">
      <div className="deal-header-row">
        <div>
          <div className="deal-title">Deal Builder</div>
          <div className="deal-subtitle">Add up to {NUM_SLOTS} products to assess bundle feasibility across all bottom price tiers.</div>
        </div>
        {hasProducts && <button className="deal-reset-btn" onClick={resetAll}>Reset</button>}
      </div>

      <div className="deal-slots">
        {slots.map((slot, i) => (
          <div className={`deal-slot ${slot.foc ? "slot-foc" : ""} ${slot.product ? "slot-filled" : ""}`} key={i}>
            <div className="slot-num">{i + 1}</div>
            <div className="slot-search">
              <div className="field-label">Product</div>
              <ProductSearchDropdown
                priceData={priceData}
                bottomData={bottomData}
                currency={cur}
                value={slot.product}
                onSelect={p => updateSlot(i, { product: p, foc: p ? slot.foc : false })}
                placeholder={`Search product ${i + 1}…`}
              />
              {slot.product && (
                <div className="slot-product-info">
                  <span className="result-tag" style={{ fontSize: "10px" }}>{slot.product.sheet}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-2)", marginLeft: "6px" }}>
                    NET {formatCurrency(slot.product.net, cur)}
                    {slot.qty > 1 && (
                      <span style={{ color: "var(--text-3)" }}>
                        {" "}(×{slot.qty} = {formatCurrency(slot.product.net * slot.qty, cur)})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <div className="slot-qty">
              <div className="field-label">Qty</div>
              <input
                className="field-input slot-qty-input"
                type="number"
                min="1"
                value={slot.qty}
                onChange={e => updateSlot(i, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                disabled={!slot.product}
              />
            </div>
            <div className="slot-foc-wrap">
              <div className="field-label">FOC</div>
              <button
                className={`foc-btn ${slot.foc ? "foc-active" : ""}`}
                onClick={() => updateSlot(i, { foc: !slot.foc })}
                disabled={!slot.product}
              >
                {slot.foc ? "✓ FOC" : "FOC"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasProducts && (
        <div className="desired-net-row">
          <div className="field" style={{ maxWidth: "360px" }}>
            <label className="field-label">
              Customer / Custom Price for Bundle — optional (default: NET total of paid items)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 600, color: "var(--text-2)" }}>{cur.symbol}</span>
              <input
                className="field-input"
                type="number"
                min="0"
                step="0.01"
                placeholder={analysis ? `Default: ${formatCurrency(analysis.paidNetTotal, cur)} (NET)` : `e.g. ${cur.symbol} 4000`}
                value={desiredNet}
                onChange={e => setDesiredNet(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="deal-results">
          <div className="deal-results-title">Deal Analysis</div>

          <div className="deal-line-items">
            <div className="deal-line-header">
              <span>Product</span>
              <span>Qty</span>
              <span>NET ({cur.label})</span>
              <span>Type</span>
            </div>
            {analysis.rows.map((r, i) => (
              <div className="deal-line-row" key={i}>
                <span className="deal-line-name">
                  <span className="result-code" style={{ fontSize: "11px" }}>{r.code}</span>
                  <span style={{ marginLeft: "6px" }}>{r.name}</span>
                </span>
                <span className="deal-line-qty">×{r.qty}</span>
                <span className="deal-line-net">
                  {r.netLine != null ? formatCurrency(r.netLine, cur) : "—"}
                  <span className="deal-line-unit-hint"> ({formatCurrency(r.net, cur)} ea)</span>
                </span>
                <span className={`deal-line-type ${r.foc ? "type-foc" : "type-paid"}`}>
                  {r.foc ? "FOC" : "Paid"}
                </span>
              </div>
            ))}
            {(() => {
              const paidTotal = analysis.rows.filter(r => !r.foc).reduce((acc, r) => acc + (r.netLine || 0), 0);
              const focTotal = analysis.rows.filter(r => r.foc).reduce((acc, r) => acc + (r.netLine || 0), 0);
              const hasFoc = analysis.rows.some(r => r.foc);
              return (
                <div className="deal-line-totals">
                  <span className="deal-total-label">NET Total</span>
                  <span className="deal-total-paid">Paid: <strong>{formatCurrency(paidTotal, cur)}</strong></span>
                  {hasFoc && <span className="deal-total-foc">FOC: <strong>{formatCurrency(focTotal, cur)}</strong></span>}
                  <span className="deal-total-bundle">Bundle: <strong>{formatCurrency(paidTotal + focTotal, cur)}</strong></span>
                </div>
              );
            })()}
          </div>

          <div className="tier-cards">
            {analysis.tierResults.map(tier => (
              <div className={`tier-card ${tier.cls} ${tier.desiredFeasible ? "tier-ok" : "tier-warn"}`} key={tier.key}>
                <div className="tier-card-label">{tier.label}</div>
                <div className="tier-card-body">
                  {tier.lineItems.map((r, i) => (
                    <div className="tier-line" key={i}>
                      <span className="tier-line-code">{r.code}</span>
                      <span className="tier-line-qty">×{r.qty}</span>
                      <span className="tier-line-unit">
                        {r.unitFloor != null ? `${formatCurrency(r.unitFloor, cur)} each` : "No floor price"}
                      </span>
                      <span className="tier-line-total">
                        {r.lineFloor != null ? formatCurrency(r.lineFloor, cur) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="tier-card-summary">
                  <div className="tier-summary-row tier-bundle-total">
                    <span>Bundle total (floor)</span>
                    <span>{formatCurrency(tier.bundleFloor, cur)}</span>
                  </div>
                  <div className={`tier-summary-row desired-row ${tier.desiredFeasible ? "desired-ok" : "desired-fail"}`}>
                    <span>
                      {analysis.usingDefault
                        ? `NET (${formatCurrency(analysis.comparisonEur, cur)}) vs floor`
                        : `Customer price (${formatCurrency(analysis.comparisonEur, cur)}) vs floor`}
                    </span>
                    <span>
                      {tier.desiredFeasible
                        ? `✓ +${formatCurrency(tier.desiredNetMargin, cur)} margin`
                        : `✗ ${formatCurrency(Math.abs(tier.desiredNetMargin), cur)} short`}
                    </span>
                  </div>
                </div>
                <div className={`tier-verdict ${tier.desiredFeasible ? "verdict-ok" : "verdict-warn"}`}>
                  {tier.desiredFeasible ? "✓ Feasible at this tier" : "✗ Not feasible at this tier"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [priceData, setPriceData] = useState(null);
  const [bottomData, setBottomData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("search");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All tabs");
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY);
  const [rates, setRates] = useState(() => loadRates());
  const [showRatesModal, setShowRatesModal] = useState(false);

  const currencies = useMemo(() => buildCurrencies(rates), [rates]);
  const currency = currencies[currencyCode];

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setLoadError("");
      try {
        const [prices, bottom] = await Promise.all([
          parseNordicPricesFromUrls(netUrl, extraOralUrl),
          parseBottomPricesFromUrl(bottomUrl).catch(err => { console.error(err); return null; }),
        ]);
        if (cancelled) return;
        setPriceData(prices);
        setBottomData(bottom);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const tabs = useMemo(() => {
    if (!priceData) return ["All tabs"];
    return ["All tabs", ...priceData.sheetNames];
  }, [priceData]);

  const results = useMemo(() => {
    if (!priceData) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    let pool = priceData.products;
    if (tab !== "All tabs") pool = pool.filter(p => p.sheet === tab);
    return pool.filter(p =>
      p.code.toLowerCase().includes(q) || (p.name && p.name.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [priceData, search, tab]);

  const getBottomMatch = useCallback((code) => {
    if (!bottomData) return null;
    return bottomData.byCode[String(code).trim().toLowerCase()] || null;
  }, [bottomData]);

  const getCataloguePages = useCallback((code) => {
    return catalogueLookup[String(code).trim().toLowerCase()] || null;
  }, []);

  const totalProducts = priceData ? priceData.products.length : 0;
  const totalTabs = priceData ? priceData.sheetNames.length : 0;

  return (
    <div className="page">
      <div className="internal-banner">
        Internal Use Only — Acteon Nordic Sales Team. Not for external or customer distribution.
      </div>
      <header className="topbar">
        <img src={logo} alt="Acteon" className="logo" />
        <div className="divider" />
        <div className="title-block">
          <div className="title">Price Search</div>
          <div className="subtitle">NORDIC NET PRICE LIST 2026</div>
        </div>
        {!loading && !loadError && (
          <>
            <CurrencySelector activeCurrency={currencyCode} onChange={setCurrencyCode} />
            <button className="edit-rates-btn" onClick={() => setShowRatesModal(true)} title="Edit exchange rates">
              ✏️ Rates
            </button>
            <nav className="app-nav">
              <button className={`nav-btn ${activeTab === "search" ? "nav-active" : ""}`} onClick={() => setActiveTab("search")}>🔍 Price Search</button>
              <button className={`nav-btn ${activeTab === "deal" ? "nav-active" : ""}`} onClick={() => setActiveTab("deal")}>🤝 Deal Builder</button>
            </nav>
          </>
        )}
      </header>

      {showRatesModal && (
        <EditRatesModal
          rates={rates}
          onSave={(newRates) => { saveRates(newRates); setRates(newRates); }}
          onReset={() => { const r = resetRates(); setRates(r); }}
          onClose={() => setShowRatesModal(false)}
        />
      )}

      <main className="main">
        {loading ? (
          <div className="hint-text">Loading price lists…</div>
        ) : loadError ? (
          <div className="upload-card"><div className="error-msg">⚠ {loadError}</div></div>
        ) : activeTab === "deal" ? (
          <DealBuilder priceData={priceData} bottomData={bottomData} currency={currency} />
        ) : (
          <>
            <div className="search-card">
              <div className="search-row">
                <div className="field field-search">
                  <label className="field-label">Search</label>
                  <input
                    className="field-input"
                    type="text"
                    placeholder="Product code or description…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field field-tab">
                  <label className="field-label">Tab</label>
                  <select className="field-select" value={tab} onChange={e => setTab(e.target.value)}>
                    {tabs.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {!search.trim() ? (
              <div className="hint-text">
                Start typing a product code or description to search all {totalProducts.toLocaleString()} products across {totalTabs} tabs.
                {currencyCode !== "EUR" && (
                  <span className="currency-hint"> Prices shown in {currency.label} ({currencyCode}).</span>
                )}
              </div>
            ) : results.length === 0 ? (
              <div className="hint-text">No products match "{search}".</div>
            ) : (
              <div className="results-list">
                {results.map((p, i) => {
                  const bottomMatch = getBottomMatch(p.code);
                  const cataloguePages = getCataloguePages(p.code);
                  return (
                    <div className="result-card" key={`${p.sheet}-${p.code}-${i}`}>
                      <div className="result-header">
                        <div className="result-main">
                          <div className="result-code">{p.code}</div>
                          <div className="result-name">{p.name}</div>
                        </div>
                        <div className="result-meta">
                          <span className="result-tag">{p.sheet}</span>
                          {p.category && p.category !== p.sheet && <span className="result-category">{p.category}</span>}
                        </div>
                      </div>

                      <div className="rrp-row">
                        <div className="price-block">
                          <span className="rrp-label">NET ({currency.label})</span>
                          <span className="rrp-value">{formatCurrency(p.net, currency)}</span>
                        </div>
                        {currencyCode !== "EUR" && (
                          <div className="price-block">
                            <span className="rrp-label" style={{ color: "var(--text-3)", fontSize: "11px" }}>EUR</span>
                            <span className="rrp-value" style={{ fontSize: "13px", color: "var(--text-2)" }}>€{p.net?.toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      {bottomData && (
                        <div className="bottom-price-card">
                          <div className="bottom-price-card-header">Bottom Pricing</div>
                          {bottomMatch ? (
                            <div className="bottom-price-grid">
                              <div className="bottom-price-cell bp-target">
                                <div className="bottom-price-label">Target Price</div>
                                <div className="bottom-price-value">{formatCurrency(bottomMatch.target, currency)}</div>
                              </div>
                              <div className="bottom-price-cell bp-key-account">
                                <div className="bottom-price-label">Key Account Bottom</div>
                                <div className="bottom-price-value">{formatCurrency(bottomMatch.keyAccount, currency)}</div>
                              </div>
                              <div className="bottom-price-cell bp-big-dealer">
                                <div className="bottom-price-label">Big Dealer Bottom</div>
                                <div className="bottom-price-value">{formatCurrency(bottomMatch.bigDealer, currency)}</div>
                              </div>
                              <div className="bottom-price-cell bp-other-dealer">
                                <div className="bottom-price-label">Other Dealer Bottom</div>
                                <div className="bottom-price-value">{formatCurrency(bottomMatch.otherDealer, currency)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="bottom-price-empty">No bottom pricing found for this product code.</div>
                          )}
                        </div>
                      )}

                      <div className="catalogue-card">
                        <div className="catalogue-card-header">Product Catalogue</div>
                        {cataloguePages ? (
                          <div className="catalogue-pages">
                            {cataloguePages.map(pageNum => (
                              <a key={pageNum} href={cataloguePageUrl(pageNum)} target="_blank" rel="noopener noreferrer" className="catalogue-page-link">
                                <img src={cataloguePageUrl(pageNum)} alt={`Catalogue page ${pageNum}`} className="catalogue-page-thumb" loading="lazy" />
                                <span className="catalogue-page-num">Page {pageNum}</span>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="bottom-price-empty">Not found in the product catalogue.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
