const { normalizeSeverity } = require("./severity");

function emojiRisk(risk) {
  const r = String(risk || "").toLowerCase();
  if (r === "critical") return "🔴";
  if (r === "high") return "🟠";
  if (r === "medium") return "🟡";
  return "🟢";
}

function formatSummary(review, meta = {}) {
  const overall = review.overall || {};
  const highlights = Array.isArray(review.highlights) ? review.highlights : [];
  const fileSummaries = Array.isArray(review.file_summaries) ? review.file_summaries : [];
  const positives = Array.isArray(overall.positives) ? overall.positives : [];
  const caveats = Array.isArray(overall.caveats) ? overall.caveats : [];
  const tests = Array.isArray(overall.test_suggestions) ? overall.test_suggestions : [];

  const lines = [];
  lines.push("<!-- reviewbot-summary -->");
  lines.push("🤖 **ReviewBot**");
  lines.push("");
  lines.push(`Risk: ${emojiRisk(overall.risk)} **${overall.risk || "unknown"}** | Decision: **${overall.decision || "comment"}**`);
  lines.push("");
  if (overall.summary) {
    lines.push(overall.summary.trim());
    lines.push("");
  }

  if (highlights.length) {
    lines.push("## Top findings");
    for (const h of highlights.slice(0, 10)) lines.push(`- ${h}`);
    lines.push("");
  }

  if (tests.length) {
    lines.push("## Suggested checks / tests");
    for (const t of tests.slice(0, 10)) lines.push(`- ${t}`);
    lines.push("");
  }

  if (fileSummaries.length) {
    lines.push("## File summaries");
    for (const fs of fileSummaries.slice(0, 12)) {
      lines.push(`- \`${fs.path}\` (**${fs.risk}**): ${fs.summary}`);
    }
    lines.push("");
  }

  if (positives.length) {
    lines.push("## What looks good");
    for (const p of positives.slice(0, 10)) lines.push(`- ${p}`);
    lines.push("");
  }

  if (caveats.length) {
    lines.push("## Caveats / questions");
    for (const c of caveats.slice(0, 10)) lines.push(`- ${c}`);
    lines.push("");
  }

  if (meta.generated_at) lines.push(`_Generated at ${meta.generated_at}_`);
  return lines.join("\n");
}

function formatInlineComment(c) {
  const sev = normalizeSeverity(c.severity);
  const conf = (typeof c.confidence === "number") ? c.confidence : null;
  const head = `**${c.title || "Suggestion"}** — _${c.category || "other"} | ${sev}${conf != null ? ` | ${(conf*100).toFixed(0)}%` : ""}_`;
  const msg = (c.message || "").trim();
  const suggestion = c.suggestion ? `\n\n**Suggested change:**\n\n\`\`\`\n${c.suggestion}\n\`\`\`` : "";
  return `${head}\n\n${msg}${suggestion}`;
}

module.exports = { formatSummary, formatInlineComment };
