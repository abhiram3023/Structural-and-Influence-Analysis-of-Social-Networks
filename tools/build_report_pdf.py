"""Render project_report.md (with its report_assets/ images) to a styled A4 PDF using headless Chromium.

Usage:  .venv/bin/python tools/build_report_pdf.py [project_report.md] [Social_Network_Analytics_Report.pdf]
"""
import sys
import tempfile
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1e293b; font-size: 10.5pt; line-height: 1.5; }
h1 { font-size: 26pt; line-height: 1.15; color: #0f172a; margin: 0 0 14px; }
h2 { font-size: 16pt; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 4px; margin: 26px 0 10px; }
h3 { font-size: 13pt; color: #1d4ed8; margin: 0 0 10px; }
p { margin: 0 0 9px; text-align: justify; }
ul, ol { margin: 0 0 10px; padding-left: 20px; }
li { margin-bottom: 4px; }
strong { color: #0f172a; }
code { font-family: Menlo, monospace; font-size: 9pt; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
table { border-collapse: collapse; margin: 6px 0 12px; font-size: 9.5pt; width: 100%; }
th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
th { background: #eff6ff; color: #1e3a8a; }
img { display: block; max-width: 100%; max-height: 108mm; margin: 6px auto 12px; border: 1px solid #e2e8f0; border-radius: 6px;
      box-shadow: 0 1px 4px rgba(15, 23, 42, .12); object-fit: contain; }
.page-break { break-after: page; }
h3, img, table { break-inside: avoid; }
h3 { break-after: avoid; break-before: page; }
h2 + h3 { break-before: avoid; }  /* 4.1 stays with its section heading */
.cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: center; }
.cover .eyebrow { text-transform: uppercase; letter-spacing: .18em; color: #2563eb; font-weight: 600; font-size: 10pt; margin-bottom: 10px; }
.cover .subtitle { font-size: 12.5pt; color: #475569; text-align: left; margin-bottom: 26px; }
.cover table.facts td { border: none; border-bottom: 1px solid #e2e8f0; padding: 7px 4px; }
.cover table.facts td:first-child { font-weight: 600; color: #1d4ed8; width: 30%; }
"""

FOOTER = """<div style="width:100%; font-size:8px; color:#94a3b8; font-family:-apple-system, Helvetica, Arial, sans-serif; padding:0 16mm; display:flex; justify-content:space-between;">
<span>Structural and Influence Analysis of Social Networks Using Graph Analytics</span>
<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>"""


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "project_report.md"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "Social_Network_Analytics_Report.pdf"
    body = markdown.markdown(src.read_text(), extensions=["tables", "md_in_html"])
    # base href lets the HTML (written to a temp dir) find report_assets/ next to the Markdown
    html = (f'<!doctype html><html><head><meta charset="utf-8"><base href="{src.resolve().parent.as_uri()}/">'
            f"<style>{CSS}</style></head><body>{body}</body></html>")
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        page_file = Path(tmp) / "report.html"
        page_file.write_text(html)
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(page_file.as_uri(), wait_until="load")
        page.pdf(path=str(out), format="A4", print_background=True, display_header_footer=True,
                 header_template="<span></span>", footer_template=FOOTER,
                 margin={"top": "18mm", "bottom": "20mm", "left": "16mm", "right": "16mm"})
        browser.close()
    print(f"Wrote {out} ({out.stat().st_size / 2**20:.1f} MB)")


if __name__ == "__main__":
    main()
