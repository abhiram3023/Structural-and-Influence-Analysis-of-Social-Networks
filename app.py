"""Streamlit dashboard.  Run:  streamlit run app.py"""
import networkx as nx
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from sna import analysis as A
from sna.data import BUILTIN, available_datasets, build_from_edges, load_builtin

st.set_page_config(page_title="Social Network Graph Analytics", layout="wide")
st.title("Structural and Influence Analysis of Social Networks")
st.caption("Centrality measures structural importance — not proven real-world persuasion or causal influence.")

# ---------- data ----------
with st.sidebar:
    st.header("Dataset")
    source = st.radio("Source", ["Built-in", "Upload edge list (CSV)"])
    report = None
    if source == "Built-in":
        name = st.selectbox("Network", available_datasets())
        st.info(BUILTIN.get(name, "Facebook friendship ego networks from SNAP."))
        G = load_builtin(name)
    else:
        up = st.file_uploader("CSV with one edge per row", type="csv")
        if up is None:
            st.stop()
        raw = pd.read_csv(up)
        s = st.selectbox("Source column", raw.columns, 0)
        t = st.selectbox("Target column", raw.columns, min(1, len(raw.columns) - 1))
        w = st.selectbox("Weight column (optional)", ["<none>"] + list(raw.columns))
        G, report = build_from_edges(raw, s, t, None if w == "<none>" else w)
        name = up.name


@st.cache_data(show_spinner="Computing metrics...")
def compute(_G, key):
    cent = A.centralities(_G)
    comms = A.detect_communities(_G)
    return A.structural_summary(_G), cent, comms


summary, cent, comms = compute(G, name)

if report:
    st.success("Cleaning: " + ", ".join(f"{k.replace('_', ' ')} = {v}" for k, v in report.items()))

tabs = st.tabs(["Structure", "Influence", "Communities", "Metric comparison", "Robustness", "Node explorer"])

# ---------- structure ----------
with tabs[0]:
    cols = st.columns(4)
    for i, (k, v) in enumerate(summary.items()):
        cols[i % 4].metric(k, f"{v:.3f}" if isinstance(v, float) else v)
    deg = pd.Series(dict(G.degree()), name="degree")
    c1, c2 = st.columns(2)
    c1.plotly_chart(px.histogram(deg, nbins=30, title="Degree distribution"), use_container_width=True)
    c2.plotly_chart(px.scatter(cent, x="degree", y="clustering", hover_name=cent.index,
                               title="Local clustering vs degree"), use_container_width=True)
    aps = A.articulation_points(G)
    st.write(f"**Articulation points ({len(aps)})** — removing any one disconnects the network:",
             ", ".join(map(str, aps[:30])) or "none")

# ---------- influence ----------
with tabs[1]:
    metric = st.selectbox("Rank by", A.METRICS, index=4)
    k = st.slider("Top k", 5, min(50, len(G)), 10)
    top = cent.sort_values(metric, ascending=False).head(k)
    st.plotly_chart(px.bar(top, x=top.index.astype(str), y=metric, title=f"Top {k} by {metric}"),
                    use_container_width=True)
    st.dataframe(top[A.METRICS + [f"{m}_rank" for m in A.METRICS]].style.format(precision=4))
    st.download_button("Download all centralities (CSV)", cent.to_csv().encode(), "centralities.csv")


def network_figure(G, colour, size, top_labels):
    pos = nx.spring_layout(G, seed=A.SEED, k=1.2 / max(1, len(G)) ** 0.5)
    ex, ey = [], []
    for u, v in G.edges():
        ex += [pos[u][0], pos[v][0], None]; ey += [pos[u][1], pos[v][1], None]
    nodes = list(G)
    smax = max(size.values()) or 1
    fig = go.Figure([
        go.Scatter(x=ex, y=ey, mode="lines", line=dict(width=0.5, color="#999"), hoverinfo="none"),
        go.Scatter(x=[pos[n][0] for n in nodes], y=[pos[n][1] for n in nodes], mode="markers+text",
                   text=[str(n) if n in top_labels else "" for n in nodes], textposition="top center",
                   hovertext=[f"{n}<br>community {colour[n]}<br>degree {G.degree(n)}" for n in nodes],
                   hoverinfo="text",
                   marker=dict(size=[6 + 30 * size[n] / smax for n in nodes],
                               color=[colour[n] for n in nodes], colorscale="Turbo", line=dict(width=0.5))),
    ])
    fig.update_layout(showlegend=False, height=650, xaxis=dict(visible=False), yaxis=dict(visible=False),
                      margin=dict(l=0, r=0, t=30, b=0))
    return fig


# ---------- communities ----------
with tabs[2]:
    algo = st.selectbox("Algorithm", list(comms))
    st.dataframe(pd.DataFrame({a: {"communities": c["count"], "modularity": round(c["modularity"], 4)}
                               for a, c in comms.items()}).T)
    parts = comms[algo]["communities"]
    cmap = A.node_community_map(parts)
    if len(G) <= 2000:
        size_by = st.selectbox("Node size", A.METRICS, index=4, key="size")
        labels = set(cent["betweenness"].nlargest(10).index)
        st.plotly_chart(network_figure(G, cmap, cent[size_by].to_dict(), labels), use_container_width=True)
    else:
        st.info("Graph too large to draw interactively; see tables below.")
    st.subheader("Community profile")
    st.dataframe(A.community_table(G, parts).style.format(precision=3))
    st.subheader("Bridge nodes (connect multiple communities)")
    st.dataframe(A.bridge_nodes(G, parts, cent, k=15).style.format(precision=3))
    ari = A.ground_truth_agreement(G, parts)
    if ari is not None:
        st.metric("Agreement with real-world split (Adjusted Rand Index)", f"{ari:.3f}")

# ---------- metric comparison ----------
with tabs[3]:
    c1, c2 = st.columns(2)
    c1.plotly_chart(px.imshow(A.metric_correlation(cent), text_auto=".2f", zmin=-1, zmax=1,
                              title="Spearman rank correlation"), use_container_width=True)
    kk = min(10, max(1, len(G) // 3))
    c2.plotly_chart(px.imshow(A.top_k_overlap(cent, kk), text_auto=".2f", zmin=0, zmax=1,
                              title=f"Top-{kk} set overlap"), use_container_width=True)
    x = st.selectbox("X metric", A.METRICS, 0); y = st.selectbox("Y metric", A.METRICS, 1)
    st.plotly_chart(px.scatter(cent, x=x, y=y, hover_name=cent.index.astype(str),
                               title=f"{x} vs {y} — off-diagonal nodes are where metrics disagree"),
                    use_container_width=True)
    d, b = cent["degree"].idxmax(), cent["betweenness"].idxmax()
    st.write(f"Highest degree: **{d}** · Highest betweenness: **{b}** → "
             + ("same node." if d == b else "different nodes: being well-connected ≠ being a bridge."))

# ---------- robustness ----------
with tabs[4]:
    st.write("Remove up to 50% of nodes in order of a strategy and track how the giant component shrinks.")
    strategies = st.multiselect("Strategies", ["random"] + A.METRICS, ["random", "degree", "betweenness", "pagerank"])
    adaptive = st.checkbox("Also run adaptive betweenness (recompute after each step — slower)", len(G) < 300)
    if st.button("Run simulation") and strategies:
        with st.spinner("Simulating removals..."):
            curves = [A.robustness(G, s, cent=cent) for s in strategies]
            if adaptive:
                curves.append(A.robustness(G, "betweenness", adaptive=True))
            curves = pd.concat(curves)
        st.plotly_chart(px.line(curves, x="removed_frac", y="giant_frac", color="strategy", markers=True,
                                labels={"removed_frac": "Fraction removed", "giant_frac": "Giant component share"}),
                        use_container_width=True)
        if curves["efficiency"].notna().any():
            st.plotly_chart(px.line(curves, x="removed_frac", y="efficiency", color="strategy",
                                    title="Global efficiency"), use_container_width=True)
        auc = curves.groupby("strategy").apply(A.robustness_auc, include_groups=False).sort_values()
        st.dataframe(auc.rename("robustness AUC (lower = more damaging)"))

# ---------- node explorer ----------
with tabs[5]:
    node = st.selectbox("Node", sorted(G, key=str), format_func=str)
    row = cent.loc[node]
    cols = st.columns(len(A.METRICS))
    for c, m in zip(cols, A.METRICS):
        c.metric(m, f"{row[m]:.4f}", f"rank {int(row[f'{m}_rank'])} / {len(G)}", delta_color="off")
    st.write("Neighbours:", ", ".join(map(str, G[node])))
