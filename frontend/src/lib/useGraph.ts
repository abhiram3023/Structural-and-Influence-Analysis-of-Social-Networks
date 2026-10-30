"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VEdge, VNode } from "@/components/GraphView";
import { Analysis, GEdge, GNode, api, communityColor, errMsg } from "./api";

/** Loads the current network's nodes/edges and maps them to visual nodes coloured by community, sized by PageRank. */
export function useGraph(networkId: number | undefined, analysis: Analysis | null) {
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!networkId) return;
    setLoading(true);
    try {
      const r = await api.get<{ nodes: GNode[]; edges: GEdge[] }>(`/networks/${networkId}/graph`);
      setNodes(r.data.nodes);
      setEdges(r.data.edges);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [networkId]);

  useEffect(() => {
    setNodes([]);
    setEdges([]);
    reload();
  }, [reload]);

  const vnodes: VNode[] = useMemo(() => {
    const m = analysis?.metrics ?? {};
    const maxPr = Math.max(1e-9, ...Object.values(m).map((x) => x.pagerank));
    const deg = new Map<number, number>();
    edges.forEach((e) => {
      deg.set(e.source_id, (deg.get(e.source_id) ?? 0) + 1);
      deg.set(e.target_id, (deg.get(e.target_id) ?? 0) + 1);
    });
    const maxDeg = Math.max(1, ...deg.values());
    return nodes.map((n) => {
      const met = m[String(n.id)];
      return {
        id: n.id,
        label: n.label,
        color: communityColor(met?.community),
        size: met ? met.pagerank / maxPr : (deg.get(n.id) ?? 0) / maxDeg,
      };
    });
  }, [nodes, edges, analysis]);

  const vedges: VEdge[] = useMemo(
    () => edges.map((e) => ({ id: e.id, source: e.source_id, target: e.target_id, weight: e.weight })),
    [edges],
  );

  return { nodes, edges, vnodes, vedges, loading, error, reload };
}
