"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { Core } from "cytoscape";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useTheme } from "@/lib/theme";

export interface VNode {
  id: number;
  label: string;
  color: string;
  size: number; // 0..1
}
export interface VEdge {
  id: number;
  source: number;
  target: number;
  weight: number;
}

interface Props {
  nodes: VNode[];
  edges: VEdge[];
  selected?: number | null;
  highlight?: string;
  showLabels?: "all" | "top" | "none";
  onSelect?: (id: number | null) => void;
  height?: number;
  /** IDs of single points of failure (articulation points); when given, they are drawn as warnings and the rest fades. */
  vulnerable?: number[];
}

// Drawing (and especially laying out) more than this freezes the browser, so big graphs get a backbone view.
const MAX_NODES = 300;
const MAX_EDGES = 3000;

/** Most influential people (by size), plus the selected person and their neighbours, with the strongest links among them. */
function backbone(nodes: VNode[], edges: VEdge[], selected: number | null | undefined, pinned: Set<number>) {
  if (nodes.length <= MAX_NODES && edges.length <= MAX_EDGES) return { nodes, edges, reduced: false };
  const keep = new Set([...nodes].sort((a, b) => b.size - a.size).slice(0, MAX_NODES).map((n) => n.id));
  pinned.forEach((id) => keep.add(id)); // vulnerable people must be visible even if they rank low
  if (selected != null) {
    keep.add(selected);
    edges
      .filter((e) => e.source === selected || e.target === selected)
      .slice(0, 40)
      .forEach((e) => keep.add(e.source === selected ? e.target : e.source));
  }
  const size = new Map(nodes.map((n) => [n.id, n.size]));
  const strength = (e: VEdge) => Math.min(size.get(e.source) ?? 0, size.get(e.target) ?? 0);
  const touchesSel = (e: VEdge) => e.source === selected || e.target === selected;
  const inner = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  let kept = inner;
  if (inner.length > MAX_EDGES) {
    const ranked = [...inner.filter(touchesSel), ...inner.filter((e) => !touchesSel(e)).sort((a, b) => strength(b) - strength(a))];
    // first give every person a few of their strongest links (so nobody floats unconnected), then fill by strength
    const per = new Map<number, number>();
    const chosen = new Set<VEdge>();
    for (const e of ranked) {
      if (chosen.size >= MAX_EDGES) break;
      if ((per.get(e.source) ?? 0) < 3 || (per.get(e.target) ?? 0) < 3 || touchesSel(e)) {
        chosen.add(e);
        per.set(e.source, (per.get(e.source) ?? 0) + 1);
        per.set(e.target, (per.get(e.target) ?? 0) + 1);
      }
    }
    for (const e of ranked) {
      if (chosen.size >= MAX_EDGES) break;
      chosen.add(e);
    }
    kept = [...chosen];
  }
  const linked = new Set(kept.flatMap((e) => [e.source, e.target]));
  return { nodes: nodes.filter((n) => keep.has(n.id) && (linked.has(n.id) || n.id === selected || pinned.has(n.id))), edges: kept, reduced: true };
}

/** Interactive network graph (Cytoscape.js): zoom, pan, search highlight, click to select. */
export default function GraphView({ nodes: allNodes, edges: allEdges, selected, highlight = "", showLabels = "top", onSelect, height = 560, vulnerable }: Props) {
  const isBig = allNodes.length > MAX_NODES || allEdges.length > MAX_EDGES;
  // only big graphs depend on the selection (to pull the selected person into view); small ones never rebuild on click
  const selKey = isBig ? selected : null;
  const weak = useMemo(() => new Set(vulnerable ?? []), [vulnerable]);
  const view = useMemo(() => backbone(allNodes, allEdges, selKey, weak), [allNodes, allEdges, selKey, weak]);
  const warn = weak.size > 0;
  const { nodes, edges } = view;
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // (re)build when graph structure changes
  useEffect(() => {
    if (!ref.current) return;
    const big = nodes.length > 150;
    const dark = theme === "dark";
    const ink = dark ? "#e2e8f0" : "#334155"; // labels and highlighted edges
    const ring = dark ? "#f8fafc" : "#0f172a"; // selected / search-hit outline
    const topCut = [...nodes].sort((a, b) => b.size - a.size)[Math.min(9, nodes.length - 1)]?.size ?? 0;
    const instance = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map((n) => ({
          data: { id: String(n.id), label: n.label, color: n.color, size: 14 + n.size * 36, top: n.size >= topCut ? 1 : 0 },
          classes: weak.has(n.id) ? "vulnerable" : "",
        })),
        ...edges.map((e) => ({ data: { id: `e${e.id}`, source: String(e.source), target: String(e.target), w: e.weight } })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            width: "data(size)",
            height: "data(size)",
            "border-width": 1,
            "border-color": dark ? "#0f172a" : "#fff",
            label: showLabels === "all" ? "data(label)" : "",
            "font-size": 9,
            color: ink,
            "text-outline-color": dark ? "#0f172a" : "#ffffff",
            "text-outline-width": 1,
            "text-valign": "top",
            "text-margin-y": -3,
          },
        },
        ...(showLabels === "top" ? [{ selector: "node[top = 1]", style: { label: "data(label)" } }] : []),
        { selector: "edge", style: { width: 1, "line-color": dark ? "#475569" : "#cbd5e1", opacity: big ? 0.4 : 0.8, "curve-style": "haystack" } },
        // single points of failure: everything else steps back so the warnings stand out on first render
        ...(warn
          ? [
              { selector: "node", style: { opacity: 0.55 } },
              { selector: "edge", style: { opacity: big ? 0.25 : 0.5 } },
              {
                selector: "node.vulnerable",
                style: {
                  opacity: 1,
                  "background-color": "#ea580c",
                  width: "mapData(size, 14, 50, 22, 58)",
                  height: "mapData(size, 14, 50, 22, 58)",
                  "border-width": 4,
                  "border-color": "#7f1d1d",
                  // naming every weak point clutters big graphs; click one to see its name
                  ...(weak.size <= 25 ? { label: "data(label)" } : {}),
                  "z-index": 15,
                },
              },
            ]
          : []),
        { selector: ".faded", style: { opacity: 0.12 } },
        { selector: ".hit", style: { "border-width": 3, "border-color": ring, label: "data(label)", "z-index": 10 } },
        { selector: "node:selected", style: { "border-width": 4, "border-color": ring, label: "data(label)", "z-index": 20 } },
        { selector: "edge.near", style: { "line-color": ink, width: 2, opacity: 1 } },
      ],
      layout: big
        ? { name: "cose", animate: false, randomize: true, numIter: 300, nodeRepulsion: () => 8000 }
        : { name: "cose", animate: false, randomize: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 60 },
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 4,
    });
    instance.on("tap", "node", (ev) => onSelectRef.current?.(Number(ev.target.id())));
    instance.on("tap", (ev) => {
      if (ev.target === instance) onSelectRef.current?.(null);
    });
    cy.current = instance;
    return () => instance.destroy();
  }, [nodes, edges, showLabels, theme, weak, warn]);

  // selection + neighbourhood highlight
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    c.batch(() => {
      c.elements().removeClass("faded near").unselect();
      if (selected != null) {
        const n = c.getElementById(String(selected));
        if (n.nonempty()) {
          n.select();
          const hood = n.closedNeighborhood();
          c.elements().not(hood).addClass("faded");
          n.connectedEdges().addClass("near");
        }
      }
    });
  }, [selected, nodes, edges, theme]);

  // search highlight
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    const q = highlight.trim().toLowerCase();
    c.nodes().removeClass("hit");
    if (!q) return;
    const hits = c.nodes().filter((n) => String(n.data("label")).toLowerCase().includes(q));
    hits.addClass("hit");
    if (hits.nonempty() && hits.length < 20) c.animate({ fit: { eles: hits.closedNeighborhood(), padding: 60 } }, { duration: 300 });
  }, [highlight, nodes, theme]);

  const zoom = (f: number) => {
    const c = cy.current;
    if (c) c.zoom({ level: c.zoom() * f, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } });
  };

  return (
    <div className="relative rounded-lg border border-slate-200 bg-slate-50">
      <div ref={ref} style={{ height }} className="w-full" />
      <div className="pointer-events-none absolute bottom-2 left-2 right-12 flex flex-col items-start gap-1">
        {warn && (
          <p className="flex items-center gap-2 rounded-md border border-red-200 bg-surface/95 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[#7f1d1d] bg-[#ea580c]" aria-hidden />
            Structural Weakness (Removing this breaks the network)
            <span className="font-normal text-slate-500">· {weak.size.toLocaleString()}</span>
          </p>
        )}
        {view.reduced && (
          <p className="rounded-md bg-surface/90 px-2 py-1 text-xs text-slate-600">
            Showing the {nodes.length.toLocaleString()} most influential of {allNodes.length.toLocaleString()} people
            {warn && " (plus every weak point)"} and {edges.length.toLocaleString()} of {allEdges.length.toLocaleString()} connections. Use People or search to find others.
          </p>
        )}
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {[
          { f: () => zoom(1.25), i: <ZoomIn className="h-4 w-4" />, t: "Zoom in" },
          { f: () => zoom(0.8), i: <ZoomOut className="h-4 w-4" />, t: "Zoom out" },
          { f: () => cy.current?.fit(undefined, 30), i: <Maximize2 className="h-4 w-4" />, t: "Fit" },
        ].map((b) => (
          <button key={b.t} onClick={b.f} title={b.t} aria-label={b.t} className="rounded-md border border-slate-200 bg-surface p-1.5 text-slate-600 hover:bg-slate-100">
            {b.i}
          </button>
        ))}
      </div>
    </div>
  );
}
