"""Dataset loading, cleaning and graph construction."""
from pathlib import Path

import networkx as nx
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

BUILTIN = {
    "Zachary Karate Club": "Friendships among 34 members of a university karate club that split in two.",
    "Les Miserables": "Co-appearance network of characters in Victor Hugo's novel (weighted).",
    "Florentine Families": "Marriage ties between Renaissance Florentine families.",
    "Davis Southern Women": "Women linked by co-attendance at social events (projected from bipartite).",
}


def _facebook_path():
    p = DATA_DIR / "facebook_combined.txt"
    return p if p.exists() else None


def available_datasets():
    names = list(BUILTIN)
    if _facebook_path():
        names.append("SNAP Facebook Ego Networks")
    return names


def load_builtin(name: str) -> nx.Graph:
    if name == "Zachary Karate Club":
        G = nx.karate_club_graph()
        # store the real-world split as ground truth for community evaluation
        nx.set_node_attributes(G, {n: d["club"] for n, d in G.nodes(data=True)}, "ground_truth")
        return G
    if name == "Les Miserables":
        return nx.les_miserables_graph()
    if name == "Florentine Families":
        return nx.florentine_families_graph()
    if name == "Davis Southern Women":
        B = nx.davis_southern_women_graph()
        women = [n for n, d in B.nodes(data=True) if d["bipartite"] == 0]
        return nx.bipartite.weighted_projected_graph(B, women)
    if name == "SNAP Facebook Ego Networks":
        return nx.read_edgelist(_facebook_path(), nodetype=int)
    raise ValueError(f"Unknown dataset: {name}")


def build_from_edges(df: pd.DataFrame, source="source", target="target", weight=None) -> tuple[nx.Graph, dict]:
    """Clean an edge table and build an undirected graph. Returns (graph, cleaning report)."""
    report = {"raw_rows": len(df)}
    cols = [source, target] + ([weight] if weight else [])
    df = df[cols].copy()
    df = df.dropna(subset=[source, target])
    report["dropped_missing"] = report["raw_rows"] - len(df)
    df[source] = df[source].astype(str).str.strip()
    df[target] = df[target].astype(str).str.strip()
    before = len(df)
    df = df[df[source] != df[target]]
    report["dropped_self_loops"] = before - len(df)
    # undirected: treat (a,b) and (b,a) as the same edge, summing weights
    df["u"] = df[[source, target]].min(axis=1)
    df["v"] = df[[source, target]].max(axis=1)
    if weight:
        df[weight] = pd.to_numeric(df[weight], errors="coerce").fillna(1.0)
        agg = df.groupby(["u", "v"], as_index=False)[weight].sum().rename(columns={weight: "weight"})
    else:
        agg = df.groupby(["u", "v"], as_index=False).size().rename(columns={"size": "weight"})
    report["merged_duplicates"] = len(df) - len(agg)
    G = nx.from_pandas_edgelist(agg, "u", "v", edge_attr="weight")
    report["nodes"], report["edges"] = G.number_of_nodes(), G.number_of_edges()
    return G, report
