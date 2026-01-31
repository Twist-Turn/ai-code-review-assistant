const store = new Map();

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function checkAndConsumeQuota(repo) {
  const limit = parseInt(process.env.QUOTA_PER_REPO_PER_DAY || "200", 10);
  if (!Number.isFinite(limit) || limit <= 0) return { ok: true, remaining: null };

  const key = `${todayKey()}|${repo}`;
  const used = store.get(key) || 0;
  if (used >= limit) return { ok: false, remaining: 0, limit };
  store.set(key, used + 1);
  return { ok: true, remaining: limit - (used + 1), limit };
}
