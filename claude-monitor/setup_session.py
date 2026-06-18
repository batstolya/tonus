#!/usr/bin/env python3
"""
Run once to log in via Google and save browser profile.
After this, refresh_session.py can renew the sessionKey automatically.

    python setup_session.py
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os
from dotenv import load_dotenv

load_dotenv()

PROFILE_DIR = Path("./browser-profile")
ENV_FILE    = Path(".env")

def update_env(key: str, value: str):
    lines = ENV_FILE.read_text().splitlines()
    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            updated = True
            break
    if not updated:
        lines.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(lines) + "\n")

def main():
    PROFILE_DIR.mkdir(exist_ok=True)
    print("Открываю браузер. Залогинься через Google и дождись главной страницы Claude.")
    print("Браузер закроется автоматически после успешного входа.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            args=["--no-sandbox"],
        )
        page = browser.new_page()
        page.goto("https://claude.ai/login")

        # Wait until redirected away from login (i.e. user is logged in)
        page.wait_for_function(
            "() => !window.location.pathname.includes('login') && !window.location.pathname.includes('auth')",
            timeout=120_000,
        )
        # Give a moment for cookies to settle
        page.wait_for_timeout(3000)

        cookies = browser.cookies("https://claude.ai")
        session_key = next((c["value"] for c in cookies if c["name"] == "sessionKey"), None)
        device_id   = next((c["value"] for c in cookies if c["name"] == "anthropic-device-id"), None)

        if not session_key:
            print("❌ sessionKey не найден. Попробуй ещё раз.")
            browser.close()
            return

        update_env("CLAUDE_SESSION_KEY", session_key)
        if device_id:
            update_env("CLAUDE_DEVICE_ID", device_id)

        print(f"✅ sessionKey сохранён в .env")
        print(f"   device_id: {device_id}")
        browser.close()

if __name__ == "__main__":
    main()
