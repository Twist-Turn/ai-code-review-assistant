# ReviewBot — AI Code Review Assistant (Multi-user, No Secrets in Consumer Repos)

This project contains **two parts**:

1. **GitHub Action** (in repo root): runs on PRs and calls your Review API using **GitHub OIDC** (no per-repo secrets).
2. **Review API server** (in `server/`): verifies the GitHub OIDC token, enforces allow-lists & quotas, then calls **OpenAI** with Structured Outputs.

## What this gives you

- ✅ Works for **multiple repos/users** without requiring them to add an OpenAI key secret
- ✅ Safer auth via **GitHub OIDC** (short-lived identity token)
- ✅ Configurable: focus areas, ignore paths, severity thresholds, comment caps
- ✅ Posts:
  - a **summary PR comment** (updated in-place)
  - optional **inline comments** (filtered by severity/confidence)
  - optional **Check Run**

## Quick start (maintainer)

### A) Deploy the Review API (server/)

1. Go to `server/`
2. Install deps:
   ```bash
   cd server
   npm install
   ```
3. Set environment variables (example):
   ```bash
   export OPENAI_API_KEY="YOUR_OPENAI_KEY"
   export OPENAI_MODEL="gpt-4o-mini"
   export OIDC_AUDIENCE="reviewbot-api"

   # IMPORTANT: protect your wallet!
   export ALLOW_ORGS="Twist-Turn"          # allow any repo under these orgs
   # or: export ALLOW_REPOS="owner/repo,owner2/repo2"
   export ALLOW_ALL="false"

   export QUOTA_PER_REPO_PER_DAY="200"
   export RATE_LIMIT_PER_MINUTE="60"
   export PORT="3000"
   ```
4. Run locally:
   ```bash
   npm start
   ```
5. Verify:
   - `GET /health` → `{ ok: true }`
   - `POST /review` is called by the Action

You can deploy the `server/` folder to any Node hosting:
- Render / Railway / Fly.io / VPS / Docker
- Use `server/Dockerfile` if you want container deployment.

### B) Publish the GitHub Action

1. Create a GitHub repo (example): `Twist-Turn/ai-code-review-assistant`
2. Push this project to it (root contains `action.yml` + `src/` (no build step needed))
3. Create a release tag, e.g. `v1`

> The Action entrypoint is `action.yml` and it runs `src/index.js` (pure Node, no dependencies).

## Quick start (users installing in their repo)

From the root of **their** repo:

```bash
npx --yes github:Twist-Turn/ai-code-review-assistant install --endpoint https://YOUR_DOMAIN/review
```

Then:

```bash
git add .github/workflows/reviewbot.yml .reviewbot.json
git commit -m "Add ReviewBot"
git push
```

Now ReviewBot runs automatically on PRs.  
Or comment on any PR:

```
/review
```

Optional command args:

```
/review focus=security max_comments=6 min_severity=low
```

## Configuration

Users can edit `.reviewbot.json`:

- `policies.ignore_paths`: skip generated folders
- `policies.skip_if_label_present`: e.g. `no-ai-review`
- `review.max_inline_comments`, `review.min_confidence`, etc.

## Security notes (important)

- The **Review API** holds the OpenAI key (server-side). Do not expose it to clients.
- Keep `ALLOW_ALL=false` unless you intentionally want to accept requests from *any* public repo.
- Prefer allow-lists:
  - `ALLOW_ORGS="YourOrg"`
  - or `ALLOW_REPOS="owner/repo,owner2/repo2"`
- Use quotas + rate limits to avoid abuse.

---

## Dev (Action)

The Action is dependency-free. If you edit code, just commit the changes.
