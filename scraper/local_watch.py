#!/usr/bin/env python3
"""
Agastya local watcher
---------------------
Runs continuously on your own machine (not GitHub Actions), polling the
same Workday endpoints as scrape.py but on a configurable interval,
writing results to a local JSON file instead of committing to git, and
firing desktop + Telegram notifications for new postings.

Alert rules and the initial "already seen" baseline are always pulled
fresh from the live repo on GitHub rather than a local git clone, so
this stays in sync with whatever's configured in the admin panel
without needing a git pull. After the first run, the local output file
itself becomes the "already seen" record - the live jobs.json is never
touched again, since this script only writes locally.

Configure via a .env file in this directory - see .env.example.
"""

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

from core import find_new_jobs, load_json, save_json
from notify import send_telegram_message

try:
    from plyer import notification as desktop_notification
except ImportError:
    desktop_notification = None

load_dotenv()

REQUEST_TIMEOUT = 15
MIN_INTERVAL_MINUTES = 20

LIVE_DATA_BASE_URL = os.environ.get(
    "AGASTYA_LIVE_DATA_BASE_URL",
    "https://raw.githubusercontent.com/abhishekwadmare/agastya/main/frontend/public/data",
)
POLL_INTERVAL_MINUTES = max(
    MIN_INTERVAL_MINUTES, int(os.environ.get("AGASTYA_POLL_INTERVAL_MINUTES", "30"))
)
OUTPUT_PATH = Path(
    os.environ.get("AGASTYA_LOCAL_OUTPUT_PATH", str(Path.home() / "Downloads" / "agastya-jobs.json"))
)
DESKTOP_NOTIFICATIONS_ENABLED = os.environ.get("AGASTYA_DESKTOP_NOTIFICATIONS", "true").lower() != "false"
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")


def fetch_live_json(filename):
    url = f"{LIVE_DATA_BASE_URL}/{filename}"
    resp = requests.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def seed_local_jobs_file():
    """On first run, seed the local output file from the live jobs.json so
    we don't flood notifications for postings that are already known."""
    if OUTPUT_PATH.exists():
        return load_json(OUTPUT_PATH)

    print(f"No local jobs file yet at {OUTPUT_PATH} - seeding from the live site...")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        jobs_data = fetch_live_json("jobs.json")
    except requests.RequestException as e:
        print(f"Could not fetch live jobs.json ({e}); starting from an empty baseline.", file=sys.stderr)
        jobs_data = {"last_scraped": None, "jobs": []}

    save_json(OUTPUT_PATH, jobs_data)
    return jobs_data


def notify_new_job(job):
    title = f"{job['company']}: {job['title']}"
    body = f"{job['location']}\n{job['apply_url']}"

    if DESKTOP_NOTIFICATIONS_ENABLED and desktop_notification is not None:
        try:
            desktop_notification.notify(title=title, message=body, timeout=10)
        except Exception as e:
            print(f"Desktop notification failed: {e}", file=sys.stderr)

    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            send_telegram_message(
                TELEGRAM_BOT_TOKEN,
                TELEGRAM_CHAT_ID,
                f"\U0001F195 <b>{job['title']}</b>\n{job['company']} — {job['location']}\n{job['apply_url']}",
            )
        except requests.RequestException as e:
            print(f"Telegram notification failed: {e}", file=sys.stderr)


def run_cycle(jobs_data):
    try:
        alerts_data = fetch_live_json("alerts.json")
    except requests.RequestException as e:
        print(f"Could not fetch live alerts.json ({e}); skipping this cycle.", file=sys.stderr)
        return jobs_data

    existing_ids = {job["id"] for job in jobs_data["jobs"]}
    new_jobs = find_new_jobs(alerts_data, existing_ids)

    if new_jobs:
        print(f"Found {len(new_jobs)} new matching job(s).")
        jobs_data["jobs"] = new_jobs + jobs_data["jobs"]
        jobs_data["last_scraped"] = datetime.now(timezone.utc).isoformat()
        save_json(OUTPUT_PATH, jobs_data)
        for job in new_jobs:
            notify_new_job(job)
    else:
        print("No new matching jobs this cycle.")

    return jobs_data


def run():
    if DESKTOP_NOTIFICATIONS_ENABLED and desktop_notification is None:
        print(
            "plyer not installed - desktop notifications disabled "
            "(pip install -r requirements-local.txt)",
            file=sys.stderr,
        )

    print(
        f"Agastya local watcher starting - polling every {POLL_INTERVAL_MINUTES} min, "
        f"writing to {OUTPUT_PATH}"
    )
    jobs_data = seed_local_jobs_file()

    try:
        while True:
            jobs_data = run_cycle(jobs_data)
            time.sleep(POLL_INTERVAL_MINUTES * 60)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    run()
