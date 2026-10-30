"""Format stored analysis results and export them as CSV, JSON or Markdown."""
import io
import json
from datetime import datetime

import pandas as pd

from ..config import STORAGE_DIR
from ..models import AnalysisResult, Network


def result_out(r: AnalysisResult) -> dict:
    return {"id": r.id, "network_id": r.network_id, "created_at": r.created_at, "summary": r.summary,
            "metrics": r.metrics, "communities": r.communities, "comparison": r.comparison,
            "robustness": r.robustness, "insights": r.insights}


def export(net: Network, r: AnalysisResult, fmt: str) -> tuple[bytes, str, str]:
    stamp = f"{datetime.now():%Y%m%d_%H%M%S}"
    base = f"network{net.id}_{stamp}"
    if fmt == "csv":
        df = pd.DataFrame.from_dict(r.metrics, orient="index")
        df.index.name = "node_id"
        cols = ["label", "community", "degree_count", "degree", "betweenness", "closeness", "eigenvector",
                "pagerank", "clustering", "is_articulation_point"]
        body = df[[c for c in cols if c in df]].sort_values("pagerank", ascending=False).to_csv().encode()
        name, mime = f"{base}_metrics.csv", "text/csv"
    elif fmt == "json":
        body = json.dumps(result_out(r), default=str, indent=2).encode()
        name, mime = f"{base}_analysis.json", "application/json"
    else:
        body = markdown(net, r).encode()
        name, mime = f"{base}_report.md", "text/markdown"
    (STORAGE_DIR / "reports" / name).write_bytes(body)
    return body, name, mime


def markdown(net: Network, r: AnalysisResult) -> str:
    out = io.StringIO()
    w = lambda s="": out.write(s + "\n")
    w(f"# Network report: {net.name}")
    w(f"_Analysis run {r.created_at:%Y-%m-%d %H:%M} UTC_")
    w()
    w("## Structure")
    w("| Metric | Value |")
    w("|---|---|")
    for k, v in r.summary.items():
        w(f"| {k} | {v:.4f} |" if isinstance(v, float) else f"| {k} | {v} |")
    w()
    w("## Key insights")
    for i in r.insights:
        w(f"- {i}")
    w()
    w("## Top 10 influential people (PageRank)")
    top = sorted(r.metrics.values(), key=lambda m: m["pagerank"], reverse=True)[:10]
    w("| Person | Degree | Betweenness | Closeness | PageRank | Community |")
    w("|---|---|---|---|---|---|")
    for m in top:
        w(f"| {m['label']} | {m['degree_count']} | {m['betweenness']:.3f} | {m['closeness']:.3f} | "
          f"{m['pagerank']:.3f} | {m['community'] + 1} |")
    w()
    w("## Communities")
    w("| # | Size | Internal density | Conductance | Hub |")
    w("|---|---|---|---|---|")
    for p in r.communities["profiles"]:
        w(f"| {p['community'] + 1} | {p['size']} | {p['internal_density']:.3f} | {p['conductance']:.3f} | {p['hub_label']} |")
    w()
    w("## Robustness (lower AUC = more damaging removal)")
    for k, v in r.robustness["auc"].items():
        w(f"- {k}: {v:.3f}")
    w()
    w("_Centrality measures structural importance, not proven real-world persuasion or causal influence._")
    return out.getvalue()
