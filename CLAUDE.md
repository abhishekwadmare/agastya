# Agastya - project context for Claude Code

This file exists so a fresh Claude Code session has the context of an
existing collaborator, not a stranger reading the repo cold. Read this
before making changes.

## What this is

A self-hosted job alert system for Abhishek (Abhi), who is job hunting in
Ireland under time pressure (Stamp 1G work permit expires Dec 2026). It
watches Workday-hosted company career pages directly via their public
JSON API, tracks new postings, and lets Abhi manage alerts from a live
dashboard - authenticated as specifically him, not a public open feature.

This is also intended as a portfolio/resume piece, so code quality and
being able to explain the architecture in an interview matters as much
as the tool working.

## Why "Agastya"

Named after the Vedic sage associated with the star Canopus, historically
used for navigation/wayfinding. Considered and rejected: "JobWatch"
(generic, no personality), "Heimdall" (mythologically fitting but already
a well-known unrelated open-source dashboard project - naming collision),
"Argus" (fine, but Agastya has more personal resonance and a cleaner
naming landscape). Don't rename this again without a strong reason - we
went through this decision carefully.

## Architecture (why it's shaped this way)

```
scraper/   Python. Runs on GitHub Actions cron (every 4h, currently
           paused - see git log) or on demand via the Jobs page's
           "Fetch jobs now" button (admin only). Fetches the current
           companies/jobs lists from the Worker's public GET /api/companies
           and GET /api/jobs (R2-backed, not local files - see issue #7),
           polls each watched company's Workday CXS endpoint (paginated -
           see core.py), and POSTs newly found jobs to
           POST /api/scraper/sync-jobs, authenticated with a shared
           secret (SCRAPER_API_KEY) since GitHub Actions can't do an
           interactive Google sign-in. No git commit, no Pages rebuild
           needed - the frontend fetches jobs/companies from the Worker
           at runtime. A separate local_watch.py runs the same polling
           logic continuously on Abhi's own machine, writing to a local
           file and syncing via the admin-triggered /api/sync-jobs
           instead.

frontend/  React + Vite, deployed to GitHub Pages via GitHub Actions.
           UI is built on Material Dashboard React (Creative Tim, MUI-
           based) - see "UI framework" below for why, and "UI template
           reference" for the exact source URL to reuse when adding new
           pages. Multi-page via HashRouter (Jobs / Companies / Alerts /
           Admins / Applications / About), not a single page anymore.
           Reads the JSON files in public/data/. The Companies, Alerts,
           Jobs, and Admins pages have Google Sign-In admin controls, but
           the frontend NEVER decides who's authorized - it just calls
           the Worker and shows the result. Any admin-only hide/disable
           in the UI (e.g. `isAdmin`/`requireAdmin` in
           `frontend/src/lib/roles.js`) is cosmetic only, purely for UX;
           the Worker enforces the real gate regardless of what the UI
           shows.

worker/    Cloudflare Worker. This is the actual security boundary.
           Verifies the Google ID token server-side (checks it against
           Google's tokeninfo endpoint, confirms aud/email_verified/exp).
           Any verified sign-in can add its own alerts and mark jobs
           applied - no roster check at all for those. Everything else
           (companies, fetch-jobs, sync-jobs, and managing the admin
           list itself) requires the email to be an admin: the permanent
           bootstrap owner (env.ALLOWED_EMAIL - can never be locked out
           even if admins.json is missing or corrupted) or an entry in
           frontend/public/data/admins.json (a flat roster, no roles -
           being listed means admin, full stop). See the POST_ROUTES
           table in worker/src/index.js for the exact adminOnly mapping.
           Deleting an alert additionally requires owning it (an `owner`
           field stamped on creation) unless you're an admin, who can
           delete any alert. jobs.json/companies.json/alerts.json/
           applications.json all live in the DATA_BUCKET R2 binding (see
           r2GetJson/r2PutJson) - GET_ROUTES in worker/src/index.js.
           jobs/companies are public, no auth; alerts/applications are
           owner-filtered (GET /api/alerts, GET /api/applications - an
           admin token sees every entry, a non-admin token sees only its
           own, no/invalid token gets an empty list back rather than an
           error). admins.json is the one file that still goes through
           the GitHub Contents API (githubGetFile/githubPutFile), using
           a GitHub token stored as a Worker secret - deliberately, for
           its git audit trail (see "Single source of truth" below). That
           same token also dispatches scrape.yml via the GitHub Actions
           API for /api/fetch-jobs. It needs BOTH Contents: read/write
           AND Actions: read/write scopes now; it originally only had
           Contents, so fetch-jobs will 403 until the scope is widened
           (this bit Abhi once already - check before assuming it's
           set). POST /api/scraper/sync-jobs is a separate, non-Google-
           token route the scraper itself calls, authenticated by a
           shared secret (SCRAPER_API_KEY, also set as a GitHub Actions
           secret of the same name).

admin/     Local-only CLI, kept as an offline fallback for when Abhi
           doesn't want to go through the browser. Uses a hashed
           password in a git-ignored admin/token.txt.
```

**Important constraint driving this whole design:** GitHub Pages is
static-only, no server. Early in this project we considered a plain
client-side admin password, but rejected it because any secret check
done in browser JS is visible to anyone - which would be a real
liability in a portfolio piece a recruiter might actually read the
source of. The Cloudflare Worker exists specifically to keep the GitHub
write-token and the identity check server-side. Don't reintroduce
client-side secrets when adding features - route writes through the
Worker.

**Single source of truth for data - split between R2 and git,
deliberately, and that split is now permanent.** `jobs.json`,
`companies.json`, `alerts.json`, and `applications.json` all live in the
`agastya-data` R2 bucket (issue #7) - they write often (every scrape, or
whenever any signed-in user touches their own alerts/applications) and
were forcing a git commit + Pages rebuild just to publish a JSON blob,
for data with no real audit-trail value. `admins.json` is the sole
exception, staying in `frontend/public/data/` forever (read/written via
the Worker's GitHub Contents API helpers) - admin-roster changes are
rare and security-relevant: git commit history is a free audit log of
who has admin access and when that changed, which R2 doesn't give you
for free. Don't move `admins.json` to R2 "for consistency" - that's a
real feature (the audit trail) it would lose for no benefit, and don't
be surprised that `frontend/public/data/` now contains exactly one file
- that's intentional, not an oversight. `admins.json` deliberately does
NOT duplicate the bootstrap owner (`ALLOWED_EMAIL` in
`worker/wrangler.toml`) - that stays the sole source of truth for the
bootstrap account specifically, to avoid a two-sources-of-truth conflict
if they ever disagreed.

**Companies vs. Alerts:** `companies.json` (which Workday career pages
to poll - the scraper's actual data source now) is deliberately
separate from `alerts.json` (per-viewer keyword/location filters). Two
different kinds of "per-user" here, don't conflate them: *who can see or
manage a given alert* is owner-filtered and live (issue #7 - see
handleGetAlerts in worker/src/index.js). *Matching* an alert's keywords
against scraped jobs to auto-filter what that user sees on the Jobs page
is a different, still-dormant feature - every posting from a watched
company shows up on Jobs for everyone, unfiltered, regardless of anyone's
alerts. Don't merge `companies.json`/`alerts.json` back together or
delete `alerts.json` without checking with Abhi - it's intentionally
kept for that still-unbuilt keyword-matching feature.

## Known quirks (already hit and fixed once - don't rediscover these)

- **GitHub's loop-prevention used to silently break the deploy
  pipeline** (no longer applicable - resolved by removing the git
  commit entirely, not by working around it). A commit pushed using a
  workflow's own auto-generated GITHUB_TOKEN does NOT trigger other
  workflows, even when `on.push.paths` matches - this meant
  `scrape.yml`'s old commit-to-`jobs.json` step never triggered
  `deploy.yml` on its own, and it had to explicitly dispatch it via the
  Actions API. Once `jobs.json` moved to R2 (issue #7), `scrape.yml`
  stopped committing anything at all, so this workaround (and the loop-
  prevention quirk itself) no longer applies to this workflow. Worth
  remembering the underlying GitHub behavior if some *other* future
  workflow ever needs to commit data and expects Pages to pick it up
  automatically - `on.push.paths` alone isn't enough when the push comes
  from inside another workflow's own token.
- **Google Identity Services button intermittently missing.** The GSI
  script tag loads `async defer`; the original code checked for
  `window.google` exactly once, synchronously, on mount, with no
  retry - if the script hadn't loaded yet (common on a slower
  connection), sign-in silently never initialized for that whole page
  load. Fixed in `AuthContext.jsx` via `waitForGoogle()`, a poll (100ms
  interval, 10s timeout) instead of a single check. Verified directly
  by simulating the script arriving ~1.2s late and confirming the poll
  still catches it. Any future code that touches `window.google`
  directly should go through `waitForGoogle()` rather than
  reintroducing a one-shot check.

## Key decisions already made (don't redo these debates)

- **License: MIT.** Abhi may build a startup from this later, but he
  decided the code itself isn't the moat - understood that MIT doesn't
  prevent him from licensing *future* proprietary work differently,
  since he owns the copyright either way.
- **Auth: Google Sign-In**, verified server-side in the Worker. Not a
  password. This was an explicit upgrade from an earlier
  local-token-only design.
- **Auth model: any signed-in Google account gets base access; a flat
  admin roster gates everything else.** No per-resource permission
  matrix, and no separate "user" role either (tried in an earlier
  iteration, then deliberately simplified - see below). Any verified
  Google sign-in can add its own alerts and mark jobs applied, no roster
  entry needed. Managing companies, triggering/syncing scrapes, and
  managing the admin list itself require being an admin: either Abhi
  (`abhishek.wadmare@gmail.com`, `ALLOWED_EMAIL` in
  `worker/wrangler.toml`), a permanent bootstrap admin kept outside
  `admins.json` specifically so he can never be locked out even if
  `admins.json` is missing, corrupted, or emptied - don't "clean it up"
  by moving him into `admins.json` too - or an email listed in
  `admins.json`, a flat array with no role field (being listed means
  admin, full stop). Deleting an alert requires owning it (or being
  admin) - each alert gets an `owner` field stamped on creation; alerts
  seeded before that existed have no owner and are admin-only-deletable
  until recreated. We *did* originally ship a two-role "admin"/"user"
  roster (`user` = alerts + applications only, gated by being listed),
  but once any signed-in account could already do everything a "user"
  role granted, that tier became dead weight and actively misleading UI
  copy - so it was removed rather than kept around unused. Admins are
  managed via the Admins page (`frontend/src/layouts/admins/`), which
  writes to `admins.json` through the GitHub Contents API (chosen over a
  Cloudflare KV/D1 binding to keep it git-auditable - see the R2
  migration bullet below for why `admins.json` specifically keeps doing
  this even though every other data file has moved off git). The
  separate local `admin/admin_cli.py` (shared-password auth, no email
  identity) was deliberately left untouched - it's a distinct offline
  mechanism, not part of this auth model.
- **Data storage split: jobs/companies/alerts/applications in R2,
  admins.json permanently in git (issue #7).** `jobs.json` and
  `companies.json` write on every scrape; `alerts.json`/
  `applications.json` write on every user action - none of that has real
  audit-trail value, and it was forcing a git commit + Pages rebuild
  just to publish a JSON blob, so all four moved to a Cloudflare R2
  bucket (`agastya-data`, bound to the Worker as `DATA_BUCKET`).
  jobs/companies are public, no auth (`GET /api/jobs`/
  `GET /api/companies`). alerts/applications are owner-filtered
  (`GET /api/alerts`/`GET /api/applications` - admins see every entry,
  everyone else sees only entries where `owner` matches their verified
  email, no/invalid token gets an empty list) - this is what actually
  closes the privacy gap #5 opened (any Google user's search keywords
  and job-hunting activity were sitting in a public git history before
  this). This also let `scrape.yml` drop its git-commit-then-dispatch-
  deploy.yml dance entirely (see "Known quirks"), since the frontend now
  reads all four from the Worker at runtime instead of git-committed
  static files. The scraper authenticates its own writes with a shared
  secret (`SCRAPER_API_KEY`) via `POST /api/scraper/sync-jobs`, since
  GitHub Actions can't do an interactive Google sign-in. `admins.json`
  is the one file that's staying in git permanently - see the bullet
  above for why.
- **UI framework: Material Dashboard React (Creative Tim), fully
  adopted** - MUI v5 component library, theme system, and layout shell
  (Sidenav/Navbar/DashboardLayout), ported onto Vite (the template
  itself ships on Create React App, which we deliberately did not
  adopt - CRA is unmaintained, Vite needed only path aliases and a
  `regenerator-runtime` polyfill for `react-table` to make ported `.js`
  files with JSX and CRA-authored dependencies work). This was an
  explicit, deliberate decision by Abhi, made with the tradeoffs (losing
  the custom look below, adding ~10 new dependencies) spelled out first.
- **Superseded: the old forest green / saffron orange / bark brown
  palette and the two bespoke "signature" visual elements** (SweepBar's
  animated "BEARING TAKEN" sweep, the radial glow behind the header).
  These were previously documented here as deliberate and protected -
  they are now intentionally retired in favor of Material Dashboard's
  own look, not accidentally lost. Do not treat their absence as a bug
  or try to resurrect them without checking with Abhi first; this note
  exists specifically so a future session doesn't "fix" this.
- **UI template reference: reuse this, don't reinvent per feature.**
  The frontend's entire look and component library comes from
  [Material Dashboard React](https://github.com/creativetimofficial/material-dashboard-react)
  (Creative Tim, MIT licensed). When adding a new page or UI element,
  check that repo first for an existing component/pattern to port
  rather than hand-rolling new styling - that's how every page so far
  (Jobs, Companies, Alerts, Admins, Applications, About) stays visually
  consistent. Ported subset lives under `frontend/src/{assets/theme,
  assets/theme-dark, components/MD*, examples/*}` - copy from the
  template's matching path when you need something not already ported
  (e.g. a chart or a card variant), rather than designing from scratch.
  The exact write-up of what's ported vs. skipped, and the CRA-to-Vite
  adaptation notes (path aliases, `regenerator-runtime` polyfill,
  Material Icons font is the *Rounded* variant not the classic one) are
  in the commit that did the migration - `git log --oneline --grep
  Material` if you need the full reasoning.
- **Does not scrape LinkedIn.** Deliberate scope decision - LinkedIn's
  ToS prohibits it and risks account suspension. Workday's endpoint is
  public/unauthenticated by design, which is a materially different
  situation. Don't add LinkedIn scraping later without flagging this
  tension explicitly.

## Git workflow (adopted 2026-07-06)

Every change up to this point was a direct push to `main`. Going
forward, this repo follows **GitHub Flow** (the actual name of this
practice - distinct from the heavier, mostly-legacy "Git Flow" with
`develop`/`release`/`hotfix` branches):

1. Branch off `main` per change, open a PR (draft if still WIP), let CI
   run, self-review the diff, squash-merge, delete the branch.
2. **Branch naming**: `<type>/<issue-number>-<short-slug>` when there's
   a backing issue (`fix/1-sign-in-persist`), or `<type>/<short-slug>`
   when there isn't (`chore/bump-vite`). One logical change per
   branch/PR, not one PR per commit.
3. Commit prefixes already in use (`feat:`/`fix:`/`docs:`/`chore:`) are
   the **Conventional Commits** convention.
4. Every PR uses `.github/PULL_REQUEST_TEMPLATE.md` (What & why /
   related issue / screenshots if UI changed / how to verify) - kept
   short on purpose so it actually gets filled in.
5. `.github/workflows/ci.yml` runs `npm run build` on every PR against
   `main` - this is what branch protection's "require status checks"
   points at.

**The backlog is just "open Issues"** - GitHub has no separate backlog
object. When a feature idea comes up in conversation and we agree it's
worth doing, it gets filed as an Issue right then (even loosely
detailed) rather than staying only in chat history - that issue *is*
the backlog entry, refined via comments later if needed. Big
features/real bugs get an Issue first, then a branch named after it,
then a PR that references it (`Fixes #N`) so it auto-closes on merge -
the pattern used for #1/#2. Small stuff (typo, dependency bump, minor
copy change) skips the Issue - just branch + PR directly.

Branch protection on `main` is enabled (require PR before merge,
require the CI check) with a **bypass list scoped to "Repository
admin" only** - this is deliberate, not a hole in the rule. The app's
own automated writes still commit directly to `main` outside any PR,
via the GitHub Contents API - but as of issue #7, that's down to just
admin-roster writes (add-admin, remove-admin). A "no bypass for anyone"
rule would have blocked those identically to a human's direct push -
GitHub can't tell "routine automated data write" apart from "code
change that skipped review" on its own. The Worker's GitHub token (and
`admin/admin_cli.py`'s local git access) already authenticates as the
repo admin, so the bypass list covers these for free. Every other data
write - jobs/companies (scraper sync, add/delete-company) and now
alerts/applications too (add/delete-alert, mark-applied) - no longer
touches git at all; they're all R2-backed, so `scrape.yml` dropped its
old `secrets.ADMIN_PAT`-authenticated checkout + `git push` entirely (it
used to need an admin-bypass-eligible identity for that push; it
doesn't push anything now). `ADMIN_PAT`/the Worker's `GITHUB_TOKEN` are
still the same underlying PAT, still needed for the one remaining
Contents API write path (admins.json) and for dispatching `scrape.yml`
via the Actions API. Branch protection here enforces discipline for
*code* changes; it is not, and
can't be, a hard technical lock on every write to `main` given this
architecture - don't try to tighten it further without re-checking this
reasoning first.

One real limitation: Claude Code can create and push branches via git
directly, but can't open the actual Pull Request without `gh` CLI auth
or a GitHub API token (same blocker hit when creating Issues #1/#2) -
Abhi opens the PR himself via the link GitHub shows after a branch is
pushed, or sets up `gh auth login` once to unblock full automation.

Know these exist for interview purposes, even though they're not
adopted here (single-maintainer repo doesn't need them yet): **GitHub
Projects** (a Kanban board layered on top of Issues), **CODEOWNERS**
files (auto-request specific reviewers per path), **Dependabot**
(automated dependency-update PRs), **semantic-release** (auto-versioning
from Conventional Commits), **GitHub Discussions** (for open-ended
"should we even do this" conversations, one level before an Issue -
mainly pays off with multiple contributors).

## Current state / what's been tested

- Repo is live and pushed: github.com/abhishekwadmare/agastya
- GitHub Pages deployed and working: abhishekwadmare.github.io/agastya/
- Google OAuth client created and wired in
- Cloudflare Worker deployed (agastya-admin.abhishekwadmare.workers.dev)
  and confirmed working end-to-end (originally: sign-in -> add company
  -> commit appears in repo -> Fetch jobs now -> scrape.yml runs ->
  deploy.yml rebuilds Pages -> live site shows real postings, 222 from
  Red Hat). Since issue #7, add-company/Fetch-jobs no longer touch git
  or trigger a Pages rebuild at all - they write straight to the
  `agastya-data` R2 bucket, which the live site reads at runtime via
  `GET /api/companies`/`GET /api/jobs`
- Known-good example company/alert values (Red Hat): tenant=`redhat`,
  host=`wd5`, site=`jobs` - useful as a reference for testing, since we
  hit and fixed a real bug here (site field was getting a full URL
  pasted into it instead of the short segment, and the host defaulted
  to wd1 when Red Hat actually uses wd5)
- Added a "paste a Workday URL" parser (`parseWorkdayUrl`, in
  `frontend/src/lib/parseWorkdayUrl.js`, used from both the Companies
  and Alerts pages) specifically to prevent that class of mistake
  happening again
- `location_filter` was defined in the data model early on but the
  scraper silently never applied it - this has been fixed on the (now
  dormant) alert path, but if you're auditing for similar dead fields,
  check for others
- Pagination confirmed working against Red Hat's real tenant: fetched
  222 postings, not just the old 20-job-per-company cap
- Field names in `normalize_job_from_company()` (jobPostings,
  externalPath, postedOn, locationsText) are the documented Workday CXS
  shape but haven't been verified against every company Abhi cares
  about beyond Red Hat (MongoDB, Cisco, Workday, Arista, Dolby, Bending
  Spoons)

## Open items / likely next asks

- Auto-parse the Workday URL on paste instead of requiring a button
  click (was requested, not yet implemented)
- No "edit" for alerts, companies, or admins - only add/delete. Editing
  currently means delete + re-add.
- Telegram notifications are wired but need TELEGRAM_BOT_TOKEN /
  TELEGRAM_CHAT_ID secrets set in GitHub Actions to actually fire -
  check whether Abhi has done this yet before assuming it's live

## How Abhi likes to work

Prefers being walked through infra/deploy steps one at a time rather
than a wall of instructions up front, and pastes real terminal/browser
screenshots when something breaks rather than describing the error in
words - read those literally, the actual error text is more reliable
than a paraphrase. Appreciates being told directly when something he
proposes has a real security or practical tradeoff, rather than being
told everything's fine.
