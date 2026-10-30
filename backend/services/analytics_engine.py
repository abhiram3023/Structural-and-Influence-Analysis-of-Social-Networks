"""Graph Analytics Engine: builds the NetworkX graph and runs centrality, communities, robustness and insights."""
import math

import networkx as nx
import pandas as pd
from fastapi import HTTPException, status

from sna import analysis as A


def clean(v):
    """Make numpy / NaN values JSON-safe."""
    if isinstance(v, dict):
        return {str(k): clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [clean(x) for x in v]
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def validate(G: nx.Graph):
    if G.number_of_nodes() < 3 or G.number_of_edges() < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Add at least 3 people and 2 connections before running analysis")


def run_robustness(G, cent, strategies, adaptive=False) -> dict:
    allowed = {"random", *A.METRICS}
    bad = set(strategies) - allowed
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown strategies: {sorted(bad)}")
    curves = [A.robustness(G, s, cent=cent) for s in strategies]
    if adaptive:
        curves.append(A.robustness(G, "betweenness", adaptive=True))
    df = pd.concat(curves)
    auc = df.groupby("strategy").apply(A.robustness_auc, include_groups=False).sort_values()
    return clean({
        "curves": {s: g.drop(columns="strategy").to_dict(orient="records") for s, g in df.groupby("strategy")},
        "auc": auc.to_dict(),
        "most_damaging": auc.index[0],
    })


def analyse(G: nx.Graph) -> dict:
    validate(G)
    label = nx.get_node_attributes(G, "label")
    name = lambda n: label.get(n, str(n))

    summary = A.structural_summary(G)
    cent = A.centralities(G)
    comms = A.detect_communities(G)
    parts = comms["Louvain"]["communities"]
    cmap = A.node_community_map(parts)
    profiles = A.community_table(G, parts)
    profiles["hub_label"] = profiles["hub"].map(name)
    bridges = A.bridge_nodes(G, parts, cent, k=15)
    bridges["label"] = bridges["node"].map(name)
    aps = A.articulation_points(G)
    k = max(1, min(10, len(G) // 3))
    corr = A.metric_correlation(cent)
    overlap = A.top_k_overlap(cent, k)
    rob = run_robustness(G, cent, ["random", "degree", "betweenness", "pagerank"], adaptive=len(G) <= 300)

    metrics = {}
    for n, row in cent.iterrows():
        metrics[n] = {**row.to_dict(), "label": name(n), "community": cmap[n], "degree_count": G.degree(n),
                      "is_articulation_point": n in aps}

    # ---- insights ----
    top_deg, top_btw = cent["degree"].idxmax(), cent["betweenness"].idxmax()
    pair = corr.stack()[lambda s: s.index.get_level_values(0) != s.index.get_level_values(1)]
    lo = pair.idxmin()
    best = max(comms, key=lambda a: comms[a]["modularity"])
    insights = [
        f"{name(top_deg)} has the most direct connections; {name(top_btw)} is the strongest bridge (betweenness). "
        + ("They are the same person." if top_deg == top_btw else
           "Different people: being well-connected is not the same as linking groups together."),
        f"{name(cent['pagerank'].idxmax())} is connected to the most influential others (highest PageRank).",
        f"{name(cent['closeness'].idxmax())} can reach everyone else in the fewest steps (highest closeness).",
        f"{lo[0].title()} and {lo[1]} disagree most about who matters (Spearman ρ = {pair.min():.2f}).",
        f"Louvain found {comms['Louvain']['count']} communities (modularity {comms['Louvain']['modularity']:.3f}); "
        f"the best-scoring method was {best}.",
        f"Community {int(profiles.loc[profiles['internal_density'].idxmax(), 'community']) + 1} is the most tightly knit "
        f"(internal density {profiles['internal_density'].max():.2f}).",
        f"{len(aps)} people are single points of failure: removing any one of them splits the network"
        + (f" (e.g. {', '.join(name(a) for a in aps[:4])})." if aps else "."),
        f"Removing nodes by {rob['most_damaging']} breaks the network fastest "
        f"(robustness AUC {rob['auc'][rob['most_damaging']]:.3f} vs {rob['auc']['random']:.3f} for random removal).",
    ]
    if summary["Degree assortativity"] == summary["Degree assortativity"]:
        a = summary["Degree assortativity"]
        insights.append(f"Degree assortativity is {a:.2f}: "
                        + ("well-connected people tend to link with each other." if a > 0.05 else
                           "hubs mostly connect to less-connected people." if a < -0.05 else
                           "no strong pattern in who connects with whom by popularity."))

    return clean({
        "summary": summary,
        "metrics": metrics,
        "communities": {
            "algorithms": {a: {"count": c["count"], "modularity": c["modularity"]} for a, c in comms.items()},
            "partition": cmap,
            "profiles": profiles.to_dict(orient="records"),
            "bridges": bridges.to_dict(orient="records"),
            "articulation_points": aps,
        },
        "comparison": {"metrics": A.METRICS, "correlation": corr.to_dict(), "overlap": overlap.to_dict(), "k": k},
        "robustness": rob,
        "insights": insights,
    })
