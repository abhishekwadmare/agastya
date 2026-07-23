#!/usr/bin/env python3
"""
Agastya scraper
-----------------
Runs on GitHub Actions cron. Polls each watched company's Workday
endpoint (see core.py) and pushes newly found postings to the Worker's
R2-backed jobs.json via POST /api/scraper/sync-jobs (see issue #7 - this
used to write frontend/public/data/jobs.json locally and git-commit it,
which forced a Pages rebuild just to publish a JSON blob).

Still writes the merged result to a local JOBS_FILE too, purely so
notify.py (the next step in the same Actions job) can read the newly-
added jobs to compose Telegram messages - that file is never committed.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

from core import find_new_jobs_for_companies, save_json

REPO_ROOT = Path(__file__).resolve().parent.parent
JOBS_FILE = REPO_ROOT / "frontend" / "public" / "data" / "jobs.json"

WORKER_BASE_URL = os.environ.get(
    "WORKER_BASE_URL", "https://agastya-admin.abhishekwadmare.workers.dev"
)
REQUEST_TIMEOUT = 15


def write_new_jobs_count(count):
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"new_jobs_count={count}\n")


def run():
    scraper_key = os.environ.get("SCRAPER_API_KEY")
    if not scraper_key:
        print("SCRAPER_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    settings_resp = requests.get(f"{WORKER_BASE_URL}/api/settings", timeout=REQUEST_TIMEOUT)
    settings_resp.raise_for_status()
    scrape_frequency_hours = settings_resp.json().get("scrape_frequency_hours", 4)

    jobs_resp = requests.get(f"{WORKER_BASE_URL}/api/jobs", timeout=REQUEST_TIMEOUT)
    jobs_resp.raise_for_status()
    jobs_data = jobs_resp.json()

    last_scraped = jobs_data.get("last_scraped")
    if last_scraped:
        hours_since = (datetime.now(timezone.utc) - datetime.fromisoformat(last_scraped)).total_seconds() / 3600
        if hours_since < scrape_frequency_hours:
            print(
                f"Last scraped {hours_since:.1f}h ago, due every {scrape_frequency_hours}h - not due yet, skipping."
            )
            write_new_jobs_count(0)
            return

    companies_resp = requests.get(f"{WORKER_BASE_URL}/api/companies", timeout=REQUEST_TIMEOUT)
    companies_resp.raise_for_status()
    companies_data = companies_resp.json()

    existing_ids = {job["id"] for job in jobs_data["jobs"]}
    new_jobs = find_new_jobs_for_companies(companies_data, existing_ids)

    if new_jobs:
        print(f"Found {len(new_jobs)} new job(s).")
    else:
        print("No new jobs this run.")

    # POST unconditionally, even with an empty list - mergeJobsIntoR2
    # (worker/src/index.js) always stamps last_scraped on every call, and
    # the frequency check above depends on that timestamp reliably
    # advancing on every real attempt, not just ones that found something.
    sync_resp = requests.post(
        f"{WORKER_BASE_URL}/api/scraper/sync-jobs",
        headers={"X-Scraper-Key": scraper_key},
        json={"jobs": new_jobs},
        timeout=REQUEST_TIMEOUT,
    )
    sync_resp.raise_for_status()
    if new_jobs:
        print(f"Synced {sync_resp.json().get('added', len(new_jobs))} new job(s) to the Worker.")

    jobs_data["jobs"] = new_jobs + jobs_data["jobs"]
    jobs_data["last_scraped"] = datetime.now(timezone.utc).isoformat()
    save_json(JOBS_FILE, jobs_data)

    write_new_jobs_count(len(new_jobs))


if __name__ == "__main__":
    run()
