# Findings: Structural and Influence Analysis of Social Networks

_Note: centrality measures structural importance, not proven real-world persuasion or causal influence._

## Zachary Karate Club

| Metric | Value |
|---|---|
| Nodes | 34 |
| Edges | 78 |
| Density | 0.1390 |
| Average degree | 4.5882 |
| Connected components | 1 |
| Giant component share | 1.0000 |
| Avg clustering coefficient | 0.5706 |
| Transitivity | 0.2557 |
| Degree assortativity | -0.4756 |
| Diameter (giant comp.) | 5 |
| Avg shortest path (giant comp.) | 2.4082 |

**Top 5 nodes by metric**

- degree: 33, 0, 32, 2, 1
- betweenness: 0, 33, 32, 2, 31
- closeness: 0, 2, 33, 31, 32
- eigenvector: 33, 0, 2, 32, 1
- pagerank: 33, 0, 32, 2, 1

**Findings**

- Most-connected node is **33**; top bridge (betweenness) is **0** — different nodes, so connectivity and brokerage are distinct roles.
- Lowest rank correlation is between **eigenvector** and **pagerank** (ρ = 0.61): these metrics disagree most about who matters.
- Louvain found **4** communities (modularity 0.427); best modularity overall: Louvain (0.427).
- Densest community: #2 (density 0.67); most self-contained (lowest conductance): #0.
- Key bridges across communities: 0, 33, 32, 2, 31.
- 1 articulation points (single nodes whose removal disconnects the graph), e.g. 0.
- Robustness (area under giant-component curve, lower = more damaging): betweenness (adaptive) 0.124; pagerank 0.133; degree 0.138; betweenness 0.143; random 0.375. The most damaging attack is **betweenness (adaptive)**, versus random 0.375.
- Louvain vs the real club split: Adjusted Rand Index = 0.491.

Figures: `outputs/zachary_karate_club/`

## Les Miserables

| Metric | Value |
|---|---|
| Nodes | 77 |
| Edges | 254 |
| Density | 0.0868 |
| Average degree | 6.5974 |
| Connected components | 1 |
| Giant component share | 1.0000 |
| Avg clustering coefficient | 0.5731 |
| Transitivity | 0.4989 |
| Degree assortativity | -0.1652 |
| Diameter (giant comp.) | 5 |
| Avg shortest path (giant comp.) | 2.6411 |

**Top 5 nodes by metric**

- degree: Valjean, Gavroche, Marius, Javert, Thenardier
- betweenness: Valjean, Myriel, Gavroche, Marius, Fantine
- closeness: Valjean, Marius, Thenardier, Javert, Gavroche
- eigenvector: Gavroche, Valjean, Enjolras, Marius, Bossuet
- pagerank: Valjean, Marius, Myriel, Cosette, Enjolras

**Findings**

- Most-connected node is **Valjean**; top bridge (betweenness) is **Valjean** — the same node.
- Lowest rank correlation is between **closeness** and **pagerank** (ρ = 0.65): these metrics disagree most about who matters.
- Louvain found **6** communities (modularity 0.565); best modularity overall: Louvain (0.565).
- Densest community: #5 (density 1.00); most self-contained (lowest conductance): #2.
- Key bridges across communities: Valjean, Myriel, Gavroche, Marius, Fantine.
- 8 articulation points (single nodes whose removal disconnects the graph), e.g. Valjean, Fauchelevent, MmeBurgon, Gavroche, MlleGillenormand.
- Robustness (area under giant-component curve, lower = more damaging): betweenness (adaptive) 0.100; betweenness 0.128; degree 0.132; pagerank 0.140; random 0.369. The most damaging attack is **betweenness (adaptive)**, versus random 0.369.

Figures: `outputs/les_miserables/`

## Florentine Families

| Metric | Value |
|---|---|
| Nodes | 15 |
| Edges | 20 |
| Density | 0.1905 |
| Average degree | 2.6667 |
| Connected components | 1 |
| Giant component share | 1.0000 |
| Avg clustering coefficient | 0.1600 |
| Transitivity | 0.1915 |
| Degree assortativity | -0.3748 |
| Diameter (giant comp.) | 5 |
| Avg shortest path (giant comp.) | 2.4857 |

**Top 5 nodes by metric**

- degree: Medici, Guadagni, Strozzi, Albizzi, Tornabuoni
- betweenness: Medici, Guadagni, Albizzi, Salviati, Ridolfi
- closeness: Medici, Ridolfi, Albizzi, Tornabuoni, Guadagni
- eigenvector: Medici, Strozzi, Ridolfi, Tornabuoni, Guadagni
- pagerank: Medici, Guadagni, Strozzi, Albizzi, Tornabuoni

**Findings**

- Most-connected node is **Medici**; top bridge (betweenness) is **Medici** — the same node.
- Lowest rank correlation is between **betweenness** and **eigenvector** (ρ = 0.68): these metrics disagree most about who matters.
- Louvain found **4** communities (modularity 0.398); best modularity overall: Greedy modularity (0.399).
- Densest community: #3 (density 1.00); most self-contained (lowest conductance): #1.
- Key bridges across communities: Medici, Guadagni, Albizzi, Salviati, Ridolfi.
- 4 articulation points (single nodes whose removal disconnects the graph), e.g. Albizzi, Guadagni, Medici, Salviati.
- Robustness (area under giant-component curve, lower = more damaging): betweenness (adaptive) 0.162; degree 0.189; pagerank 0.189; betweenness 0.222; random 0.344. The most damaging attack is **betweenness (adaptive)**, versus random 0.344.

Figures: `outputs/florentine_families/`

## Davis Southern Women

| Metric | Value |
|---|---|
| Nodes | 18 |
| Edges | 139 |
| Density | 0.9085 |
| Average degree | 15.4444 |
| Connected components | 1 |
| Giant component share | 1.0000 |
| Avg clustering coefficient | 0.9367 |
| Transitivity | 0.9284 |
| Degree assortativity | -0.1764 |
| Diameter (giant comp.) | 2 |
| Avg shortest path (giant comp.) | 1.0915 |

**Top 5 nodes by metric**

- degree: Theresa Anderson, Evelyn Jefferson, Sylvia Avondale, Nora Fayette, Ruth DeSand
- betweenness: Theresa Anderson, Evelyn Jefferson, Sylvia Avondale, Nora Fayette, Ruth DeSand
- closeness: Theresa Anderson, Evelyn Jefferson, Sylvia Avondale, Nora Fayette, Ruth DeSand
- eigenvector: Verne Sanderson, Theresa Anderson, Sylvia Avondale, Nora Fayette, Helen Lloyd
- pagerank: Theresa Anderson, Evelyn Jefferson, Sylvia Avondale, Brenda Rogers, Laura Mandeville

**Findings**

- Most-connected node is **Theresa Anderson**; top bridge (betweenness) is **Theresa Anderson** — the same node.
- Lowest rank correlation is between **degree** and **pagerank** (ρ = 0.65): these metrics disagree most about who matters.
- Louvain found **2** communities (modularity 0.152); best modularity overall: Louvain (0.152).
- Densest community: #0 (density 1.00); most self-contained (lowest conductance): #0.
- Key bridges across communities: Verne Sanderson, Sylvia Avondale, Nora Fayette, Helen Lloyd, Evelyn Jefferson.
- 0 articulation points (single nodes whose removal disconnects the graph).
- Robustness (area under giant-component curve, lower = more damaging): betweenness 0.375; betweenness (adaptive) 0.375; degree 0.375; pagerank 0.375; random 0.375. The most damaging attack is **betweenness**, versus random 0.375.

Figures: `outputs/davis_southern_women/`
