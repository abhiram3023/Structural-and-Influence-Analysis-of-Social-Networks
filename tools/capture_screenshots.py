"""Capture full-page screenshots of every main page of the running app for the project report.

Usage:
  SNA_EMAIL=you@example.com SNA_PASSWORD=... .venv/bin/python tools/capture_screenshots.py \
      --base http://localhost:3000 --network "twitter sample"

Needs the API and the Next.js app running, and `playwright install chromium` done once.
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROUTES = [
    ("dashboard", "/dashboard"),
    ("network", "/network"),
    ("people", "/people"),
    ("influence", "/analysis/influence"),
    ("communities", "/analysis/communities"),
    ("robustness", "/analysis/robustness"),
    ("import", "/import"),
    ("reports", "/reports"),
]
GRAPH_PAGES = {"dashboard", "network", "communities", "robustness"}


def api(base: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json",
                                          **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000", help="Next.js app URL")
    ap.add_argument("--api", default="http://localhost:8000/api", help="FastAPI base URL")
    ap.add_argument("--network", help="name of the network to show (default: most recently updated)")
    ap.add_argument("--out", type=Path, default=Path("report_assets"))
    ap.add_argument("--theme", choices=["light", "dark"], default="light")
    a = ap.parse_args()

    email, password = os.environ.get("SNA_EMAIL"), os.environ.get("SNA_PASSWORD")
    if not email or not password:
        sys.exit("Set SNA_EMAIL and SNA_PASSWORD for the account whose networks should be shown.")
    token = api(a.api, "/auth/login", body={"email": email, "password": password})["access_token"]
    nets = api(a.api, "/networks", token)
    net = next((n for n in nets if n["name"] == a.network), None) if a.network else (nets[0] if nets else None)
    if not net:
        sys.exit(f"Network not found. Available: {[n['name'] for n in nets]}")
    print(f"Capturing '{net['name']}' ({net['node_count']} people) from {a.base}")

    a.out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2,
                                  color_scheme=a.theme)
        # session + chosen network + theme are read from localStorage before the app boots
        ctx.add_init_script(
            f"localStorage.setItem('sna_token', {json.dumps(token)});"
            f"localStorage.setItem('sna_network', '{net['id']}');"
            f"localStorage.setItem('sna_theme', '{a.theme}');"
        )
        page = ctx.new_page()
        for name, route in ROUTES:
            page.goto(a.base + route, wait_until="networkidle", timeout=120_000)
            page.wait_for_selector("main h1", timeout=120_000)
            # wait until every spinner / "Loading..." placeholder is gone
            page.wait_for_function(
                "() => !document.querySelector('.animate-spin') && !document.body.innerText.includes('Loading...')",
                timeout=120_000)
            if name in GRAPH_PAGES:
                page.wait_for_selector("canvas", timeout=120_000)
            page.wait_for_timeout(3000)  # let the graph layout and chart animations settle
            # hide the Next.js dev-mode badge
            page.add_style_tag(content="nextjs-portal { display: none !important; }")
            # grow the window to the page height so the fixed sidebar spans the whole capture
            height = page.evaluate("document.documentElement.scrollHeight")
            page.set_viewport_size({"width": 1440, "height": max(900, height)})
            page.wait_for_timeout(1500)
            path = a.out / f"{list(dict(ROUTES)).index(name) + 1:02d}_{name}.png"
            page.screenshot(path=str(path))
            page.set_viewport_size({"width": 1440, "height": 900})
            print(f"  saved {path}")
        browser.close()


if __name__ == "__main__":
    main()
