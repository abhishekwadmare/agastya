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
           paused - see git log). Polls each watched company's Workday
           CXS endpoint (companies.json, paginated - see below), writes
           new jobs into frontend/public/data/jobs.json unfiltered,
           commits back to the repo. A separate local_watch.py runs the
           same logic continuously on Abhi's own machine instead.

frontend/  React + Vite, deployed to GitHub Pages via GitHub Actions.
           UI is built on Material Dashboard React (Creative Tim, MUI-
           based) - see "UI framework" below for why, and "UI template
           reference" for the exact source URL to reuse when adding new
           pages. Multi-page via HashRouter (Jobs / Companies / Alerts /
           Applications / About), not a single page anymore. Reads the
           JSON files in public/data/. The Companies and Alerts pages
           have Google Sign-In admin controls, but the frontend NEVER
           decides who's authorized - it just calls the Worker and shows
           the result.

worker/    Cloudflare Worker. This is the actual security boundary.
           Verifies the Google ID token server-side (checks it against
           Google's tokeninfo endpoint, confirms aud/email/email_verified/
           exp), and only if the email matches ALLOWED_EMAIL does it
           write to the GitHub repo via the Contents API, using a
           GitHub token stored as a Worker secret.

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

**Single source of truth for data:** all JSON data (`jobs.json`,
`alerts.json`, `companies.json`, `applications.json`) lives in ONE
place: `frontend/public/data/`. We deliberately removed an earlier
separate `data/` folder and its sync step - don't reintroduce a second
copy.

**Companies vs. Alerts:** `companies.json` (which Workday career pages
to poll - the scraper's actual data source now) is deliberately
separate from `alerts.json` (per-viewer keyword/location filters,
currently dormant/unused by the scraper). This split exists because
filtering-by-individual-user is a deferred future feature; right now
every posting from a watched company shows up on Jobs, unfiltered.
Don't merge these back together or delete `alerts.json` without
checking with Abhi - it's intentionally kept for that later feature.

## Key decisions already made (don't redo these debates)

- **License: MIT.** Abhi may build a startup from this later, but he
  decided the code itself isn't the moat - understood that MIT doesn't
  prevent him from licensing *future* proprietary work differently,
  since he owns the copyright either way.
- **Auth: Google Sign-In, restricted to abhishek.wadmare@gmail.com**,
  verified server-side in the Worker. Not a password. This was an
  explicit upgrade from an earlier local-token-only design.
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
  (Jobs, Companies, Alerts, Applications, About) stays visually
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

## Current state / what's been tested

- Repo is live and pushed: github.com/abhishekwadmare/agastya
- GitHub Pages deployed and working: abhishekwadmare.github.io/agastya/
- Google OAuth client created and wired in
- Cloudflare Worker deployed (agastya-admin.abhishekwadmare.workers.dev)
  and confirmed working end-to-end: sign-in -> add alert -> commit
  appears in repo
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
- No "edit" for alerts or companies - only add/delete. Editing
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
