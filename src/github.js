const { warn } = require("./log");

const API_BASE = "https://api.github.com";

async function ghRequest(token, method, path, body = null) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : null
  });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) {
    const msg = json?.message || txt || `${res.status}`;
    throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${msg}`);
  }
  return json;
}

async function getPullRequest(token, owner, repo, pull_number) {
  return await ghRequest(token, "GET", `/repos/${owner}/${repo}/pulls/${pull_number}`);
}

async function listPullFiles(token, owner, repo, pull_number) {
  const out = [];
  let page = 1;
  while (true) {
    const data = await ghRequest(token, "GET", `/repos/${owner}/${repo}/pulls/${pull_number}/files?per_page=100&page=${page}`);
    out.push(...data);
    if (!Array.isArray(data) || data.length < 100) break;
    page += 1;
    if (page > 20) break; // safety
  }
  return out;
}

async function listIssueComments(token, owner, repo, issue_number) {
  const out = [];
  let page = 1;
  while (page <= 3) {
    const data = await ghRequest(token, "GET", `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=100&page=${page}`);
    out.push(...data);
    if (!Array.isArray(data) || data.length < 100) break;
    page += 1;
  }
  return out;
}

async function findExistingSummaryComment(token, owner, repo, issue_number) {
  const comments = await listIssueComments(token, owner, repo, issue_number);
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (typeof c?.body === "string" && c.body.includes("<!-- reviewbot-summary -->")) return c;
  }
  return null;
}

async function upsertSummaryComment(token, owner, repo, issue_number, body) {
  const existing = await findExistingSummaryComment(token, owner, repo, issue_number);
  if (existing) {
    await ghRequest(token, "PATCH", `/repos/${owner}/${repo}/issues/comments/${existing.id}`, { body });
    return { updated: true, id: existing.id };
  }
  const created = await ghRequest(token, "POST", `/repos/${owner}/${repo}/issues/${issue_number}/comments`, { body });
  return { created: true, id: created.id };
}

async function createInlineComment(token, owner, repo, pull_number, comment) {
  const req = {
    body: comment.body,
    path: comment.path,
    side: comment.side || "RIGHT",
    line: comment.line
  };
  if (comment.start_line && comment.start_side) {
    req.start_line = comment.start_line;
    req.start_side = comment.start_side;
  }
  return await ghRequest(token, "POST", `/repos/${owner}/${repo}/pulls/${pull_number}/comments`, req);
}

async function createCheckRun(token, owner, repo, head_sha, title, summary, conclusion) {
  try {
    return await ghRequest(token, "POST", `/repos/${owner}/${repo}/check-runs`, {
      name: title,
      head_sha,
      status: "completed",
      conclusion: conclusion || "success",
      output: { title, summary }
    });
  } catch (e) {
    // Check permissions vary; don't fail the job for this.
    warn(`Could not create check run: ${e.message || e}`);
    return null;
  }
}

module.exports = {
  getPullRequest,
  listPullFiles,
  upsertSummaryComment,
  createInlineComment,
  createCheckRun
};
