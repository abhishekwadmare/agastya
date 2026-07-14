/**
 * Agastya admin worker.
 *
 * Verifies a Google ID token server-side, resolves the token's email to a
 * role (admin or user) - either the permanent bootstrap owner (env.
 * ALLOWED_EMAIL, always role admin) or an entry in admins.json - and
 * only if the resolved role meets the route's required role does it write
 * changes to data files in the GitHub repo via the GitHub Contents API,
 * or (for /api/fetch-jobs) trigger the scrape.yml GitHub Actions workflow
 * via the Actions API.
 *
 * Roles: "admin" can do everything, including managing the admin/user
 * list itself (add-admin/remove-admin). "user" can manage alerts and
 * applications (add-alert, delete-alert, mark-applied) only - companies,
 * fetch-jobs, sync-jobs, and admin-list management all require "admin".
 * See the ROUTES table below for the exact mapping.
 *
 * The GitHub token and allowed email live in Worker secrets/vars, never
 * in the frontend bundle, so nothing sensitive is ever shipped to the
 * browser.
 *
 * Required Worker secrets (set via `wrangler secret put`):
 *   GITHUB_TOKEN     - a fine-grained PAT scoped to Contents: read/write
 *                       AND Actions: read/write (the latter is needed
 *                       for /api/fetch-jobs to dispatch scrape.yml) on
 *                       this one repo only
 *
 * Required Worker vars (in wrangler.toml or the dashboard):
 *   ALLOWED_EMAIL     - e.g. abhishek.wadmare@gmail.com - the permanent
 *                       bootstrap admin, always role admin regardless of
 *                       admins.json, so this account can never be locked
 *                       out even if admins.json is missing or corrupted
 *   GOOGLE_CLIENT_ID  - your OAuth client id, used to check token audience
 *   GITHUB_OWNER      - your GitHub username
 *   GITHUB_REPO       - repo name
 *   GITHUB_BRANCH     - usually "main"
 */

const DATA_PATH_PREFIX = "frontend/public/data";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function verifyGoogleIdentity(idToken, env) {
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!resp.ok) {
    throw new Error("Google token verification failed");
  }
  const payload = await resp.json();

  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error("Token audience mismatch");
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new Error("Email not verified");
  }
  if (Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("Token expired");
  }
  return payload;
}

const ROLE_RANK = { user: 1, admin: 2 };

async function resolveRole(email, env) {
  if (email === env.ALLOWED_EMAIL) {
    return "admin";
  }
  try {
    const { content } = await githubGetFile(`${DATA_PATH_PREFIX}/admins.json`, env);
    const entry = (content.admins || []).find((a) => a.email === email);
    return entry ? entry.role : null;
  } catch {
    // admins.json missing/corrupt - fail closed for everyone except the
    // bootstrap owner, who's already handled above.
    return null;
  }
}

function assertRole(role, requiredRole) {
  if (!role || ROLE_RANK[role] < ROLE_RANK[requiredRole]) {
    throw new Error(`Forbidden: this action requires role '${requiredRole}' or higher`);
  }
}

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function githubGetFile(path, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "agastya-worker",
      Accept: "application/vnd.github+json",
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub read failed for ${path}: ${resp.status}`);
  }
  const data = await resp.json();
  const content = JSON.parse(b64DecodeUnicode(data.content));
  return { content, sha: data.sha };
}

async function githubPutFile(path, newContentObj, sha, message, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const body = {
    message,
    content: b64EncodeUnicode(JSON.stringify(newContentObj, null, 2)),
    sha,
    branch: env.GITHUB_BRANCH,
  };
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "agastya-worker",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub write failed for ${path}: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function handleAddAlert(payload, env, actorEmail) {
  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/alerts.json`, env);
  const newAlert = {
    ...payload.alert,
    created_at: new Date().toISOString(),
  };
  if (content.alerts.some((a) => a.id === newAlert.id)) {
    throw new Error(`Alert id '${newAlert.id}' already exists`);
  }
  content.alerts.push(newAlert);
  await githubPutFile(
    `${DATA_PATH_PREFIX}/alerts.json`,
    content,
    sha,
    `admin: add alert ${newAlert.id} (by ${actorEmail})`,
    env
  );
  return { ok: true, alert: newAlert };
}

async function handleDeleteAlert(payload, env, actorEmail) {
  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/alerts.json`, env);
  const before = content.alerts.length;
  content.alerts = content.alerts.filter((a) => a.id !== payload.id);
  if (content.alerts.length === before) {
    throw new Error(`No alert found with id '${payload.id}'`);
  }
  await githubPutFile(
    `${DATA_PATH_PREFIX}/alerts.json`,
    content,
    sha,
    `admin: delete alert ${payload.id} (by ${actorEmail})`,
    env
  );
  return { ok: true };
}

async function handleAddCompany(payload, env, actorEmail) {
  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/companies.json`, env);

  const tenant = (payload.company?.workday_tenant || "").trim().toLowerCase();
  const companyName = (payload.company?.company || "").trim();
  const site = (payload.company?.workday_site || "").trim();
  const host = (payload.company?.workday_host || "wd1").trim() || "wd1";

  if (!tenant || !companyName || !site) {
    throw new Error("company, workday_tenant, and workday_site are required");
  }

  const newCompany = {
    id: tenant,
    company: companyName,
    workday_tenant: tenant,
    workday_host: host,
    workday_site: site,
    created_at: new Date().toISOString(),
  };

  if (content.companies.some((c) => c.id === newCompany.id)) {
    throw new Error(`Company with workday_tenant '${newCompany.id}' already exists`);
  }

  content.companies.push(newCompany);
  await githubPutFile(
    `${DATA_PATH_PREFIX}/companies.json`,
    content,
    sha,
    `admin: add company ${newCompany.id} (by ${actorEmail})`,
    env
  );
  return { ok: true, company: newCompany };
}

async function handleDeleteCompany(payload, env, actorEmail) {
  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/companies.json`, env);
  const before = content.companies.length;
  content.companies = content.companies.filter((c) => c.id !== payload.id);
  if (content.companies.length === before) {
    throw new Error(`No company found with id '${payload.id}'`);
  }
  await githubPutFile(
    `${DATA_PATH_PREFIX}/companies.json`,
    content,
    sha,
    `admin: delete company ${payload.id} (by ${actorEmail})`,
    env
  );
  return { ok: true };
}

async function handleFetchJobs(payload, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/scrape.yml/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "agastya-worker",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub workflow dispatch failed: ${resp.status} ${text}`);
  }
  return { ok: true };
}

async function handleSyncJobs(payload, env, actorEmail) {
  if (!Array.isArray(payload.jobs)) {
    throw new Error("Missing or invalid 'jobs' array");
  }
  if (payload.jobs.some((j) => typeof j.id !== "string" || !j.id)) {
    throw new Error("Every job must have a non-empty string 'id'");
  }

  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/jobs.json`, env);
  const existingIds = new Set(content.jobs.map((j) => j.id));

  const incoming = payload.jobs.filter((j) => !existingIds.has(j.id));
  content.jobs = [...content.jobs, ...incoming].sort((a, b) =>
    (b.first_seen || "").localeCompare(a.first_seen || "")
  );
  content.last_scraped = new Date().toISOString();

  await githubPutFile(
    `${DATA_PATH_PREFIX}/jobs.json`,
    content,
    sha,
    `chore: sync jobs from local watcher (+${incoming.length}, by ${actorEmail})`,
    env
  );
  return { ok: true, added: incoming.length };
}

async function handleMarkApplied(payload, env, actorEmail) {
  const [{ content: jobsContent }, { content: appsContent, sha: appsSha }] = await Promise.all([
    githubGetFile(`${DATA_PATH_PREFIX}/jobs.json`, env),
    githubGetFile(`${DATA_PATH_PREFIX}/applications.json`, env),
  ]);

  const job = jobsContent.jobs.find((j) => j.id === payload.jobId);
  if (!job) {
    throw new Error(`No job found with id '${payload.jobId}'`);
  }
  if (appsContent.applications.some((a) => a.job_id === job.id)) {
    return { ok: true, alreadyMarked: true };
  }

  appsContent.applications.push({
    job_id: job.id,
    title: job.title,
    company: job.company,
    apply_url: job.apply_url,
    applied_at: new Date().toISOString(),
    status: "applied",
  });

  await githubPutFile(
    `${DATA_PATH_PREFIX}/applications.json`,
    appsContent,
    appsSha,
    `admin: mark applied - ${job.title} at ${job.company} (by ${actorEmail})`,
    env
  );
  return { ok: true };
}

async function handleAddAdmin(payload, env, actorEmail) {
  const email = (payload.email || "").trim().toLowerCase();
  const role = payload.role === "admin" ? "admin" : "user";

  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required");
  }
  if (email === env.ALLOWED_EMAIL) {
    throw new Error(`${email} is the built-in owner admin and doesn't need to be added`);
  }

  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/admins.json`, env);
  if (content.admins.some((a) => a.email === email)) {
    throw new Error(`${email} is already in the admin list`);
  }

  const entry = { email, role, added_at: new Date().toISOString(), added_by: actorEmail };
  content.admins.push(entry);
  await githubPutFile(
    `${DATA_PATH_PREFIX}/admins.json`,
    content,
    sha,
    `admin: add ${role} ${email} (by ${actorEmail})`,
    env
  );
  return { ok: true, admin: entry };
}

async function handleRemoveAdmin(payload, env, actorEmail) {
  const email = (payload.email || "").trim().toLowerCase();
  if (!email) {
    throw new Error("email is required");
  }
  if (email === env.ALLOWED_EMAIL) {
    throw new Error("The built-in owner admin cannot be removed");
  }

  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/admins.json`, env);
  const target = content.admins.find((a) => a.email === email);
  if (!target) {
    throw new Error(`No admin/user found with email '${email}'`);
  }

  content.admins = content.admins.filter((a) => a.email !== email);
  await githubPutFile(
    `${DATA_PATH_PREFIX}/admins.json`,
    content,
    sha,
    `admin: remove ${target.role} ${email} (by ${actorEmail})`,
    env
  );
  return { ok: true };
}

// The "-admin" suffix in these route names refers to the admin/user list
// feature, not that every entry added is role "admin" - both routes
// manage entries of either role.
const ROUTES = {
  "/api/add-alert": { handler: handleAddAlert, role: "user" },
  "/api/delete-alert": { handler: handleDeleteAlert, role: "user" },
  "/api/mark-applied": { handler: handleMarkApplied, role: "user" },
  "/api/add-company": { handler: handleAddCompany, role: "admin" },
  "/api/delete-company": { handler: handleDeleteCompany, role: "admin" },
  "/api/fetch-jobs": { handler: handleFetchJobs, role: "admin" },
  "/api/sync-jobs": { handler: handleSyncJobs, role: "admin" },
  "/api/add-admin": { handler: handleAddAdmin, role: "admin" },
  "/api/remove-admin": { handler: handleRemoveAdmin, role: "admin" },
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    try {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const body = await request.json();
      if (!body.idToken) {
        throw new Error("Missing idToken");
      }

      const route = ROUTES[url.pathname];
      if (!route) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const payload = await verifyGoogleIdentity(body.idToken, env);
      const role = await resolveRole(payload.email, env);
      assertRole(role, route.role);

      const result = await route.handler(body, env, payload.email);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
  },
};
