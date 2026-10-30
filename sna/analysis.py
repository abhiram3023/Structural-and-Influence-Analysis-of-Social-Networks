"""Structural metrics, influence ranking, communities and robustness experiments."""
import networkx as nx
import pandas as pd
from networkx.algorithms import community as nxc

SEED = 42
METRICS = ["degree", "betweenness", "closeness", "eigenvector", "pagerank"]


def structural_summary(G: nx.Graph) -> dict:
    comps = list(nx.connected_components(G))
    giant = G.subgraph(max(comps, key=len))
    return {
        "Nodes": G.number_of_nodes(),
        "Edges": G.number_of_edges(),
        "Density": nx.density(G),
        "Average degree": 2 * G.number_of_edges() / G.number_of_nodes(),
        "Connected components": len(comps),
        "Giant component share": giant.number_of_nodes() / G.number_of_nodes(),
        "Avg clustering coefficient": nx.average_clustering(G),
        "Transitivity": nx.transitivity(G),
        "Degree assortativity": nx.degree_assortativity_coefficient(G) if G.number_of_edges() > 1 else float("nan"),
        **path_lengths(giant),
    }


# above this many node*edge operations, all-pairs computations are estimated from sampled BFS pivots
EXACT_BUDGET = 2e7


def path_lengths(giant: nx.Graph) -> dict:
    if giant.number_of_nodes() * giant.number_of_edges() <= EXACT_BUDGET:
        return {"Diameter (giant comp.)": nx.diameter(giant),
                "Avg shortest path (giant comp.)": nx.average_shortest_path_length(giant)}
    import random

    pivots = random.Random(SEED).sample(list(giant), min(200, giant.number_of_nodes()))
    total, count, diameter = 0, 0, 0
    for p in pivots:
        dist = nx.single_source_shortest_path_length(giant, p)
        total += sum(dist.values())
        count += len(dist) - 1
        far = max(dist, key=dist.get)
        # double sweep: BFS again from the farthest node gives a tight lower bound on the diameter
        diameter = max(diameter, dist[far], max(nx.single_source_shortest_path_length(giant, far).values()))
    return {"Diameter (giant comp., est.)": diameter, "Avg shortest path (giant comp., est.)": total / count}


def centralities(G: nx.Graph) -> pd.DataFrame:
    # betweenness and closeness are O(nm); estimate them from sampled pivots on large graphs
    n = G.number_of_nodes()
    m = G.number_of_edges()
    exact = n * m <= EXACT_BUDGET
    k = None if exact else max(100, min(n, int(EXACT_BUDGET * 2 / max(m, 1))))
    df = pd.DataFrame({
        "degree": nx.degree_centrality(G),
        "betweenness": nx.betweenness_centrality(G, k=k, seed=SEED),
        "closeness": nx.closeness_centrality(G) if exact else approx_closeness(G, 300),
        "eigenvector": eigenvector(G),
        "pagerank": nx.pagerank(G),
        "clustering": nx.clustering(G),
    })
    df.index.name = "node"
    for m in METRICS:
        df[f"{m}_rank"] = df[m].rank(ascending=False, method="min").astype(int)
    return df.sort_values("pagerank", ascending=False)


def approx_closeness(G: nx.Graph, k: int) -> dict:
    """Estimate closeness from BFS distances to k random pivots (distances are symmetric in an undirected graph).

    Uses the same Wasserman-Faust scaling as nx.closeness_centrality so the values stay comparable across components.
    """
    import random

    rng = random.Random(SEED)
    pivots = rng.sample(list(G), min(k, G.number_of_nodes()))
    total = dict.fromkeys(G, 0)
    hits = dict.fromkeys(G, 0)
    for p in pivots:
        for v, d in nx.single_source_shortest_path_length(G, p).items():
            total[v] += d
            hits[v] += 1
    pivot_set = set(pivots)
    out = {}
    for v in G:
        reach = hits[v] - (v in pivot_set)  # pivots at a non-zero distance from v
        if reach <= 0 or total[v] == 0:
            out[v] = 0.0
            continue
        avg = total[v] / reach
        frac = hits[v] / len(pivots)  # share of the graph in v's component
        out[v] = (1 / avg) * frac
    return out


def eigenvector(G: nx.Graph) -> dict:
    """Eigenvector centrality is ambiguous on disconnected graphs: compute it on the giant component, 0 elsewhere."""
    if nx.is_connected(G):
        return nx.eigenvector_centrality_numpy(G)
    giant = G.subgraph(max(nx.connected_components(G), key=len))
    ev = nx.eigenvector_centrality_numpy(giant) if giant.number_of_nodes() > 2 else {}
    return {n: ev.get(n, 0.0) for n in G}


def metric_correlation(cent: pd.DataFrame) -> pd.DataFrame:
    """Spearman rank correlation between influence metrics."""
    return cent[METRICS].corr(method="spearman")


def top_k_overlap(cent: pd.DataFrame, k=10) -> pd.DataFrame:
    tops = {m: set(cent[m].nlargest(k).index) for m in METRICS}
    return pd.DataFrame([[len(tops[a] & tops[b]) / k for b in METRICS] for a in METRICS], index=METRICS, columns=METRICS)


def detect_communities(G: nx.Graph) -> dict:
    """Run Louvain, greedy modularity and label propagation; return partitions and modularity."""
    algos = {
        "Louvain": lambda: nxc.louvain_communities(G, seed=SEED),
        "Greedy modularity": lambda: nxc.greedy_modularity_communities(G),
        "Label propagation": lambda: list(nxc.label_propagation_communities(G)),
    }
    if G.number_of_nodes() > 5000 or G.number_of_edges() > 50_000:  # greedy modularity is too slow on large graphs
        del algos["Greedy modularity"]
    out = {}
    for name, fn in algos.items():
        parts = sorted((set(c) for c in fn()), key=len, reverse=True)
        out[name] = {"communities": parts, "modularity": nxc.modularity(G, parts), "count": len(parts)}
    return out


def community_table(G: nx.Graph, parts: list[set]) -> pd.DataFrame:
    rows = []
    for i, c in enumerate(parts):
        sub = G.subgraph(c)
        internal = sub.number_of_edges()
        external = sum(1 for u in c for v in G[u] if v not in c)
        rows.append({
            "community": i,
            "size": len(c),
            "internal_edges": internal,
            "external_edges": external,
            "internal_density": nx.density(sub) if len(c) > 1 else 0.0,
            "conductance": external / (2 * internal + external) if (internal or external) else 0.0,
            "avg_clustering": nx.average_clustering(sub),
            "hub": max(c, key=G.degree),
        })
    return pd.DataFrame(rows)


def node_community_map(parts) -> dict:
    return {n: i for i, c in enumerate(parts) for n in c}


def bridge_nodes(G: nx.Graph, parts, cent: pd.DataFrame, k=10) -> pd.DataFrame:
    """Nodes whose neighbours span several communities (participation coefficient), ranked with betweenness."""
    cmap = node_community_map(parts)
    rows = []
    for n in G:
        deg = G.degree(n)
        if deg == 0:
            continue
        counts = pd.Series([cmap[v] for v in G[n]]).value_counts()
        participation = 1 - ((counts / deg) ** 2).sum()
        rows.append({"node": n, "community": cmap[n], "degree": deg, "communities_touched": len(counts),
                     "participation": participation, "betweenness": cent.loc[n, "betweenness"]})
    return pd.DataFrame(rows).sort_values(["betweenness", "participation"], ascending=False).head(k)


def articulation_points(G: nx.Graph) -> list:
    return list(nx.articulation_points(G))


def robustness(G: nx.Graph, strategy: str, steps=20, adaptive=False, cent: pd.DataFrame | None = None) -> pd.DataFrame:
    """Remove nodes in order of a strategy and track giant-component size and global efficiency.

    strategy: one of METRICS or 'random'. adaptive=True recomputes the ranking after each removal step.
    """
    import random

    H = G.copy()
    n0 = G.number_of_nodes()
    max_remove = int(n0 * 0.5)
    batch = max(1, max_remove // steps)
    eff_ok = n0 <= 800
    rng = random.Random(SEED)

    def order(graph):
        if strategy == "random":
            nodes = list(graph)
            rng.shuffle(nodes)
            return nodes
        if not adaptive and cent is not None:
            return [n for n in cent[strategy].sort_values(ascending=False).index if n in graph]
        return list(centralities_single(graph, strategy).sort_values(ascending=False).index)

    static_order = order(H) if not adaptive else None
    rows, removed = [], 0
    while True:
        giant = max((len(c) for c in nx.connected_components(H)), default=0)
        rows.append({"removed_frac": removed / n0, "giant_frac": giant / n0,
                     "efficiency": nx.global_efficiency(H) if eff_ok and H.number_of_nodes() else None})
        if removed >= max_remove or H.number_of_nodes() == 0:
            break
        targets = (order(H) if adaptive else [n for n in static_order if n in H])[:batch]
        H.remove_nodes_from(targets)
        removed += len(targets)
    df = pd.DataFrame(rows)
    df["strategy"] = strategy + (" (adaptive)" if adaptive else "")
    return df


def centralities_single(G, metric) -> pd.Series:
    fn = {"degree": nx.degree_centrality, "betweenness": nx.betweenness_centrality,
          "closeness": nx.closeness_centrality, "pagerank": nx.pagerank,
          "eigenvector": lambda g: nx.eigenvector_centrality(g, max_iter=1000, tol=1e-4)}[metric]
    try:
        return pd.Series(fn(G))
    except nx.PowerIterationFailedConvergence:
        return pd.Series(nx.degree_centrality(G))


def robustness_auc(df: pd.DataFrame) -> float:
    """Area under the giant-component curve (lower = attack more damaging = node set more critical)."""
    x, y = df["removed_frac"].to_numpy(), df["giant_frac"].to_numpy()
    return float(((x[1:] - x[:-1]) * (y[1:] + y[:-1]) / 2).sum())


def ground_truth_agreement(G, parts) -> float | None:
    """Adjusted Rand Index against a 'ground_truth' node attribute, if present."""
    gt = nx.get_node_attributes(G, "ground_truth")
    if not gt:
        return None
    cmap = node_community_map(parts)
    nodes = list(gt)
    return adjusted_rand([gt[n] for n in nodes], [cmap[n] for n in nodes])


def adjusted_rand(a: list, b: list) -> float:
    from math import comb
    ct = pd.crosstab(pd.Series(a), pd.Series(b))
    n = len(a)
    sum_ij = sum(comb(int(x), 2) for x in ct.to_numpy().ravel())
    sum_a = sum(comb(int(x), 2) for x in ct.sum(axis=1))
    sum_b = sum(comb(int(x), 2) for x in ct.sum(axis=0))
    expected = sum_a * sum_b / comb(n, 2)
    max_idx = (sum_a + sum_b) / 2
    return (sum_ij - expected) / (max_idx - expected) if max_idx != expected else 1.0
