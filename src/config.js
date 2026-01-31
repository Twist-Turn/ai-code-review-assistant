const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
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
};

function deepMerge(base, override) {
  if (override == null) return base;
  if (Array.isArray(base) && Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    out[k] = deepMerge(base[k], override[k]);
  }
  return out;
}

function loadConfig(workspace, configPath) {
  const full = path.isAbsolute(configPath) ? configPath : path.join(workspace, configPath);
  if (!fs.existsSync(full)) return { config: DEFAULT_CONFIG, found: false, fullPath: full };
  try {
    const raw = fs.readFileSync(full, "utf8");
    const user = JSON.parse(raw);
    const merged = deepMerge(DEFAULT_CONFIG, user);
    return { config: merged, found: true, fullPath: full };
  } catch (e) {
    return { config: DEFAULT_CONFIG, found: false, fullPath: full, error: e };
  }
}

function matchesIgnore(pathStr, ignoreList) {
  const p = String(pathStr);
  return (ignoreList || []).some(prefix => p.startsWith(prefix));
}

module.exports = { loadConfig, DEFAULT_CONFIG, matchesIgnore };
