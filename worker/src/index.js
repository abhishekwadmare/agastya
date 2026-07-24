/**
 * Agastya admin worker.
 *
 * Verifies a Google ID token server-side. Any verified sign-in (real
 * token, correct audience, verified email, not expired) can add its own
 * alerts and mark jobs applied - no roster entry required. Managing
 * companies, triggering scrapes, syncing jobs, and managing the admin
 * roster itself require the email to be an admin: either the permanent
 * bootstrap owner (env.ALLOWED_EMAIL) or an entry in admins.json.
 *
 * jobs.json, companies.json, alerts.json, and applications.json all
 * live in the DATA_BUCKET R2 bucket now (issue #7) - see
 * r2GetJson/r2PutJson. admins.json is the one file that stays in git,
 * permanently, read/written via the GitHub Contents API
 * (githubGetFile/githubPutFile) - its commit history is a free audit
 * log of who has admin access and when that changed, which R2 doesn't
 * give you for free; that's worth more than storage consistency here.
 *
 * jobs/companies are public blobs - GET /api/jobs and GET /api/companies
 * need no auth. alerts/applications are personal - GET /api/alerts and
 * GET /api/applications take an optional `idToken` query param: no
 * token (or an invalid one) gets an empty list back, a non-admin token
 * gets only entries they own, an admin token gets every entry (mirrors
 * the moderation capability admins already have on delete). Every alert/
 * application write stamps an `owner` field from the caller's verified
 * email - never trust an `owner` in the request body.
 *
 * /api/fetch-jobs triggers the scrape.yml GitHub Actions workflow via
 * the Actions API. /api/scraper/sync-jobs is how the scraper itself
 * pushes newly-found jobs into R2 - it can't do Google OAuth, so it
 * authenticates with a shared secret instead (SCRAPER_API_KEY) rather
 * than going through verifyGoogleIdentity.
 *
 * Deleting an alert additionally requires owning it (or being an admin,
 * who can delete any alert) - see handleDeleteAlert.
 *
 * Nothing sensitive here is ever shipped to the frontend bundle.
 *
 * Required Worker secrets (set via `wrangler secret put`):
 *   GITHUB_TOKEN     - a fine-grained PAT scoped to Contents: read/write
 *                       AND Actions: read/write (the latter is needed
 *                       for /api/fetch-jobs to dispatch scrape.yml) on
 *                       this one repo only
 *   SCRAPER_API_KEY  - a random shared secret; also set as a GitHub
 *                       Actions secret of the same name so scrape.yml
 *                       can authenticate POST /api/scraper/sync-jobs
 *   RESEND_API_KEY   - Resend API key, used by sendAlertEmail to send
 *                       per-alert match emails; until set, alert emails
 *                       soft-fail (logged, not thrown) and everything
 *                       else keeps working normally
 *
 * Required Worker vars (in wrangler.toml or the dashboard):
 *   ALLOWED_EMAIL     - e.g. abhishek.wadmare@gmail.com - the permanent
 *                       bootstrap admin, always an admin regardless of
 *                       admins.json, so this account can never be locked
 *                       out even if admins.json is missing or corrupted
 *   GOOGLE_CLIENT_ID  - your OAuth client id, used to check token audience
 *   GITHUB_OWNER      - your GitHub username
 *   GITHUB_REPO       - repo name
 *   GITHUB_BRANCH     - usually "main"
 *   RESEND_FROM_EMAIL - optional; defaults to Resend's sandbox sender
 *                       ("onboarding@resend.dev") if unset
 *
 * Required Worker bindings:
 *   DATA_BUCKET       - R2 bucket binding for jobs/companies/alerts/
 *                       applications.json
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

async function isAdmin(email, env) {
  if (email === env.ALLOWED_EMAIL) {
    return true;
  }
  try {
    const { content } = await githubGetFile(`${DATA_PATH_PREFIX}/admins.json`, env);
    return (content.admins || []).some((a) => a.email === email);
  } catch {
    // admins.json missing/corrupt - fail closed for everyone except the
    // bootstrap owner, who's already handled above.
    return false;
  }
}

async function requireAdmin(email, env) {
  if (!(await isAdmin(email, env))) {
    throw new Error("Forbidden: this action requires admin access");
  }
}

// Used by the GET /api/alerts and GET /api/applications reads, which
// are allowed to be called with no token at all (they just get an
// empty list back) - unlike every write route, an invalid/expired
// token here isn't an error, it's just "not signed in".
async function tryVerifyGoogleIdentity(idToken, env) {
  if (!idToken) return null;
  try {
    return await verifyGoogleIdentity(idToken, env);
  } catch {
    return null;
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

// R2 equivalent of githubGetFile/githubPutFile - `etag` plays the same
// role `sha` does for GitHub, an optimistic-concurrency token that
// guards against two writers clobbering each other's changes.
async function r2GetJson(key, env, fallback) {
  const obj = await env.DATA_BUCKET.get(key);
  if (!obj) {
    return { content: fallback, etag: null };
  }
  // `.etag` (unquoted hex) is what `onlyIf.etagMatches` expects - NOT
  // `.httpEtag` (the same value wrapped in quotes for HTTP headers),
  // which R2 rejects with a "should not be wrapped in quotes" error.
  return { content: JSON.parse(await obj.text()), etag: obj.etag };
}

async function r2PutJson(key, content, etag, env) {
  const result = await env.DATA_BUCKET.put(key, JSON.stringify(content, null, 2), {
    onlyIf: etag ? { etagMatches: etag } : undefined,
    httpMetadata: { contentType: "application/json" },
  });
  if (!result) {
    throw new Error(`R2 write to ${key} was rejected (conflicting concurrent update) - try again`);
  }
}

const EMPTY_ALERTS = { alerts: [] };
const DEFAULT_ALERT_FREQUENCY_HOURS = 1;
const MIN_ALERT_FREQUENCY_HOURS = 1;

// Upserts the caller's one alert - creates it if none exists yet,
// otherwise updates the editable fields in place. created_at/
// last_notified_at/paused are only ever set on first creation and are
// never touched by an edit, so editing an alert can't reset a throttle
// window, drop an already-pending match, or silently un-pause it. This
// is a deliberate departure from this app's usual "no edit, delete +
// re-add" convention - an upsert here avoids a two-request
// delete-then-add partial-failure window and preserves pending
// notification state across an edit.
async function handleAddAlert(payload, env, actorEmail) {
  const [{ content, etag }, { content: companiesContent }] = await Promise.all([
    r2GetJson("alerts.json", env, EMPTY_ALERTS),
    r2GetJson("companies.json", env, { companies: [] }),
  ]);

  const frequencyRaw = payload.alert?.frequency_hours;
  const frequency =
    frequencyRaw === undefined || frequencyRaw === ""
      ? DEFAULT_ALERT_FREQUENCY_HOURS
      : Number(frequencyRaw);
  if (!Number.isFinite(frequency) || frequency < MIN_ALERT_FREQUENCY_HOURS) {
    throw new Error(`frequency_hours must be a number >= ${MIN_ALERT_FREQUENCY_HOURS}`);
  }

  const companies = Array.isArray(payload.alert?.companies) ? payload.alert.companies : [];
  if (!companies.length) {
    throw new Error("Pick at least one company");
  }
  const validIds = new Set(companiesContent.companies.map((c) => c.id));
  const invalid = companies.filter((id) => !validIds.has(id));
  if (invalid.length) {
    throw new Error(`Unknown compan${invalid.length === 1 ? "y" : "ies"}: ${invalid.join(", ")}`);
  }

  const fields = {
    companies,
    keywords_any: payload.alert?.keywords_any || [],
    keywords_exclude: payload.alert?.keywords_exclude || [],
    location_filter: payload.alert?.location_filter || "",
    frequency_hours: frequency,
  };

  const existing = content.alerts.find((a) => a.owner === actorEmail);
  let savedAlert;
  if (existing) {
    Object.assign(existing, fields);
    savedAlert = existing;
  } else {
    savedAlert = {
      owner: actorEmail,
      ...fields,
      paused: false,
      created_at: new Date().toISOString(),
      last_notified_at: null,
    };
    content.alerts.push(savedAlert);
  }

  await r2PutJson("alerts.json", content, etag, env);
  return { ok: true, alert: savedAlert };
}

async function handleDeleteAlert(payload, env, actorEmail) {
  const targetOwner = payload.owner || actorEmail;
  if (targetOwner !== actorEmail && !(await isAdmin(actorEmail, env))) {
    throw new Error("You can only delete your own alert");
  }
  const { content, etag } = await r2GetJson("alerts.json", env, EMPTY_ALERTS);
  const before = content.alerts.length;
  content.alerts = content.alerts.filter((a) => a.owner !== targetOwner);
  if (content.alerts.length === before) {
    throw new Error(`No alert found for '${targetOwner}'`);
  }
  await r2PutJson("alerts.json", content, etag, env);
  return { ok: true };
}

// Separate, self-service-only action from editing - takes the desired
// final state rather than blindly toggling, so a double-fired click is
// idempotent instead of racily flipping the value twice.
async function handleSetAlertPaused(payload, env, actorEmail) {
  const { content, etag } = await r2GetJson("alerts.json", env, EMPTY_ALERTS);
  const alert = content.alerts.find((a) => a.owner === actorEmail);
  if (!alert) {
    throw new Error("No alert found");
  }
  alert.paused = Boolean(payload.paused);
  await r2PutJson("alerts.json", content, etag, env);
  return { ok: true, alert };
}

async function handleGetAlerts(env, idToken) {
  const payload = await tryVerifyGoogleIdentity(idToken, env);
  if (!payload) return EMPTY_ALERTS;
  const { content } = await r2GetJson("alerts.json", env, EMPTY_ALERTS);
  if (await isAdmin(payload.email, env)) return content;
  return { alerts: content.alerts.filter((a) => a.owner === payload.email) };
}

// The only ATS this app knows how to poll today. A company's `ats_type` is
// missing on every row added before this field existed - treat that the
// same as "workday" everywhere it's read, rather than backfilling.
const VALID_ATS = ["workday"];

async function handleAddCompany(payload, env) {
  const { content, etag } = await r2GetJson("companies.json", env, { companies: [] });

  const tenant = (payload.company?.workday_tenant || "").trim().toLowerCase();
  const companyName = (payload.company?.company || "").trim();
  const site = (payload.company?.workday_site || "").trim();
  const host = (payload.company?.workday_host || "wd1").trim() || "wd1";
  const atsType = (payload.company?.ats_type || "workday").trim().toLowerCase();

  if (!tenant || !companyName || !site) {
    throw new Error("company, workday_tenant, and workday_site are required");
  }
  if (!VALID_ATS.includes(atsType)) {
    throw new Error(`Unsupported ats_type '${atsType}' - only ${VALID_ATS.join(", ")} is supported today`);
  }

  const newCompany = {
    id: tenant,
    company: companyName,
    ats_type: atsType,
    workday_tenant: tenant,
    workday_host: host,
    workday_site: site,
    created_at: new Date().toISOString(),
  };

  if (content.companies.some((c) => c.id === newCompany.id)) {
    throw new Error(`Company with workday_tenant '${newCompany.id}' already exists`);
  }

  content.companies.push(newCompany);
  await r2PutJson("companies.json", content, etag, env);
  return { ok: true, company: newCompany };
}

async function handleDeleteCompany(payload, env) {
  const { content, etag } = await r2GetJson("companies.json", env, { companies: [] });
  const before = content.companies.length;
  content.companies = content.companies.filter((c) => c.id !== payload.id);
  if (content.companies.length === before) {
    throw new Error(`No company found with id '${payload.id}'`);
  }
  await r2PutJson("companies.json", content, etag, env);
  return { ok: true };
}

// Tests a candidate Workday tenant/host/site combo against the live CXS
// API before it's ever saved - same request shape scraper/core.py's
// fetch_workday_jobs() makes. Done server-side (not from the browser) to
// sidestep Workday's CORS policy for the frontend origin.
async function handleTestCompany(payload, env) {
  const tenant = (payload.workday_tenant || "").trim().toLowerCase();
  const host = (payload.workday_host || "wd1").trim() || "wd1";
  const site = (payload.workday_site || "").trim();

  if (!tenant || !site) {
    throw new Error("workday_tenant and workday_site are required");
  }

  const url = `https://${tenant}.${host}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1, offset: 0, searchText: "" }),
    });
  } catch (err) {
    return { ok: false, message: `Could not reach Workday: ${err.message}` };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, message: `Workday returned ${res.status}` };
  }

  const data = await res.json();
  return { ok: true, total: data.total ?? 0 };
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

const EMPTY_JOBS = { last_scraped: null, jobs: [] };

// Shared by the admin-triggered /api/sync-jobs (local watcher upload)
// and the scraper's /api/scraper/sync-jobs - same dedupe-by-id merge,
// different callers/auth.
async function mergeJobsIntoR2(newJobs, env) {
  if (!Array.isArray(newJobs)) {
    throw new Error("Missing or invalid 'jobs' array");
  }
  if (newJobs.some((j) => typeof j.id !== "string" || !j.id)) {
    throw new Error("Every job must have a non-empty string 'id'");
  }

  const { content, etag } = await r2GetJson("jobs.json", env, EMPTY_JOBS);
  const existingIds = new Set(content.jobs.map((j) => j.id));

  const incoming = newJobs.filter((j) => !existingIds.has(j.id));
  content.jobs = [...content.jobs, ...incoming].sort((a, b) =>
    (b.first_seen || "").localeCompare(a.first_seen || "")
  );
  content.last_scraped = new Date().toISOString();

  await r2PutJson("jobs.json", content, etag, env);
  return incoming.length;
}

// 1:1 port of scraper/core.py::matches_alert() (title-only matching -
// keywords_any/keywords_exclude never check location, that's what
// location_filter is for). The company check has no Python equivalent -
// it exists because this runs against the shared jobs.json produced by
// the per-company scrape path, not the old per-alert path
// matches_alert() was originally written for. Array.isArray guards
// against alerts.json still containing pre-#13 records saved under the
// old per-company schema (no `companies` array at all) - without it,
// one legacy record would throw and abort checkAlertsAndNotify's whole
// loop, silently breaking every other, valid alert too.
function matchesAlert(job, alert) {
  if (!Array.isArray(alert.companies) || !alert.companies.includes(job.company_id)) return false;

  const titleLower = (job.title || "").toLowerCase();
  const locationLower = (job.location || "").toLowerCase();
  const keywordsAny = (alert.keywords_any || []).map((k) => k.toLowerCase());
  const keywordsExclude = (alert.keywords_exclude || []).map((k) => k.toLowerCase());
  const locationFilter = (alert.location_filter || "").trim().toLowerCase();

  if (keywordsAny.length && !keywordsAny.some((k) => titleLower.includes(k))) return false;
  if (keywordsExclude.some((k) => titleLower.includes(k))) return false;
  if (locationFilter && !locationLower.includes(locationFilter)) return false;
  return true;
}

// Resend (https://api.resend.com/emails). Soft-fails (returns
// { ok: false, message } instead of throwing) like handleTestCompany -
// a bad/missing key or a Resend outage should never break the jobs sync
// it's piggybacking on, and shouldn't stop other alerts in the same
// batch from being checked/notified. onboarding@resend.dev is Resend's
// zero-setup sandbox sender - only delivers to the account owner's own
// verified email until a sending domain is verified.
async function sendAlertEmail(alert, matchedJobs, env) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, message: "RESEND_API_KEY is not configured" };
  }
  const jobLines = matchedJobs
    .map((j) => `- ${j.title} at ${j.company} (${j.location || "location n/a"}) - ${j.apply_url}`)
    .join("\n");
  const plural = matchedJobs.length === 1 ? "" : "s";
  const body = {
    from: env.RESEND_FROM_EMAIL || "Agastya Alerts <onboarding@resend.dev>",
    to: [alert.owner],
    subject: `${matchedJobs.length} new job${plural} matching your Agastya alert`,
    text: `New postings matching your alert:\n\n${jobLines}`,
  };
  let resp;
  try {
    resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, message: `Could not reach Resend: ${err.message}` };
  }
  if (!resp.ok) {
    return { ok: false, message: `Resend returned ${resp.status}: ${await resp.text()}` };
  }
  return { ok: true };
}

// Called after every jobs sync. Deliberately does NOT take the synced
// jobs as input - matches are instead recomputed from
// job.first_seen > (alert.last_notified_at || alert.created_at) against
// the full jobs.json every time an alert is due. This is what makes a
// throttled alert's matches durable: if this instead only looked at
// "this sync's new jobs," a match that arrived while throttled would
// never be seen again once merged into jobs.json (it won't reappear in
// any future sync's new-jobs batch), and would be silently lost forever
// once the throttle cleared. Falling back to created_at (not an empty
// string) also means a brand-new alert only sees jobs discovered after
// it was created, not its entire pre-existing backlog. Being "due" is
// purely time-based, so this runs on every sync regardless of whether
// that specific sync added anything.
async function checkAlertsAndNotify(env) {
  const [{ content, etag }, { content: jobsContent }] = await Promise.all([
    r2GetJson("alerts.json", env, EMPTY_ALERTS),
    r2GetJson("jobs.json", env, EMPTY_JOBS),
  ]);
  if (!content.alerts.length || !jobsContent.jobs.length) return 0;

  const now = Date.now();
  let notifiedCount = 0;
  let changed = false;

  for (const alert of content.alerts) {
    if (alert.paused) continue;

    const frequencyMs = (alert.frequency_hours || DEFAULT_ALERT_FREQUENCY_HOURS) * 3600000;
    const lastNotifiedMs = alert.last_notified_at ? new Date(alert.last_notified_at).getTime() : 0;
    if (now - lastNotifiedMs < frequencyMs) continue; // not due yet

    const sinceIso = alert.last_notified_at || alert.created_at;
    const matchedJobs = jobsContent.jobs.filter(
      (job) => (job.first_seen || "") > sinceIso && matchesAlert(job, alert)
    );
    // Due, but nothing new since last time - don't send an empty email,
    // and don't touch last_notified_at either: that means the *next*
    // sync checks this alert again immediately (still "overdue" by the
    // same margin) instead of waiting out a fresh throttle window for
    // no reason. frequency_hours caps notification frequency, it
    // doesn't gate how often the alert gets checked.
    if (!matchedJobs.length) continue;

    const result = await sendAlertEmail(alert, matchedJobs, env);
    if (result.ok) {
      alert.last_notified_at = new Date().toISOString();
      changed = true;
      notifiedCount += 1;
    } else {
      // last_notified_at is NOT advanced on failure - these jobs stay
      // in the "since last notified" set and get retried automatically
      // on the next due check, instead of being lost on a transient
      // Resend hiccup.
      console.error(`Alert email failed for owner ${alert.owner}: ${result.message}`);
    }
  }

  if (changed) {
    try {
      await r2PutJson("alerts.json", content, etag, env);
    } catch (err) {
      console.error(`Failed to persist last_notified_at updates: ${err.message}`);
    }
  }
  return notifiedCount;
}

async function handleSyncJobs(payload, env) {
  const added = await mergeJobsIntoR2(payload.jobs, env);
  const notified = await checkAlertsAndNotify(env);
  return { ok: true, added, notified };
}

async function handleScraperSyncJobs(payload, env) {
  const added = await mergeJobsIntoR2(payload.jobs, env);
  const notified = await checkAlertsAndNotify(env);
  return { ok: true, added, notified };
}

async function handleGetJobs(env) {
  const { content } = await r2GetJson("jobs.json", env, EMPTY_JOBS);
  return content;
}

async function handleGetCompanies(env) {
  const { content } = await r2GetJson("companies.json", env, { companies: [] });
  return content;
}

const EMPTY_SETTINGS = { scrape_frequency_hours: 4 };
const MIN_SCRAPE_FREQUENCY_HOURS = 1;

async function handleGetSettings(env) {
  const { content } = await r2GetJson("settings.json", env, EMPTY_SETTINGS);
  return content;
}

async function handleUpdateSettings(payload, env) {
  const frequency = Number(payload.scrape_frequency_hours);
  if (!Number.isFinite(frequency) || frequency < MIN_SCRAPE_FREQUENCY_HOURS) {
    throw new Error(`scrape_frequency_hours must be a number >= ${MIN_SCRAPE_FREQUENCY_HOURS}`);
  }

  const { content, etag } = await r2GetJson("settings.json", env, EMPTY_SETTINGS);
  content.scrape_frequency_hours = frequency;
  await r2PutJson("settings.json", content, etag, env);
  return { ok: true, settings: content };
}

const EMPTY_APPLICATIONS = { applications: [] };

async function handleMarkApplied(payload, env, actorEmail) {
  const [{ content: jobsContent }, { content: appsContent, etag: appsEtag }] = await Promise.all([
    r2GetJson("jobs.json", env, EMPTY_JOBS),
    r2GetJson("applications.json", env, EMPTY_APPLICATIONS),
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
    owner: actorEmail,
  });

  await r2PutJson("applications.json", appsContent, appsEtag, env);
  return { ok: true };
}

async function handleGetApplications(env, idToken) {
  const payload = await tryVerifyGoogleIdentity(idToken, env);
  if (!payload) return EMPTY_APPLICATIONS;
  const { content } = await r2GetJson("applications.json", env, EMPTY_APPLICATIONS);
  if (await isAdmin(payload.email, env)) return content;
  return { applications: content.applications.filter((a) => a.owner === payload.email) };
}

async function handleAddAdmin(payload, env, actorEmail) {
  const email = (payload.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required");
  }
  if (email === env.ALLOWED_EMAIL) {
    throw new Error(`${email} is the built-in owner admin and doesn't need to be added`);
  }

  const { content, sha } = await githubGetFile(`${DATA_PATH_PREFIX}/admins.json`, env);
  if (content.admins.some((a) => a.email === email)) {
    throw new Error(`${email} is already an admin`);
  }

  const entry = { email, added_at: new Date().toISOString(), added_by: actorEmail };
  content.admins.push(entry);
  await githubPutFile(
    `${DATA_PATH_PREFIX}/admins.json`,
    content,
    sha,
    `admin: add ${email} (by ${actorEmail})`,
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
  if (!content.admins.some((a) => a.email === email)) {
    throw new Error(`No admin found with email '${email}'`);
  }

  content.admins = content.admins.filter((a) => a.email !== email);
  await githubPutFile(
    `${DATA_PATH_PREFIX}/admins.json`,
    content,
    sha,
    `admin: remove ${email} (by ${actorEmail})`,
    env
  );
  return { ok: true };
}

// jobs/companies are public, no auth needed. alerts/applications take
// an optional idToken (query param, since GET requests have no body)
// and filter down to the caller's own entries - see handleGetAlerts/
// handleGetApplications.
const GET_ROUTES = {
  "/api/jobs": handleGetJobs,
  "/api/companies": handleGetCompanies,
  "/api/alerts": handleGetAlerts,
  "/api/applications": handleGetApplications,
  "/api/settings": handleGetSettings,
};

const POST_ROUTES = {
  "/api/add-alert": { handler: handleAddAlert, adminOnly: false },
  "/api/delete-alert": { handler: handleDeleteAlert, adminOnly: false },
  "/api/set-alert-paused": { handler: handleSetAlertPaused, adminOnly: false },
  "/api/mark-applied": { handler: handleMarkApplied, adminOnly: false },
  "/api/add-company": { handler: handleAddCompany, adminOnly: true },
  "/api/delete-company": { handler: handleDeleteCompany, adminOnly: true },
  "/api/test-company": { handler: handleTestCompany, adminOnly: true },
  "/api/fetch-jobs": { handler: handleFetchJobs, adminOnly: true },
  "/api/sync-jobs": { handler: handleSyncJobs, adminOnly: true },
  "/api/add-admin": { handler: handleAddAdmin, adminOnly: true },
  "/api/remove-admin": { handler: handleRemoveAdmin, adminOnly: true },
  "/api/update-settings": { handler: handleUpdateSettings, adminOnly: true },
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const jsonResponse = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });

    try {
      if (request.method === "GET") {
        const handler = GET_ROUTES[url.pathname];
        if (!handler) return jsonResponse({ error: "Not found" }, 404);
        return jsonResponse(await handler(env, url.searchParams.get("idToken")));
      }

      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }

      // The scraper can't do an interactive Google sign-in, so this one
      // route uses a shared-secret header instead of verifyGoogleIdentity.
      if (url.pathname === "/api/scraper/sync-jobs") {
        if (request.headers.get("X-Scraper-Key") !== env.SCRAPER_API_KEY) {
          throw new Error("Forbidden: invalid scraper key");
        }
        const body = await request.json();
        return jsonResponse(await handleScraperSyncJobs(body, env));
      }

      const body = await request.json();
      if (!body.idToken) {
        throw new Error("Missing idToken");
      }

      const route = POST_ROUTES[url.pathname];
      if (!route) {
        return jsonResponse({ error: "Not found" }, 404);
      }

      const payload = await verifyGoogleIdentity(body.idToken, env);
      if (route.adminOnly) {
        await requireAdmin(payload.email, env);
      }

      const result = await route.handler(body, env, payload.email);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err.message }, 400);
    }
  },
};
