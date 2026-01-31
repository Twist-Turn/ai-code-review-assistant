function parseReviewCommand(text) {
  const t = String(text || "");
  const m = t.match(/\/(review)\b([^\n]*)/i);
  if (!m) return null;
  const args = m[2].trim();
  const out = {};
  if (!args) return out;
  // support "focus=security,max_comments=6" or space separated
  const parts = args.split(/[\s,]+/).filter(Boolean);
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (!k || rest.length === 0) continue;
    out[k.trim().toLowerCase()] = rest.join("=").trim();
  }
  return out;
}

module.exports = { parseReviewCommand };
