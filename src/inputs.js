function getInput(name, opts = {}) {
  const key = `INPUT_${String(name).replace(/ /g, "_").toUpperCase()}`;
  const raw = process.env[key];
  if ((raw == null || raw === "") && opts.required) {
    throw new Error(`Missing required input: ${name}`);
  }
  return raw != null ? String(raw) : (opts.defaultValue != null ? String(opts.defaultValue) : "");
}

function getBooleanInput(name, def = false) {
  const v = getInput(name, { defaultValue: def ? "true" : "false" });
  return ["1","true","yes","y","on"].includes(String(v).toLowerCase());
}

function getNumberInput(name, def) {
  const v = getInput(name, { defaultValue: String(def) });
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

module.exports = { getInput, getBooleanInput, getNumberInput };
