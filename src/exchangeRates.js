/**
 * EXCHANGE RATES — update these whenever rates change.
 * All rates are: 1 EUR = X local currency
 * Finland uses EUR (rate = 1.00), so no conversion needed.
 *
 * Last updated: March 2026 (ECB official rates)
 */
export const CURRENCIES = {
  EUR: { label: "Finland",       symbol: "€",  flag: "🇫🇮", rate: 1.00 },
  DKK: { label: "Denmark",       symbol: "kr", flag: "🇩🇰", rate: 7.47 },
  SEK: { label: "Sweden",        symbol: "kr", flag: "🇸🇪", rate: 10.75 },
  NOK: { label: "Norway",        symbol: "kr", flag: "🇳🇴", rate: 11.16 },
  ISK: { label: "Iceland",       symbol: "kr", flag: "🇮🇸", rate: 144.20 },
  FOK: { label: "Faroe Islands", symbol: "kr", flag: "🇫🇴", rate: 7.47 },
};

export const DEFAULT_CURRENCY = "EUR";

/**
 * Format a EUR value in the chosen currency.
 * e.g. formatCurrency(100, CURRENCIES.NOK) → "kr 1,116.00"
 */
export function formatCurrency(eurValue, currency) {
  if (eurValue === null || eurValue === undefined || Number.isNaN(eurValue)) return "—";
  const converted = eurValue * currency.rate;
  // Use space as thousands separator for Nordic readability
  const formatted = converted.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency.symbol} ${formatted}`;
}
