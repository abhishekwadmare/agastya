#!/usr/bin/env python3
"""
Agastya scraper
-----------------
Polls Workday-hosted career sites' public JSON API for each company
defined in data/alerts.json, matches new postings against keyword
rules, and writes results into data/jobs.json.

Workday career sites expose an unauthenticated JSON endpoint at:
    https://{tenant}.wd1.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
(the "wd1" subdomain sometimes differs - wd1, wd3, wd5 etc. Check the
company's actual careers URL in a browser to confirm.)

This script only reads public, unauthenticated data - no login walls,
no bypassing bot protections.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"
ALERTS_FILE = DATA_DIR / "alerts.json"
JOBS_FILE = DATA_DIR / "jobs.json"

REQUEST_TIMEOUT = 15
REQUEST_DELAY_SECONDS = 2  # be polite between requests
PAGE_SIZE = 20


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def fetch_workday_jobs(tenant, site, wd_host="wd1", limit=PAGE_SIZE):
    """
    Fetch job postings from a Workday CXS endpoint.
    Returns a list of raw job dicts from Workday's response.
    """
    url = f"https://{tenant}.{wd_host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
    payload = {"limit": limit, "offset": 0, "searchText": ""}
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Agastya/1.0; personal-use-job-alert-bot)",
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data.get("jobPostings", [])


def matches_alert(job_title, alert):
    title_lower = job_title.lower()
    keywords_any = [k.lower() for k in alert.get("keywords_any", [])]
    keywords_exclude = [k.lower() for k in alert.get("keywords_exclude", [])]

    if keywords_any and not any(k in title_lower for k in keywords_any):
        return False
    if any(k in title_lower for k in keywords_exclude):
        return False
    return True


def normalize_job(raw_job, alert, tenant, site, wd_host):
    """Turn a raw Workday job posting into our internal job record."""
    external_path = raw_job.get("externalPath", "")
    job_id = f"{tenant}:{external_path}"
    apply_url = f"https://{tenant}.{wd_host}.myworkdayjobs.com/{site}{external_path}"

    return {
        "id": job_id,
        "alert_id": alert["id"],
        "company": alert["company"],
        "title": raw_job.get("title", "Untitled"),
        "location": raw_job.get("locationsText", "Unspecified"),
        "posted_on": raw_job.get("postedOn", ""),
        "apply_url": apply_url,
        "first_seen": datetime.now(timezone.utc).isoformat(),
    }


def run():
    if not ALERTS_FILE.exists():
        print(f"No alerts file found at {ALERTS_FILE}", file=sys.stderr)
        sys.exit(1)

    alerts_data = load_json(ALERTS_FILE)
    jobs_data = load_json(JOBS_FILE) if JOBS_FILE.exists() else {"last_scraped": None, "jobs": []}

    existing_ids = {job["id"] for job in jobs_data["jobs"]}
    new_jobs = []

    for alert in alerts_data.get("alerts", []):
        tenant = alert.get("workday_tenant")
        site = alert.get("workday_site")
        wd_host = alert.get("workday_host", "wd1")

        if not tenant or not site:
            print(f"Skipping alert '{alert.get('id')}': missing workday_tenant/workday_site")
            continue

        print(f"Checking {alert['company']} ({tenant}/{site})...")
        try:
            raw_jobs = fetch_workday_jobs(tenant, site, wd_host)
        except requests.RequestException as e:
            print(f"  Failed to fetch {alert['company']}: {e}", file=sys.stderr)
            continue

        for raw_job in raw_jobs:
            title = raw_job.get("title", "")
            if not matches_alert(title, alert):
                continue

            normalized = normalize_job(raw_job, alert, tenant, site, wd_host)
            if normalized["id"] in existing_ids:
                continue  # already seen in a previous run

            new_jobs.append(normalized)
            existing_ids.add(normalized["id"])

        time.sleep(REQUEST_DELAY_SECONDS)

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
