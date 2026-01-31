import { ReviewSchema } from "./schema.js";

function buildPrompt({ repo, pr, files, focus, mode }) {
  const focusLine = focus ? `Focus area: ${focus}` : "Focus area: general";
  const modeLine = mode === "trusted"
    ? "Mode: trusted (assume internal repo)."
    : "Mode: safe (do not assume access to secrets; be cautious about suggestions that require running untrusted code).";

  // Files already truncated by Action. Keep prompt compact.
  const fileBlocks = files.map(f => {
    return `FILE: ${f.path}
STATUS: ${f.status} (+${f.additions}/-${f.deletions})
PATCH:
${f.patch}`;
  }).join("\n\n---\n\n");

  const system = `You are ReviewBot, an expert code reviewer.
Rules:
- Only comment on what is present in the diff.
- If the diff is tiny (e.g. comment-only), still provide useful repo-agnostic suggestions (tests/checks, docs consistency) BUT do not invent bugs.
- Prioritize correctness, security, and maintainability.
- Provide actionable suggestions with clear reasoning.
- Inline comments MUST reference a file path and an added-line number (RIGHT side) within the diff. If unsure, omit inline comment.
- meta must be an empty object {}.`;

  const user = `Repo: ${repo}
PR title: ${pr.title}
PR body: ${pr.body || "(empty)"}
${focusLine}
${modeLine}

DIFFS:
${fileBlocks}

Now produce the review JSON matching the schema.`;

  return { system, user };
}

function extractOutputText(respJson) {
  // Responses API: output is an array of items; messages contain content parts with type "output_text". See OpenAI Responses 'output' structure in docs.
  const out = respJson?.output;
  if (!Array.isArray(out)) return null;
  const parts = [];
  for (const item of out) {
    if (item?.type !== "message") continue;
    for (const c of (item.content || [])) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

export async function generateReview({ repo, pr, files, focus, mode }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set on server");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const { system, user } = buildPrompt({ repo, pr, files, focus, mode });

  const body = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "reviewbot_output",
        strict: true,
        schema: ReviewSchema
      }
    },
    temperature: 0.2
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = null; }

  if (!res.ok) {
    const errMsg = json?.error?.message || txt.slice(0, 2000);
    throw new Error(`OpenAI error (${res.status}): ${errMsg}`);
  }

  const outText = extractOutputText(json);
  if (!outText) throw new Error("OpenAI response missing output_text content");
  let parsed;
  try { parsed = JSON.parse(outText); } catch (e) {
    throw new Error("Failed to parse structured output JSON from model");
  }
  return parsed;
}
