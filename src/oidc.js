async function getOidcToken(audience) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !reqToken) {
    throw new Error(
      "OIDC token not available. Ensure workflow has permissions: id-token: write"
    );
  }
  const fullUrl = url.includes("?") ? `${url}&audience=${encodeURIComponent(audience)}` :
                                     `${url}?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${reqToken}` }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Failed to fetch OIDC token: ${res.status} ${txt}`);
  }
  const data = await res.json();
  if (!data || !data.value) throw new Error("OIDC token response missing 'value'");
  return data.value;
}

module.exports = { getOidcToken };
