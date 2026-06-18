#!/usr/bin/env python3
"""
Reads claude.ai cookies directly from Chrome on macOS.
No browser automation — uses your real logged-in Chrome session.
"""
import sqlite3, shutil, subprocess, hashlib, os, sys
from pathlib import Path
from dotenv import load_dotenv

try:
    from Crypto.Cipher import AES
except ImportError:
    print("Installing pycryptodome...")
    subprocess.run([sys.executable, "-m", "pip", "install", "pycryptodome"], check=True)
    from Crypto.Cipher import AES

load_dotenv()
ENV_FILE = Path(".env")

CHROME_COOKIES = Path.home() / "Library/Application Support/Google/Chrome/Default/Cookies"


def get_chrome_key() -> bytes:
    result = subprocess.run(
        ["security", "find-generic-password", "-w", "-s", "Chrome Safe Storage"],
        capture_output=True, text=True
    )
    password = result.stdout.strip().encode()
    return hashlib.pbkdf2_hmac("sha1", password, b"saltysalt", 1003, dklen=16)


def decrypt_cookie(encrypted: bytes, key: bytes) -> str:
    if encrypted[:3] == b"v10":
        encrypted = encrypted[3:]
    iv = b" " * 16
    cipher = AES.new(key, AES.MODE_CBC, IV=iv)
    decrypted = cipher.decrypt(encrypted)
    pad = decrypted[-1]
    if isinstance(pad, int) and 1 <= pad <= 16:
        decrypted = decrypted[:-pad]
    # First 16 bytes may be garbage (AES-CBC first block with wrong IV)
    # Find first run of printable ASCII chars
    for start in range(len(decrypted)):
        ch = decrypted[start]
        if 32 <= ch <= 126:
            return decrypted[start:].decode("latin-1")
    return decrypted.decode("latin-1", errors="ignore")


def extract_all_cookies() -> dict:
    if not CHROME_COOKIES.exists():
        print(f"❌ Chrome cookies not found at {CHROME_COOKIES}")
        return {}

    tmp = Path("/tmp/chrome_cookies_tmp.db")
    shutil.copy2(CHROME_COOKIES, tmp)
    key = get_chrome_key()

    conn = sqlite3.connect(tmp)
    cur = conn.cursor()
    cur.execute("SELECT name, value, encrypted_value FROM cookies WHERE host_key LIKE '%claude.ai%'")
    rows = cur.fetchall()
    conn.close()
    tmp.unlink()

    result = {}
    for name, plain_value, encrypted in rows:
        try:
            if plain_value:
                # Plain text cookie (not encrypted)
                value = plain_value
            elif encrypted:
                value = decrypt_cookie(encrypted, key)
                if name == "sessionKey":
                    idx = value.find("sk-ant-")
                    value = value[idx:] if idx != -1 else value
            else:
                continue
            # Only keep clean ASCII values (safe for HTTP headers)
            value.encode("latin-1")
            result[name] = value
        except Exception:
            pass
    return result


def update_env(updates: dict[str, str]):
    lines = ENV_FILE.read_text().splitlines()
    for key, value in updates.items():
        updated = False
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={value}"
                updated = True
                break
        if not updated:
            lines.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    print("Читаю куки из Chrome...")
    cookies = extract_all_cookies()

    if not cookies.get("sessionKey"):
        print("❌ sessionKey не найден — убедись что ты залогинен в Claude в Chrome")
        sys.exit(1)

    # Build cookie string for monitor
    important = ["sessionKey", "anthropic-device-id", "cf_clearance", "__cf_bm",
                 "activitySessionId", "lastActiveOrg"]
    cookie_str = "; ".join(f"{k}={cookies[k]}" for k in important if k in cookies)

    updates = {
        "CLAUDE_SESSION_KEY": cookies["sessionKey"],
        "CLAUDE_COOKIE_STRING": cookie_str,
    }
    if "anthropic-device-id" in cookies:
        updates["CLAUDE_DEVICE_ID"] = cookies["anthropic-device-id"]

    update_env(updates)
    print(f"✅ Куки обновлены в .env ({len(cookies)} штук из Chrome)")
    print(f"   sessionKey: {cookies['sessionKey'][:35]}...")
