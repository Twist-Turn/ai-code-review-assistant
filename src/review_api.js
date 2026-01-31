const { getOidcToken } = require("./oidc");
const { error } = require("./log");

async function callReviewApi({ reviewApiUrl, audience, payload }) {
  const token = await getOidcToken(audience);
  const res = await fetch(reviewApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  if (!res.ok) {
    error(`Review API error: ${res.status}`);
    error(text.slice(0, 2000));
    throw new Error(`Review API request failed (${res.status})`);
  }
  if (!json) throw new Error("Review API returned non-JSON response");
  return json;
}

module.exports = { callReviewApi };
