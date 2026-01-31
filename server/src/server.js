import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { verifyGitHubOidc, isRepoAllowed } from "./oidc.js";
import { checkAndConsumeQuota } from "./quota.js";
import { generateReview } from "./openai.js";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "2mb" }));

// Basic rate limit per IP (extra protection; tune as needed)
app.use(rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "60", 10),
  standardHeaders: true,
  legacyHeaders: false
}));

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/review", async (req, res) => {
  try {
    const audience = process.env.OIDC_AUDIENCE || "reviewbot-api";
    const auth = req.headers.authorization;

    const { repo, actor, workflow } = await verifyGitHubOidc(auth, { audience });

    if (!isRepoAllowed(repo)) {
      return res.status(403).json({
        ok: false,
        error: "repo_not_allowed",
        repo,
        hint: "Ask the maintainer to add your repo to ALLOW_REPOS or your org to ALLOW_ORGS."
      });
    }

    const quota = checkAndConsumeQuota(repo);
    if (!quota.ok) {
      return res.status(429).json({
        ok: false,
        error: "quota_exceeded",
        repo,
        limit: quota.limit
      });
    }

    const body = req.body || {};
    const pr = body.pr || {};
    const files = Array.isArray(body.files) ? body.files : [];
    const focus = body.focus || null;
    const mode = body.mode || "safe";

    if (!files.length) return res.status(400).json({ ok: false, error: "no_files" });

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

    return res.json({
      ok: true,
      review,
      meta: {
        // meta must be {} per strict schema - we keep it empty.
      },
      generated_at: new Date().toISOString(),
      repo,
      actor,
      workflow,
      quota_remaining: quota.remaining
    });

  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.includes("Missing Authorization") ? 401 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => console.log(`Review API listening on :${port}`));
