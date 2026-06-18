#!/usr/bin/env python3
"""
Auto-refresh sessionKey using saved browser profile (no manual login needed).
Called automatically by monitor.py on 401.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
from dotenv import load_dotenv, set_key
import sys

load_dotenv()

PROFILE_DIR = Path("./browser-profile")
ENV_FILE    = Path(".env")

def refresh() -> str | None:
    if not PROFILE_DIR.exists():
        print("❌ browser-profile not found. Run setup_session.py first.")
        return None

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=True,
            args=["--no-sandbox"],
        )
        page = browser.new_page()
        page.goto("https://claude.ai/", timeout=30_000)
        page.wait_for_timeout(3000)

        cookies = browser.cookies("https://claude.ai")
        session_key = next((c["value"] for c in cookies if c["name"] == "sessionKey"), None)
        device_id   = next((c["value"] for c in cookies if c["name"] == "anthropic-device-id"), None)
        browser.close()

    if not session_key:
        print("❌ sessionKey not found after refresh")
        return None

    # Update .env in place
    lines = ENV_FILE.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.startswith("CLAUDE_SESSION_KEY="):
            lines[i] = f"CLAUDE_SESSION_KEY={session_key}"
        if device_id and line.startswith("CLAUDE_DEVICE_ID="):
            lines[i] = f"CLAUDE_DEVICE_ID={device_id}"
    ENV_FILE.write_text("\n".join(lines) + "\n")

    print(f"✅ sessionKey refreshed")
    return session_key

if __name__ == "__main__":
    result = refresh()
    sys.exit(0 if result else 1)
