/**
 * Agastya admin worker.
 *
 * Verifies a Google ID token server-side, checks it belongs to the one
 * allowed email address, and - only if that passes - writes changes to
 * data files in the GitHub repo via the GitHub Contents API, or (for
 * /api/fetch-jobs) triggers the scrape.yml GitHub Actions workflow via
 * the Actions API.
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
 *   ALLOWED_EMAIL     - e.g. abhishek.wadmare@gmail.com
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

async function verifyGoogleToken(idToken, env) {
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
  if (payload.email !== env.ALLOWED_EMAIL) {
    throw new Error("Email not authorized");
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new Error("Email not verified");
  }
  if (Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("Token expired");
  }
  return payload;
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

async function handleAddAlert(payload, env) {
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
    `admin: add alert ${newAlert.id}`,
    env
  );
  return { ok: true, alert: newAlert };
}

async function handleDeleteAlert(payload, env) {
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
    `admin: delete alert ${payload.id}`,
    env
  );
  return { ok: true };
}

async function handleAddCompany(payload, env) {
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
    `admin: add company ${newCompany.id}`,
    env
  );
  return { ok: true, company: newCompany };
}

async function handleDeleteCompany(payload, env) {
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
    `admin: delete company ${payload.id}`,
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

async function handleSyncJobs(payload, env) {
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
    `chore: sync jobs from local watcher (+${incoming.length})`,
    env
  );
  return { ok: true, added: incoming.length };
}

async function handleMarkApplied(payload, env) {
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
    `admin: mark applied - ${job.title} at ${job.company}`,
    env
  );
  return { ok: true };
}

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
      await verifyGoogleToken(body.idToken, env);

      let result;
      if (url.pathname === "/api/add-alert") {
        result = await handleAddAlert(body, env);
      } else if (url.pathname === "/api/delete-alert") {
        result = await handleDeleteAlert(body, env);
      } else if (url.pathname === "/api/add-company") {
        result = await handleAddCompany(body, env);
      } else if (url.pathname === "/api/delete-company") {
        result = await handleDeleteCompany(body, env);
      } else if (url.pathname === "/api/fetch-jobs") {
        result = await handleFetchJobs(body, env);
      } else if (url.pathname === "/api/mark-applied") {
        result = await handleMarkApplied(body, env);
      } else if (url.pathname === "/api/sync-jobs") {
        result = await handleSyncJobs(body, env);
      } else {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

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
