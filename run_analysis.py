"""Batch pipeline: runs the full analysis on every dataset and writes tables, figures and a findings report.

Usage:  python run_analysis.py            # all datasets
        python run_analysis.py "Les Miserables"
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd

from sna import analysis as A
from sna.data import available_datasets, load_builtin

OUT = Path(__file__).resolve().parent / "outputs"


def slug(s):
    return s.lower().replace(" ", "_")


def plot_network(G, cent, cmap, path, title):
    pos = nx.spring_layout(G, seed=A.SEED, k=1.2 / max(1, len(G)) ** 0.5)
    fig, ax = plt.subplots(figsize=(9, 7))
    sizes = 50 + 1500 * cent.loc[list(G), "pagerank"] / cent["pagerank"].max()
    nx.draw_networkx_edges(G, pos, alpha=0.2, ax=ax)
    nx.draw_networkx_nodes(G, pos, node_size=sizes, node_color=[cmap[n] for n in G], cmap="tab10", ax=ax)
    top = cent["betweenness"].nlargest(8).index
    nx.draw_networkx_labels(G, pos, {n: n for n in top}, font_size=8, ax=ax)
    ax.set_title(f"{title}: communities (colour), PageRank (size), top-betweenness labelled")
    ax.axis("off")
    fig.tight_layout(); fig.savefig(path, dpi=140); plt.close(fig)


def plot_heatmap(df, path, title):
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(df.to_numpy(), cmap="viridis", vmin=0, vmax=1)
    ax.set_xticks(range(len(df)), df.columns, rotation=45, ha="right"); ax.set_yticks(range(len(df)), df.index)
    for i in range(len(df)):
        for j in range(len(df)):
            ax.text(j, i, f"{df.iat[i, j]:.2f}", ha="center", va="center", color="w", fontsize=8)
    fig.colorbar(im); ax.set_title(title); fig.tight_layout(); fig.savefig(path, dpi=140); plt.close(fig)


def plot_robustness(curves, path, title):
    fig, ax = plt.subplots(figsize=(7, 5))
    for name, df in curves.groupby("strategy"):
        ax.plot(df["removed_frac"], df["giant_frac"], marker="o", ms=3, label=name)
    ax.set_xlabel("Fraction of nodes removed"); ax.set_ylabel("Giant component / original size")
    ax.set_title(title); ax.legend(); ax.grid(alpha=0.3)
    fig.tight_layout(); fig.savefig(path, dpi=140); plt.close(fig)


def plot_degree_dist(G, path, title):
    deg = pd.Series(dict(G.degree())).value_counts().sort_index()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(deg.index, deg.values)
    ax.set_xlabel("Degree"); ax.set_ylabel("Number of nodes"); ax.set_title(title)
    fig.tight_layout(); fig.savefig(path, dpi=140); plt.close(fig)


def analyse(name):
    d = OUT / slug(name)
    d.mkdir(parents=True, exist_ok=True)
    G = load_builtin(name)
    summary = A.structural_summary(G)
    cent = A.centralities(G)
    corr = A.metric_correlation(cent)
    overlap = A.top_k_overlap(cent, k=min(10, len(G) // 3))
    comms = A.detect_communities(G)
    best = max(comms, key=lambda k: comms[k]["modularity"])
    parts = comms["Louvain"]["communities"]
    ctab = A.community_table(G, parts)
    bridges = A.bridge_nodes(G, parts, cent)
    aps = A.articulation_points(G)
    curves = pd.concat([A.robustness(G, s, cent=cent) for s in ["random", "degree", "betweenness", "pagerank"]]
                       + [A.robustness(G, "betweenness", adaptive=True)])
    auc = curves.groupby("strategy").apply(A.robustness_auc, include_groups=False).sort_values()
    ari = A.ground_truth_agreement(G, parts)

    pd.Series(summary).to_csv(d / "structural_summary.csv", header=["value"])
    cent.to_csv(d / "centralities.csv"); corr.to_csv(d / "metric_correlation.csv")
    ctab.to_csv(d / "communities.csv", index=False); bridges.to_csv(d / "bridges.csv", index=False)
    curves.to_csv(d / "robustness.csv", index=False)

    cmap = A.node_community_map(parts)
    plot_network(G, cent, cmap, d / "network.png", name)
    plot_heatmap(corr, d / "metric_correlation.png", "Spearman rank correlation of metrics")
    plot_heatmap(overlap, d / "topk_overlap.png", "Top-k overlap between metrics")
    plot_robustness(curves, d / "robustness.png", f"{name}: targeted vs random removal")
    plot_degree_dist(G, d / "degree_distribution.png", f"{name}: degree distribution")

    top_deg, top_btw = cent["degree"].idxmax(), cent["betweenness"].idxmax()
    top = lambda m: ", ".join(map(str, cent[m].nlargest(5).index))
    lines = [f"## {name}", "",
             "| Metric | Value |", "|---|---|",
             *[f"| {k} | {v:.4f} |" if isinstance(v, float) else f"| {k} | {v} |" for k, v in summary.items()], "",
             "**Top 5 nodes by metric**", "",
             *[f"- {m}: {top(m)}" for m in A.METRICS], "",
             "**Findings**", "",
             f"- Most-connected node is **{top_deg}**; top bridge (betweenness) is **{top_btw}** — "
             + ("the same node." if top_deg == top_btw else "different nodes, so connectivity and brokerage are distinct roles."),
             f"- Lowest rank correlation is between **{corr.stack().idxmin()[0]}** and **{corr.stack().idxmin()[1]}** "
             f"(ρ = {corr.stack().min():.2f}): these metrics disagree most about who matters.",
             f"- Louvain found **{comms['Louvain']['count']}** communities (modularity {comms['Louvain']['modularity']:.3f}); "
             f"best modularity overall: {best} ({comms[best]['modularity']:.3f}).",
             f"- Densest community: #{ctab.loc[ctab['internal_density'].idxmax(), 'community']} "
             f"(density {ctab['internal_density'].max():.2f}); most self-contained (lowest conductance): "
             f"#{ctab.loc[ctab['conductance'].idxmin(), 'community']}.",
             f"- Key bridges across communities: {', '.join(map(str, bridges['node'].head(5)))}.",
             f"- {len(aps)} articulation points (single nodes whose removal disconnects the graph)"
             + (f", e.g. {', '.join(map(str, aps[:5]))}." if aps else "."),
             f"- Robustness (area under giant-component curve, lower = more damaging): "
             + "; ".join(f"{k} {v:.3f}" for k, v in auc.items())
             + f". The most damaging attack is **{auc.index[0]}**, versus random {auc['random']:.3f}.",
             ]
    if ari is not None:
        lines.append(f"- Louvain vs the real club split: Adjusted Rand Index = {ari:.3f}.")
    lines += ["", f"Figures: `outputs/{slug(name)}/`", ""]
    return "\n".join(lines)


def main():
    names = sys.argv[1:] or available_datasets()
    OUT.mkdir(exist_ok=True)
    sections = [analyse(n) for n in names]
    report = ["# Findings: Structural and Influence Analysis of Social Networks", "",
              "_Note: centrality measures structural importance, not proven real-world persuasion or causal influence._", "",
              *sections]
    (OUT / "FINDINGS.md").write_text("\n".join(report))
    print(f"Wrote {OUT / 'FINDINGS.md'}")


if __name__ == "__main__":
    main()
