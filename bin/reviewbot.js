#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(`
ReviewBot installer

Usage:
  npx --yes github:Twist-Turn/ai-code-review-assistant install --endpoint https://YOUR_DOMAIN/review

Options:
  --endpoint, --review-api-url   Review API URL (required)
  --action                      Action ref to use (default: Twist-Turn/ai-code-review-assistant@v1)
  --mode                         safe | trusted (default: safe)
  --force                        overwrite existing files
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.replace(/^--/, "");
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[k] = true;
      } else {
        out[k] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileSafe(filePath, content, force = false) {
  if (fs.existsSync(filePath) && !force) {
    console.log(`- Skipped (exists): ${filePath}`);
    return false;
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`- Wrote: ${filePath}`);
  return true;
}

function workflowYaml({ actionRef, endpoint, mode }) {
  return `name: ReviewBot

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write
  issues: write
  checks: write
  id-token: write

jobs:
  review:
    runs-on: ubuntu-latest
    if: |
      github.event_name != 'issue_comment' ||
      (github.event.issue.pull_request && contains(github.event.comment.body, '/review'))

    steps:
      - name: Checkout base branch (safe)
        if: github.event_name == 'pull_request_target'
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.base.ref }}
          fetch-depth: 1

      - name: Checkout default branch (for /review comments)
        if: github.event_name == 'issue_comment'
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event.repository.default_branch }}
          fetch-depth: 1

      - name: Run ReviewBot
        uses: ${actionRef}
        with:
          mode: ${mode}
          config_path: .reviewbot.json
          review_api_url: ${endpoint}
        env:
          GITHUB_TOKEN: \${{ github.token }}
`;
}

function defaultConfig() {
  return JSON.stringify({
    review: {
      max_files: 25,
      max_inline_comments: 10,
      min_confidence: 0.65,
      min_severity_for_inline: "medium",
      max_patch_chars_total: 120000,
      max_patch_chars_per_file: 12000
    },
    policies: {
      ignore_paths: ["dist/","build/","coverage/","node_modules/","vendor/"],
      skip_if_label_present: ["no-ai-review"],
      run_only_if_label_present: []
    }
  }, null, 2) + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = (args._[0] || "").toLowerCase();
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
    process.exit(0);
  }
  if (cmd !== "install") {
    console.error(`Unknown command: ${cmd}`);
    usage();
    process.exit(1);
  }

  const endpoint = args.endpoint || args["review-api-url"] || args["review_api_url"];
  if (!endpoint) {
    console.error("Missing required --endpoint https://YOUR_DOMAIN/review");
    usage();
    process.exit(1);
  }

  const actionRef = args.action || "Twist-Turn/ai-code-review-assistant@v1";
  const mode = (args.mode || "safe").toLowerCase();
  const force = !!args.force;

  const repoRoot = process.cwd();
  const workflowPath = path.join(repoRoot, ".github", "workflows", "reviewbot.yml");
  const configPath = path.join(repoRoot, ".reviewbot.json");

  console.log("Installing ReviewBot...");
  writeFileSafe(workflowPath, workflowYaml({ actionRef, endpoint, mode }), force);
  writeFileSafe(configPath, defaultConfig(), force);

  console.log("\nNext steps:");
  console.log("1) git add .github/workflows/reviewbot.yml .reviewbot.json");
  console.log("2) git commit -m \"Add ReviewBot\"");
  console.log("3) git push");
  console.log("4) Open a PR or comment /review on a PR.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
