#!/usr/bin/env python3
"""
Agastya admin CLI - local only.

NOTE: all three commands below depend on local copies of alerts.json/
jobs.json/applications.json that no longer exist - those files moved to
a Cloudflare R2 bucket as of issue #7, read/written only through the
Worker now. This tool was deliberately left pointed at the old local
files rather than repointed at the Worker/R2 (it's a low-stakes offline
fallback, not worth the added complexity of giving it real API access) -
every command below will print a clear error and exit rather than
silently diverging from the live site. Use the web UI instead.

Add an alert (no password needed - low risk action):
    python admin/admin_cli.py add-alert

Delete an alert (requires admin password):
    python admin/admin_cli.py delete-alert --id workday-swe

Mark a job as applied (no password needed):
    python admin/admin_cli.py mark-applied --job-id "workday:/en-US/Workday/job/..."
"""

import argparse
import getpass
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILE = Path(__file__).resolve().parent / "token.txt"
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"
ALERTS_FILE = DATA_DIR / "alerts.json"
APPLICATIONS_FILE = DATA_DIR / "applications.json"
JOBS_FILE = DATA_DIR / "jobs.json"


def hash_password(password: str) -> str:
    salt = "agastya-local-salt"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def require_admin():
    if not TOKEN_FILE.exists():
        print("No admin token set up yet. Run: python admin/set_token.py", file=sys.stderr)
        sys.exit(1)

    expected_hash = TOKEN_FILE.read_text(encoding="utf-8").strip()
    password = getpass.getpass("Admin password: ")
    if hash_password(password) != expected_hash:
        print("Incorrect password. Aborting.", file=sys.stderr)
        sys.exit(1)


def require_local_file(path, hint):
    # alerts.json/jobs.json/applications.json all moved to R2 (issue #7)
    # - this offline CLI was deliberately left pointed at the old local
    # files rather than repointed at the Worker/R2, so every command
    # here fails clearly instead of silently diverging from the live
    # site or crashing with a raw traceback.
    if not path.exists():
        print(
            f"{path.relative_to(REPO_ROOT)} no longer exists locally - that data "
            f"moved to R2. {hint}",
            file=sys.stderr,
        )
        sys.exit(1)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def cmd_add_alert(args):
    require_local_file(ALERTS_FILE, "Use the live Alerts page instead.")
    alerts_data = load_json(ALERTS_FILE)

    alert_id = input("Alert id (short, unique, e.g. 'mongodb-swe'): ").strip()
    company = input("Company display name: ").strip()
    tenant = input("Workday tenant (subdomain before .wdN.myworkdayjobs.com): ").strip()
    host = input("Workday host, e.g. wd1, wd3, wd5 (check the real careers URL) [wd1]: ").strip() or "wd1"
    site = input("Workday career site name (short segment, not a full URL): ").strip()
    keywords_any = input("Keywords to match, comma separated: ").strip()
    keywords_exclude = input("Keywords to exclude, comma separated (optional): ").strip()
    location_filter = input("Location filter (optional, free text): ").strip()

    new_alert = {
        "id": alert_id,
        "company": company,
        "workday_tenant": tenant,
        "workday_host": host,
        "workday_site": site,
        "keywords_any": [k.strip() for k in keywords_any.split(",") if k.strip()],
        "keywords_exclude": [k.strip() for k in keywords_exclude.split(",") if k.strip()],
        "location_filter": location_filter,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if any(a["id"] == alert_id for a in alerts_data["alerts"]):
        print(f"Alert id '{alert_id}' already exists. Choose a different id.", file=sys.stderr)
        sys.exit(1)

    alerts_data["alerts"].append(new_alert)
    save_json(ALERTS_FILE, alerts_data)
    print(f"Added alert '{alert_id}'. Now commit and push to sync the live site.")


def cmd_delete_alert(args):
    require_admin()
    require_local_file(ALERTS_FILE, "Use the live Alerts page instead.")
    alerts_data = load_json(ALERTS_FILE)

    before = len(alerts_data["alerts"])
    alerts_data["alerts"] = [a for a in alerts_data["alerts"] if a["id"] != args.id]
    after = len(alerts_data["alerts"])

    if before == after:
        print(f"No alert found with id '{args.id}'.", file=sys.stderr)
        sys.exit(1)

    save_json(ALERTS_FILE, alerts_data)
    print(f"Deleted alert '{args.id}'. Now commit and push to sync the live site.")


def cmd_mark_applied(args):
    require_local_file(JOBS_FILE, "Use the Apply button on the live Jobs page instead.")
    applications_data = load_json(APPLICATIONS_FILE) if APPLICATIONS_FILE.exists() else {"applications": []}
    jobs_data = load_json(JOBS_FILE)

    job = next((j for j in jobs_data["jobs"] if j["id"] == args.job_id), None)
    if not job:
        print(f"No job found with id '{args.job_id}' in data/jobs.json.", file=sys.stderr)
        sys.exit(1)

    if any(a["job_id"] == args.job_id for a in applications_data["applications"]):
        print("Already marked as applied.")
        return

    applications_data["applications"].append({
        "job_id": job["id"],
        "title": job["title"],
        "company": job["company"],
        "apply_url": job["apply_url"],
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "status": "applied",
    })

    save_json(APPLICATIONS_FILE, applications_data)
    print(f"Marked '{job['title']}' at {job['company']} as applied.")


def main():
    parser = argparse.ArgumentParser(description="Agastya admin CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("add-alert", help="Add a new company/keyword alert (no password required)")

    p_delete = sub.add_parser("delete-alert", help="Delete an alert (requires admin password)")
    p_delete.add_argument("--id", required=True, help="Alert id to delete")

    p_applied = sub.add_parser("mark-applied", help="Mark a job as applied (no password required)")
    p_applied.add_argument("--job-id", required=True, help="Job id from data/jobs.json")

    args = parser.parse_args()

    if args.command == "add-alert":
        cmd_add_alert(args)
    elif args.command == "delete-alert":
        cmd_delete_alert(args)
    elif args.command == "mark-applied":
        cmd_mark_applied(args)


if __name__ == "__main__":
    main()