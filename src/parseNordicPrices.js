import * as XLSX from "xlsx";

/**
 * Parses the Nordic NET price workbooks.
 *
 * Two workbooks:
 * 1. NORDIC_DEALER_NET_PRICES — sheets: DENTAL RRP, SPARES RRP
 *    Columns: PRODUCT CODE | DESCRIPTION | NET
 * 2. NORDIC_EXTRA-ORAL_DEVICES — sheet: Sheet1
 *    Columns: PRODUCT CODE | DESCRIPTION | NET €
 *
 * Section header rows (no product code) label categories.
 *
 * Returns: { products: [{ code, name, net, category, sheet }], sheetNames: [...] }
 */

function normaliseHeader(h) {
  return String(h || "").toLowerCase().replace(/[\s_\n€]+/g, " ").trim();
}

function findHeaderRow(rows, mustInclude) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const candidate = (rows[i] || []).map(normaliseHeader);
    if (mustInclude.every((kw) => candidate.some((h) => h.includes(kw)))) {
      return { idx: i, headers: candidate };
    }
  }
  return { idx: -1, headers: [] };
}

function findCol(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    if (keywords.every((k) => headers[i].includes(k))) return i;
  }
  return -1;
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function sheetToRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

function parseNetSheet(ws, sheetLabel) {
  const rows = sheetToRows(ws);
  const { idx: headerIdx, headers } = findHeaderRow(rows, ["product", "description"]);
  if (headerIdx === -1) return [];

  const codeCol = findCol(headers, ["product", "code"]) !== -1 ? findCol(headers, ["product", "code"]) : 0;
  const nameCol = findCol(headers, ["description"]) !== -1 ? findCol(headers, ["description"]) : 1;
  const netCol = findCol(headers, ["net"]) !== -1 ? findCol(headers, ["net"]) : 2;

  const products = [];
  let currentCategory = sheetLabel;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const code = row[codeCol];
    const name = row[nameCol];
    const net = row[netCol];

    const hasCode = code !== null && code !== undefined && String(code).trim() !== "";
    const hasName = name !== null && name !== undefined && String(name).trim() !== "";

    if (!hasCode && !hasName) continue;
    if (!hasCode && hasName) {
      currentCategory = String(name).trim();
      continue;
    }

    products.push({
      code: String(code).trim(),
      name: hasName ? String(name).trim() : "",
      net: toNumber(net),
      category: currentCategory,
      sheet: sheetLabel,
    });
  }

  return products;
}

async function fetchAndParse(url, sheetNames) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });

  let products = [];
  const foundSheets = [];

  const sheetsToUse = sheetNames
    ? wb.SheetNames.filter(n => sheetNames.some(s => s.toLowerCase() === n.trim().toLowerCase()))
    : wb.SheetNames;

  sheetsToUse.forEach(name => {
    const label = name.trim();
    const parsed = parseNetSheet(wb.Sheets[name], label);
    if (parsed.length > 0) {
      foundSheets.push(label);
      products = products.concat(parsed);
    }
  });

  return { products, foundSheets };
}

export async function parseNordicPricesFromUrls(netUrl, extraOralUrl) {
  const [main, extraOral] = await Promise.all([
    fetchAndParse(netUrl, ["DENTAL RRP", "SPARES RRP"]),
    fetchAndParse(extraOralUrl, null),
  ]);

  const products = [...main.products, ...extraOral.products];
  const sheetNames = [...main.foundSheets, ...extraOral.foundSheets];

  if (products.length === 0) throw new Error("No products found in Nordic price files.");

  return { products, sheetNames };
}
