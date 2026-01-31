const fs = require("fs");
const path = require("path");

const { getInput, getBooleanInput, getNumberInput } = require("./inputs");
const { info, warn, fail } = require("./log");
const { loadConfig, matchesIgnore } = require("./config");
const { normalizeSeverity, gteSeverity } = require("./severity");
const { callReviewApi } = require("./review_api");
const { formatSummary, formatInlineComment } = require("./format");
const { parseReviewCommand } = require("./commands");
const gh = require("./github");

function readEventPayload() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) throw new Error("GITHUB_EVENT_PATH not set");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function parseRepo() {
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  if (!repo || !repo.includes("/")) throw new Error("GITHUB_REPOSITORY not set");
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
}

function pickFocus(payload, fallback) {
  const cmd = parseReviewCommand(payload?.comment?.body || "");
  if (cmd && cmd.focus) return cmd.focus;
  return fallback;
}

function overrideFromCommand(payload) {
  const cmd = parseReviewCommand(payload?.comment?.body || "");
  return cmd || {};
}

function buildFilePayload(files, cfg, maxFiles) {
  const perFile = cfg.review.max_patch_chars_per_file || 12000;
  const totalMax = cfg.review.max_patch_chars_total || 120000;

  const out = [];
  let total = 0;

  for (const f of files) {
    if (!f.patch) continue;
    const patch = String(f.patch);
    const trimmed = patch.slice(0, perFile);
    const nextTotal = total + trimmed.length;
    if (nextTotal > totalMax) break;

    out.push({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: trimmed
    });
    total = nextTotal;
    if (out.length >= maxFiles) break;
  }
  return { out, totalChars: total };
}

async function main() {
  try {
    const payload = readEventPayload();
    const eventName = process.env.GITHUB_EVENT_NAME || "";

    const mode = (getInput("mode", { defaultValue: "safe" }) || "safe").toLowerCase();
    const dryRun = getBooleanInput("dry_run", false);
    const postInline = getBooleanInput("post_inline", true);
    const postSummary = getBooleanInput("post_summary", true);
    const createCheck = getBooleanInput("create_check_run", false);

    const configPath = getInput("config_path", { defaultValue: ".reviewbot.json" });

    const focusInput = getInput("focus", { defaultValue: "" });
    const focus = pickFocus(payload, focusInput);

    const cmdOverrides = overrideFromCommand(payload);
    const maxComments = cmdOverrides.max_comments ? parseInt(cmdOverrides.max_comments, 10) : getNumberInput("max_comments", 10);
    const minSeverity = normalizeSeverity(cmdOverrides.min_severity || getInput("min_severity", { defaultValue: "medium" }));

    const reviewApiUrl = getInput("review_api_url", { defaultValue: process.env.REVIEW_API_URL || "" });
    const audience = getInput("oidc_audience", { defaultValue: process.env.OIDC_AUDIENCE || "reviewbot-api" });
    if (!reviewApiUrl) throw new Error("Missing review_api_url input (or env REVIEW_API_URL).");

    const token = getInput("github_token", { defaultValue: process.env.GITHUB_TOKEN || "" });
    if (!token) throw new Error("Missing GitHub token. Set env.GITHUB_TOKEN or input github_token.");

    const { owner, repo } = parseRepo();

    // Determine PR number
    let pullNumber = null;
    if (payload.pull_request?.number) pullNumber = payload.pull_request.number;
    else if (payload.issue?.number && payload.issue?.pull_request) pullNumber = payload.issue.number;

    if (!pullNumber) throw new Error("Could not determine pull request number from event payload.");

    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const { config, found, fullPath, error: cfgErr } = loadConfig(workspace, configPath);
    if (cfgErr) warn(`Failed to parse config at ${fullPath}; using defaults. ${cfgErr}`);
    info(`Config: ${found ? fullPath : "defaults (config not found)"}`);

    const pr = await gh.getPullRequest(token, owner, repo, pullNumber);

    // policy checks
    const labels = (pr.labels || []).map(l => (l.name || "").toLowerCase());
    const skipLabels = (config.policies.skip_if_label_present || []).map(s => s.toLowerCase());
    const onlyLabels = (config.policies.run_only_if_label_present || []).map(s => s.toLowerCase());

    if (skipLabels.some(l => labels.includes(l))) {
      info(`Skipping review because PR has skip label (${skipLabels.join(", ")}).`);
      return;
    }
    if (onlyLabels.length > 0 && !onlyLabels.some(l => labels.includes(l))) {
      info(`Skipping review because PR does not have required label (${onlyLabels.join(", ")}).`);
      return;
    }

    const allFiles = await gh.listPullFiles(token, owner, repo, pullNumber);
    const ignore = config.policies.ignore_paths || [];
    const filtered = allFiles.filter(f => !matchesIgnore(f.filename, ignore));

    const maxFiles = config.review.max_files || 25;
    const { out: filePayload, totalChars } = buildFilePayload(filtered, config, maxFiles);

    info(`Reviewing ${filePayload.length} file(s); estimated patch chars: ${totalChars}`);

    if (filePayload.length === 0) {
      info("No text patches available to review (binary files or empty patch).");
      return;
    }

    const requestPayload = {
      repo: `${owner}/${repo}`,
      pull_number: pullNumber,
      pr: {
        title: pr.title || "",
        body: pr.body || "",
        url: pr.html_url || "",
        head_sha: pr.head?.sha || ""
      },
      focus: focus || null,
      mode,
      config: {
        min_confidence: config.review.min_confidence,
        min_severity_for_inline: config.review.min_severity_for_inline,
        max_inline_comments: config.review.max_inline_comments
      },
      files: filePayload
    };

    const apiResp = await callReviewApi({ reviewApiUrl, audience, payload: requestPayload });
    const review = apiResp.review || apiResp;
    const meta = apiResp.meta || {};

    // Write report file for debugging
    try {
      fs.writeFileSync(path.join(workspace, "reviewbot-report.json"), JSON.stringify({ review, meta, apiResp }, null, 2));
      info("Wrote reviewbot-report.json");
    } catch {}

    const summaryBody = formatSummary(review, { generated_at: apiResp.generated_at });

    if (dryRun) {
      info("dry_run=true. Not posting to PR.");
      info(summaryBody);
      return;
    }

    if (postSummary) {
      await gh.upsertSummaryComment(token, owner, repo, pullNumber, summaryBody);
      info("Posted/updated summary comment.");
    }

    if (createCheck) {
      const conclusion = (review?.overall?.decision === "request_changes") ? "failure" : "success";
      await gh.createCheckRun(token, owner, repo, pr.head.sha, "ReviewBot", summaryBody.slice(0, 65000), conclusion);
    }

    if (postInline) {
      const minConf = typeof config.review.min_confidence === "number" ? config.review.min_confidence : 0.65;
      const inline = Array.isArray(review.comments) ? review.comments : [];
      let posted = 0;

      for (const c of inline) {
        if (posted >= maxComments) break;
        if (!c || !c.path || !c.line) continue;

        const conf = (typeof c.confidence === "number") ? c.confidence : 0;
        if (conf < minConf) continue;
        if (!gteSeverity(c.severity, minSeverity)) continue;

        const body = formatInlineComment(c);

        try {
          await gh.createInlineComment(token, owner, repo, pullNumber, {
            body,
            path: c.path,
            side: c.side || "RIGHT",
            line: c.line,
            start_line: c.start_line || null,
            start_side: c.start_side || null
          });
          posted += 1;
        } catch (e) {
          warn(`Failed to post inline comment for ${c.path}:${c.line} (${e.message || e})`);
        }
      }

      info(`Posted ${posted} inline comment(s).`);
    }

  } catch (e) {
    fail(e?.message || String(e), e);
  }
}

main();
