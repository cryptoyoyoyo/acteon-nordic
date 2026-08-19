import * as XLSX from "xlsx";

function normaliseHeader(h) {
  return String(h || "").toLowerCase().replace(/[\s_\n]+/g, " ").trim();
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

function parseBottomData(data) {
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });

  let headerRowIdx = -1;
  let headers = [];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const candidate = (rows[i] || []).map(normaliseHeader);
    if (candidate.some((h) => h.includes("reference") || h.includes("code") || h.includes("sku"))) {
      headerRowIdx = i;
      headers = candidate;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("Couldn't find header row in bottom price file.");

  const codeCol = findCol(headers, ["reference"]) !== -1 ? findCol(headers, ["reference"]) : findCol(headers, ["code"]);
  const nameCol = findCol(headers, ["description"]) !== -1 ? findCol(headers, ["description"]) : findCol(headers, ["name"]);
  const targetCol = findCol(headers, ["target"]);
  const keyAccountCol = findCol(headers, ["key", "account"]);
  const bigDealerCol = findCol(headers, ["big", "dealer"]);
  const otherDealerCol = findCol(headers, ["other", "dealer"]);

  if (codeCol === -1) throw new Error("Couldn't find Reference/Code column in bottom price file.");

  const byCode = {};
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const codeRaw = row[codeCol];
    if (codeRaw === null || codeRaw === undefined || String(codeRaw).trim() === "") continue;
    const code = String(codeRaw).trim();
    byCode[code.toLowerCase()] = {
      code,
      name: nameCol !== -1 ? row[nameCol] ?? "" : "",
      target: targetCol !== -1 ? toNumber(row[targetCol]) : null,
      keyAccount: keyAccountCol !== -1 ? toNumber(row[keyAccountCol]) : null,
      bigDealer: bigDealerCol !== -1 ? toNumber(row[bigDealerCol]) : null,
      otherDealer: otherDealerCol !== -1 ? toNumber(row[otherDealerCol]) : null,
    };
  }

  return { byCode };
}

export async function parseBottomPricesFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load bottom price file (${res.status})`);
  const buf = await res.arrayBuffer();
  return parseBottomData(new Uint8Array(buf));
}
