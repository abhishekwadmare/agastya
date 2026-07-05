#!/usr/bin/env python3
"""
Agastya scraper
-----------------
Runs on GitHub Actions cron. Polls each alert's Workday endpoint (see
core.py) and writes newly matched postings into data/jobs.json.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from core import find_new_jobs, load_json, save_json

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"
ALERTS_FILE = DATA_DIR / "alerts.json"
JOBS_FILE = DATA_DIR / "jobs.json"


def run():
    if not ALERTS_FILE.exists():
        print(f"No alerts file found at {ALERTS_FILE}", file=sys.stderr)
        sys.exit(1)

    alerts_data = load_json(ALERTS_FILE)
    jobs_data = load_json(JOBS_FILE) if JOBS_FILE.exists() else {"last_scraped": None, "jobs": []}

    existing_ids = {job["id"] for job in jobs_data["jobs"]}
    new_jobs = find_new_jobs(alerts_data, existing_ids)

    if new_jobs:
        print(f"Found {len(new_jobs)} new matching job(s).")
        jobs_data["jobs"] = new_jobs + jobs_data["jobs"]
    else:
        print("No new matching jobs this run.")

    jobs_data["last_scraped"] = datetime.now(timezone.utc).isoformat()
    save_json(JOBS_FILE, jobs_data)

    # Write GITHUB_OUTPUT for the Actions workflow to know if there's anything new
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"new_jobs_count={len(new_jobs)}\n")


if __name__ == "__main__":
    run()
