"""Read CSV / JSON uploads, validate and clean them, then create nodes and edges."""
import io
import json
from datetime import datetime

import networkx as nx
import pandas as pd
from fastapi import HTTPException, status

from sna.data import build_from_edges

from ..config import STORAGE_DIR


def save_upload(user_id: int, filename: str, content: bytes) -> str:
    safe = "".join(c for c in filename if c.isalnum() or c in "._-") or "upload"
    path = STORAGE_DIR / "uploads" / f"u{user_id}_{datetime.now():%Y%m%d%H%M%S}_{safe}"
    path.write_bytes(content)
    return path.name


# Interactive analysis (exact betweenness, drawing, per-person metrics) stays responsive up to roughly this size.
MAX_NODES = 20_000
MAX_EDGES = 150_000
TOO_LARGE_HINT = ("{what}. The web app analyses networks of up to "
                  f"{MAX_NODES:,} people and {MAX_EDGES:,} connections. For bigger datasets, extract a "
                  "representative sample first:  python tools/sample_large_graph.py <edges.csv>  "
                  "and import the CSV it writes.")


def check_limits(G: nx.Graph, existing_nodes: int = 0, existing_edges: int = 0):
    n, e = G.number_of_nodes() + existing_nodes, G.number_of_edges() + existing_edges
    if n > MAX_NODES or e > MAX_EDGES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, TOO_LARGE_HINT.format(
            what=f"This would give the network {n:,} people and {e:,} connections"))


def _is_number(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def has_header(content: bytes) -> bool:
    """A first row made only of numbers is data (e.g. '1,11553'), not column names."""
    first = content[:4096].decode("utf-8", "replace").splitlines()[0] if content else ""
    fields = [f.strip().strip('"') for f in first.split(",")]
    return not all(f and _is_number(f) for f in fields)


def column_names(n: int) -> list[str]:
    return [f"column {i + 1}" for i in range(n)]


def parse_csv(content: bytes, source: str | None, target: str | None, weight: str | None) -> tuple[nx.Graph, dict]:
    header = has_header(content)
    try:
        df = pd.read_csv(io.BytesIO(content), header=0 if header else None)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Could not read CSV: {e}")
    if not header:
        df.columns = column_names(df.shape[1])
    if df.shape[1] == 1:
        return parse_node_list(df)
    cols = list(df.columns)
    source = source or cols[0]
    target = target or cols[1]
    for c in (source, target) + ((weight,) if weight else ()):
        if c not in cols:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Column '{c}' not found. Columns: {cols}")
    G, report = build_from_edges(df, source, target, weight)
    report["columns"] = cols
    report["header_row"] = header
    return G, report


def parse_node_list(df: pd.DataFrame) -> tuple[nx.Graph, dict]:
    """A one-column CSV is a list of people with no connections; edges come from a separate edge file."""
    labels = df.iloc[:, 0].dropna().astype(str).str.strip()
    labels = labels[labels != ""]
    G = nx.Graph()
    G.add_nodes_from(labels.unique())
    return G, {"raw_rows": len(df), "dropped_missing": len(df) - len(labels), "merged_duplicates": len(labels) - G.number_of_nodes(),
               "node_list": True, "nodes": G.number_of_nodes(), "edges": 0}


def parse_json(content: bytes) -> tuple[nx.Graph, dict]:
    """Accepts {"nodes":[{"id"|"label":..}], "edges"|"links":[{"source","target","weight"?}]} or a list of edges."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Invalid JSON: {e}")
    edges = data if isinstance(data, list) else data.get("edges") or data.get("links") or []
    if not isinstance(edges, list):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "JSON must contain an 'edges' list")
    df = pd.DataFrame(edges)
    if not {"source", "target"} <= set(df.columns) and len(edges):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Each edge needs 'source' and 'target'")
    if len(edges):
        G, report = build_from_edges(df, "source", "target", "weight" if "weight" in df.columns else None)
    else:
        G, report = nx.Graph(), {"raw_rows": 0}
    # isolated nodes listed explicitly
    nodes = [] if isinstance(data, list) else data.get("nodes", [])
    isolated = 0
    for n in nodes:
        label = str(n.get("label", n.get("id"))) if isinstance(n, dict) else str(n)
        if label and label != "None" and label not in G:
            G.add_node(label)
            isolated += 1
    report["isolated_nodes_added"] = isolated
    report["nodes"], report["edges"] = G.number_of_nodes(), G.number_of_edges()
    return G, report


def apply_names(db, net, content: bytes, id_col: str | None, name_col: str | None) -> dict:
    """Give people readable names from a CSV of (id, name[, other columns...]).

    The original ID is kept in attributes['source_id'] so later edge imports that use IDs still match.
    Extra columns become profile attributes. The latest analysis is relabelled in place (no re-run needed).
    """
    import re

    from sqlalchemy import select

    from ..models import AnalysisResult, Node

    header = has_header(content)
    try:
        df = pd.read_csv(io.BytesIO(content), header=0 if header else None, dtype=str)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Could not read CSV: {e}")
    if not header:
        df.columns = column_names(df.shape[1])
    if df.shape[1] < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Names file needs two columns: id, name")
    cols = list(df.columns)
    id_col, name_col = id_col or cols[0], name_col or cols[1]
    if id_col == name_col:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick different columns for the ID and the name")
    for c in (id_col, name_col):
        if c not in cols:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Column '{c}' not found. Columns: {cols}")
    df = df.dropna(subset=[id_col, name_col])
    df[id_col] = df[id_col].str.strip()
    df[name_col] = df[name_col].str.strip()
    df = df[(df[name_col] != "")].drop_duplicates(subset=[id_col], keep="last")
    extra = [c for c in cols if c not in (id_col, name_col)]

    nodes = db.scalars(select(Node).where(Node.network_id == net.id)).all()
    by_key = {str((n.attributes or {}).get("source_id", n.label)): n for n in nodes}
    taken = {n.label for n in nodes}
    renamed, unmatched, relabel = 0, 0, {}
    for row in df.itertuples(index=False):
        rec = dict(zip(df.columns, row))
        node = by_key.get(rec[id_col])
        if node is None:
            unmatched += 1
            continue
        attrs = dict(node.attributes or {})
        attrs.setdefault("source_id", rec[id_col])
        for c in extra:
            if isinstance(rec[c], str) and rec[c].strip():
                attrs[c] = rec[c].strip()
        name = rec[name_col]
        if name != node.label:
            if name in taken:  # labels are unique per network; disambiguate duplicates with the ID
                name = f"{name} ({rec[id_col]})"
            taken.discard(node.label)
            taken.add(name)
            relabel[node.label] = name
            node.label = name
            renamed += 1
        node.attributes = attrs

    # relabel the stored analysis so the new names show immediately
    for r in db.scalars(select(AnalysisResult).where(AnalysisResult.network_id == net.id)):
        id_to_label = {str(n.id): n.label for n in nodes}
        r.metrics = {k: {**m, "label": id_to_label.get(k, m["label"])} for k, m in r.metrics.items()}
        c = dict(r.communities)
        c["profiles"] = [{**p, "hub_label": id_to_label.get(str(p["hub"]), p["hub_label"])} for p in c["profiles"]]
        c["bridges"] = [{**b, "label": id_to_label.get(str(b["node"]), b["label"])} for b in c["bridges"]]
        r.communities = c
        if relabel:
            # replace whole labels only (not digits inside numbers like 0.534)
            pat = re.compile(r"(?<![\w.])(" + "|".join(re.escape(k) for k in sorted(relabel, key=len, reverse=True)) + r")(?!\w|\.\d)")
            r.insights = [pat.sub(lambda m: relabel[m.group(1)], s) for s in r.insights]
    return {"rows": len(df), "renamed": renamed, "unmatched": unmatched, "extra_attributes": extra,
            "columns": cols, "header_row": header}
