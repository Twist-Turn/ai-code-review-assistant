import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

export async function verifyGitHubOidc(bearer, { audience }) {
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  if (!token) throw new Error("Missing Authorization: Bearer <OIDC_TOKEN>");

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "https://token.actions.githubusercontent.com",
    audience
  });

  const repo = payload.repository; // "owner/repo"
  const actor = payload.actor;
  const workflow = payload.workflow;
  const job_workflow_ref = payload.job_workflow_ref;

  if (!repo) throw new Error("OIDC token missing 'repository' claim");

  return { repo, actor, workflow, job_workflow_ref, payload };
}

export function isRepoAllowed(repo) {
  const allowAll = String(process.env.ALLOW_ALL || "").toLowerCase() === "true";
  if (allowAll) return true;

  const allowRepos = (process.env.ALLOW_REPOS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (allowRepos.includes(repo)) return true;

  const allowOrgs = (process.env.ALLOW_ORGS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const org = String(repo).split("/")[0]?.toLowerCase();
  if (allowOrgs.includes(org)) return true;

  return false;
}
