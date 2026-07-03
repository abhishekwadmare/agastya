# Agastya

A self-hosted job alert system that monitors Workday-hosted company career
pages directly (rather than waiting for LinkedIn/Indeed syndication),
surfaces new postings on a public dashboard, and sends Telegram
notifications. Adding/deleting alerts on the live site requires signing
in with a specific Google account - enforced server-side, not just in the
browser.

## Architecture

```
scraper/   Python, runs on a GitHub Actions cron schedule. Polls each
           tracked company's public Workday JSON API, writes matches into
           frontend/public/data/jobs.json, commits the change.

frontend/  React (Vite), deployed to GitHub Pages. Reads the JSON files
           and displays them. Includes a "Sign in with Google" admin
           panel - but the frontend itself never decides who's allowed
           to write anything; it just calls the Worker and shows the
           result.

worker/    A Cloudflare Worker. Verifies the Google ID token it receives,
           checks the token's email against ALLOWED_EMAIL, and only then
           writes to the GitHub repo using a GitHub token stored as a
           Worker secret. This is the actual security boundary.

admin/     A local-only CLI, kept as an offline fallback. Uses a hashed
           password in a git-ignored token.txt. Useful if you want to
           make changes without going through the browser at all.
```

Nothing sensitive - no GitHub token, no password - is ever present in the
deployed frontend bundle. The Google client ID and Worker URL in
`frontend/src/config.js` are meant to be public.

## 1. Google OAuth client (for Sign-In)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) →
   APIs & Services → Credentials.
2. Create an OAuth 2.0 Client ID, type "Web application".
3. Under **Authorized JavaScript origins**, add your GitHub Pages URL,
   e.g. `https://<your-username>.github.io`.
4. Copy the client ID - you'll need it in two places (step 4 and step 6).

## 2. GitHub repo + a scoped token for the Worker

1. Push this project to a new GitHub repo.
2. Create a **fine-grained personal access token**
   (Settings → Developer settings → Fine-grained tokens) scoped to just
   this repo, with **Contents: read and write** permission and nothing
   else.

## 3. Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login
```

Edit `worker/wrangler.toml`:
- `ALLOWED_EMAIL` - already set to abhishek.wadmare@gmail.com
- `GOOGLE_CLIENT_ID` - paste the client ID from step 1
- `GITHUB_OWNER` - your GitHub username
- `GITHUB_REPO` - your repo name

Then:

```bash
npx wrangler secret put GITHUB_TOKEN
# paste the fine-grained PAT from step 2 when prompted

npm run deploy
```

Wrangler will print your Worker's URL, something like
`https://agastya-admin.<your-subdomain>.workers.dev`.

## 4. Point the frontend at your Worker and Google client

Edit `frontend/src/config.js`:

```js
export const GOOGLE_CLIENT_ID = "<paste from step 1>";
export const WORKER_BASE_URL = "<paste your Worker URL from step 3>";
```

Commit and push - this triggers `deploy.yml`, which builds and publishes
to GitHub Pages.

## 5. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

## 6. Find your target companies' Workday details

Not every company uses Workday - check by visiting their careers page. If
the URL looks like `https://<tenant>.wd1.myworkdayjobs.com/<site>/...`,
you're good. Note the `wd1` part - it's sometimes `wd3`, `wd5`, etc; the
scraper currently assumes `wd1` (edit `scraper/scrape.py`'s
`workday_host` default if a company uses a different one).

## 7. Add your first alert

Once deployed, visit your live site, click **Sign in with Google**, sign
in as the allowed email, and use the admin panel to add and delete
alerts directly from the browser. Changes are committed to the repo by
the Worker within a few seconds.

## 8. (Optional) Telegram notifications

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`,
   copy the token it gives you.
2. Message [@userinfobot](https://t.me/userinfobot) to get your numeric
   chat ID.
3. In your repo: **Settings → Secrets and variables → Actions**, add:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

## 9. Run the scraper manually the first time

**Actions tab → Scrape jobs → Run workflow.** After that it runs
automatically every 4 hours (edit the cron in
`.github/workflows/scrape.yml` to change the frequency).

## Offline / local admin fallback

If you'd rather not go through the browser:

```bash
python admin/set_token.py          # run once, creates admin/token.txt (git-ignored)
python admin/admin_cli.py add-alert
python admin/admin_cli.py delete-alert --id <alert-id>   # requires the password
python admin/admin_cli.py mark-applied --job-id "<id>"
```

Then commit and push `frontend/public/data/` yourself.

## Local development

```bash
cd frontend
npm install
npm run dev
```

## Notes on scope

This deliberately does not scrape LinkedIn. LinkedIn's Terms of Service
prohibit automated scraping, and detection risks account suspension.
Workday's job search endpoint is a public, unauthenticated JSON API
designed to be consumed by the career site's own frontend, which is a
materially different situation.

## License

MIT - see [LICENSE](./LICENSE).
