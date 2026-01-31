import { verifyGitHubOidc, isRepoAllowed } from "../../src/oidc.js";
import { checkAndConsumeQuota } from "../../src/quota.js";
import { generateReview } from "../../src/openai.js";

const defaultHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const json = (statusCode, body) => ({
  statusCode,
  headers: defaultHeaders,
  body: JSON.stringify(body)
});

function normalizePath(event) {
  const pathname = (() => {
    try {
      return new URL(event.rawUrl || "").pathname;
    } catch {
      return event.path || "/";
    }
  })();

  const prefix = "/.netlify/functions/review";
  return pathname.startsWith(prefix)
    ? pathname.slice(prefix.length) || "/"
    : pathname || "/";
}

function parseJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method || "GET";
  const path = normalizePath(event);

  if (method === "OPTIONS") return { statusCode: 204, headers: defaultHeaders };

  if (method === "GET" && (path === "/" || path === "/health")) {
    return json(200, { ok: true });
  }

  if (method !== "POST" || (path !== "/" && path !== "/review")) {
    return json(404, { ok: false, error: "not_found" });
  }

  try {
    const audience = process.env.OIDC_AUDIENCE || "reviewbot-api";
    const auth = event.headers?.authorization || event.headers?.Authorization;

    const { repo, actor, workflow } = await verifyGitHubOidc(auth, { audience });

    if (!isRepoAllowed(repo)) {
      return json(403, {
        ok: false,
        error: "repo_not_allowed",
        repo,
        hint: "Ask the maintainer to add your repo to ALLOW_REPOS or your org to ALLOW_ORGS."
      });
    }

    const quota = checkAndConsumeQuota(repo);
    if (!quota.ok) {
      return json(429, {
        ok: false,
        error: "quota_exceeded",
        repo,
        limit: quota.limit
      });
    }

    const body = parseJsonBody(event);
    const pr = body.pr || {};
    const files = Array.isArray(body.files) ? body.files : [];
    const focus = body.focus || null;
    const mode = body.mode || "safe";

    if (!files.length) return json(400, { ok: false, error: "no_files" });

    const review = await generateReview({
      repo,
      pr: {
        title: String(pr.title || ""),
        body: String(pr.body || ""),
        url: String(pr.url || "")
      },
      files: files.map(f => ({
        path: String(f.path || ""),
        status: String(f.status || ""),
        additions: Number(f.additions || 0),
        deletions: Number(f.deletions || 0),
        patch: String(f.patch || "")
      })),
      focus,
      mode
    });

    return json(200, {
      ok: true,
      review,
      meta: {},
      generated_at: new Date().toISOString(),
      repo,
      actor,
      workflow,
      quota_remaining: quota.remaining
    });

  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.includes("Missing Authorization") ? 401 : 500;
    return json(status, { ok: false, error: msg });
  }
};
