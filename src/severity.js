const ORDER = ["nit","low","medium","high","critical"];

function normalizeSeverity(s) {
  if (!s) return "medium";
  const v = String(s).toLowerCase().trim();
  return ORDER.includes(v) ? v : "medium";
}

function gteSeverity(a, b) {
  const ia = ORDER.indexOf(normalizeSeverity(a));
  const ib = ORDER.indexOf(normalizeSeverity(b));
  return ia >= ib;
}

module.exports = { ORDER, normalizeSeverity, gteSeverity };
