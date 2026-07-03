#!/usr/bin/env python3
"""
Sends a Telegram message for each newly-discovered job in data/jobs.json.
Only notifies about jobs with first_seen matching this run - the workflow
calls this immediately after scrape.py, so "new" = added in the last run.

Requires two GitHub Actions secrets:
  TELEGRAM_BOT_TOKEN  - from @BotFather
  TELEGRAM_CHAT_ID    - your personal chat id (message @userinfobot to find it)
"""

import json
import os
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
JOBS_FILE = REPO_ROOT / "frontend" / "public" / "data" / "jobs.json"


def send_telegram_message(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    resp = requests.post(
        url,
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": False},
        timeout=15,
    )
    resp.raise_for_status()


def run():
    new_jobs_count = int(os.environ.get("NEW_JOBS_COUNT", "0"))
    if new_jobs_count == 0:
        print("No new jobs to notify about.")
        return

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set, skipping notification.", file=sys.stderr)
        return

    with open(JOBS_FILE, "r", encoding="utf-8") as f:
        jobs_data = json.load(f)

    new_jobs = jobs_data["jobs"][:new_jobs_count]

    for job in new_jobs:
        text = (
            f"🆕 <b>{job['title']}</b>\n"
            f"{job['company']} — {job['location']}\n"
            f"{job['apply_url']}"
        )
        send_telegram_message(token, chat_id, text)

    print(f"Sent {len(new_jobs)} Telegram notification(s).")


if __name__ == "__main__":
    run()
