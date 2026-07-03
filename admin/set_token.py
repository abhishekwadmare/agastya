#!/usr/bin/env python3
"""
Run this ONCE locally to create your admin token.txt file.
This file is git-ignored and never leaves your machine.

Usage:
    python admin/set_token.py
"""

import getpass
import hashlib
from pathlib import Path

TOKEN_FILE = Path(__file__).resolve().parent / "token.txt"


def hash_password(password: str) -> str:
    # Simple salted SHA-256. Good enough for a local single-user admin
    # gate - this is not protecting a networked login, just preventing
    # accidental/careless writes from your own admin_cli.py.
    salt = "agastya-local-salt"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def run():
    if TOKEN_FILE.exists():
        overwrite = input("token.txt already exists. Overwrite? (y/N): ").strip().lower()
        if overwrite != "y":
            print("Cancelled.")
            return

    password = getpass.getpass("Choose your admin password: ")
    confirm = getpass.getpass("Confirm: ")
    if password != confirm:
        print("Passwords did not match. Try again.")
        return

    TOKEN_FILE.write_text(hash_password(password), encoding="utf-8")
    print(f"Saved hashed token to {TOKEN_FILE}")
    print("Make sure admin/token.txt is listed in your .gitignore (it already is by default).")


if __name__ == "__main__":
    run()
