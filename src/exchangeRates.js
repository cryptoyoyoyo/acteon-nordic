/**
 * EXCHANGE RATES — default rates (1 EUR = X local currency).
 * These are the fallback rates used when no custom rates have been saved.
 * Last updated: March 2026 (ECB official rates)
 */
export const DEFAULT_RATES = {
  EUR: 1.00,
  DKK: 7.47,
  SEK: 10.75,
  NOK: 11.16,
  ISK: 144.20,
  FOK: 7.47,
};

export const CURRENCY_META = {
  EUR: { label: "Finland",       symbol: "€",  flag: "🇫🇮" },
  DKK: { label: "Denmark",       symbol: "kr", flag: "🇩🇰" },
  SEK: { label: "Sweden",        symbol: "kr", flag: "🇸🇪" },
  NOK: { label: "Norway",        symbol: "kr", flag: "🇳🇴" },
  ISK: { label: "Iceland",       symbol: "kr", flag: "🇮🇸" },
  FOK: { label: "Faroe Islands", symbol: "kr", flag: "🇫🇴" },
};

const STORAGE_KEY = "acteon_nordic_exchange_rates";

/** Load saved rates from localStorage, falling back to defaults */
export function loadRates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults in case new currencies were added
      return { ...DEFAULT_RATES, ...parsed };
    }
  } catch (e) {
    console.warn("Could not load saved rates:", e);
  }
  return { ...DEFAULT_RATES };
}

/** Save rates to localStorage */
export function saveRates(rates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch (e) {
    console.warn("Could not save rates:", e);
  }
}

/** Reset rates to defaults and clear localStorage */
export function resetRates() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Could not reset rates:", e);
  }
  return { ...DEFAULT_RATES };
}

/** Build full currency objects from rates */
export function buildCurrencies(rates) {
  return Object.fromEntries(
    Object.entries(CURRENCY_META).map(([code, meta]) => [
      code,
      { ...meta, rate: rates[code] ?? DEFAULT_RATES[code] },
    ])
  );
}

export const DEFAULT_CURRENCY = "EUR";

/** Format a EUR value in the chosen currency */
export function formatCurrency(eurValue, currency) {
  if (eurValue === null || eurValue === undefined || Number.isNaN(eurValue)) return "—";
  const converted = eurValue * currency.rate;
  const formatted = converted.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency.symbol} ${formatted}`;
}

