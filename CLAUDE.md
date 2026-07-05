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
scraper/   Python. Runs on GitHub Actions cron (every 4h). Polls each
           alert's Workday CXS endpoint, matches title + location
           against keyword/location rules, writes new jobs into
           frontend/public/data/jobs.json, commits back to the repo.

frontend/  React + Vite, deployed to GitHub Pages via GitHub Actions.
           UI is built on Material Dashboard React (Creative Tim, MUI-
           based) - see "UI framework" below for why. Multi-page via
           HashRouter (Jobs / Alerts / Applications), not a single page
           anymore. Reads the JSON files in public/data/. The Alerts
           page has the Google Sign-In admin controls, but the frontend
           NEVER decides who's authorized - it just calls the Worker and
           shows the result.

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
`alerts.json`, `applications.json`) lives in ONE place:
`frontend/public/data/`. We deliberately removed an earlier separate
`data/` folder and its sync step - don't reintroduce a second copy.

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
- Known-good example alert values (Red Hat): tenant=`redhat`,
  host=`wd5`, site=`jobs` - useful as a reference for testing, since we
  hit and fixed a real bug here (site field was getting a full URL
  pasted into it instead of the short segment, and the host defaulted
  to wd1 when Red Hat actually uses wd5)
- Added a "paste a Workday URL" parser in the add-alert form
  (`parseWorkdayUrl`, now in `frontend/src/lib/parseWorkdayUrl.js`,
  used from `frontend/src/layouts/alerts/index.jsx`) specifically to
  prevent that class of mistake happening again
- `location_filter` was defined in the data model early on but the
  scraper silently never applied it - this has been fixed, but if
  you're auditing for similar dead fields, check for others
- Not yet tested against a live tenant beyond Red Hat - field names in
  `normalize_job()` (jobPostings, externalPath, postedOn, locationsText)
  are the documented Workday CXS shape but haven't been verified against
  every company Abhi cares about (MongoDB, Cisco, Workday, Arista,
  Dolby, Bending Spoons)

## Open items / likely next asks

- Auto-parse the Workday URL on paste instead of requiring a button
  click (was requested, not yet implemented)
- No "edit alert" - only add/delete. Editing currently means delete +
  re-add.
- No pagination/offset handling in the scraper beyond the first page of
  results per company (PAGE_SIZE=20)
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
