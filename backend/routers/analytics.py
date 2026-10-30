"""Graph Analytics Engine + Report / Results endpoints, and the dashboard summary."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sna import analysis as A

from ..db import get_db
from ..models import Activity, AnalysisResult, Edge, Network, Node, User
from ..schemas import RobustnessIn
from ..services import analytics_engine as engine
from ..services import network_service as ns
from ..services import report_service as reports
from ..services.auth_service import current_user, owned_network

router = APIRouter(prefix="/api", tags=["analytics"])


def latest(db: Session, net: Network) -> AnalysisResult | None:
    return db.scalar(select(AnalysisResult).where(AnalysisResult.network_id == net.id)
                     .order_by(AnalysisResult.created_at.desc()).limit(1))


def require_latest(db, net):
    r = latest(db, net)
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No analysis yet. Run analysis first.")
    return r


@router.post("/networks/{network_id}/analyze", status_code=201)
def analyze(net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    G = ns.to_networkx(db, net)
    res = engine.analyse(G)
    r = AnalysisResult(network_id=net.id, **res)
    db.add(r)
    ns.log(db, net.user_id, f"Ran analysis on '{net.name}' ({G.number_of_nodes()} people)", net.id)
    db.commit()
    return reports.result_out(r)


@router.get("/networks/{network_id}/analysis/latest")
def get_latest(net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    r = latest(db, net)
    return reports.result_out(r) if r else None


@router.get("/networks/{network_id}/analysis")
def history(net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    rows = db.scalars(select(AnalysisResult).where(AnalysisResult.network_id == net.id)
                      .order_by(AnalysisResult.created_at.desc())).all()
    return [{"id": r.id, "created_at": r.created_at, "nodes": r.summary.get("Nodes"), "edges": r.summary.get("Edges"),
             "communities": r.communities["algorithms"]["Louvain"]["count"],
             "modularity": r.communities["algorithms"]["Louvain"]["modularity"]} for r in rows]


@router.post("/networks/{network_id}/robustness")
def robustness(body: RobustnessIn, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    G = ns.to_networkx(db, net)
    engine.validate(G)
    return engine.run_robustness(G, A.centralities(G), body.strategies, body.adaptive)


@router.get("/networks/{network_id}/people/{node_id}")
def person(node_id: int, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    node = ns.get_node(db, net, node_id)
    G = ns.to_networkx(db, net)
    r = latest(db, net)
    m = r.metrics if r else {}
    neighbours = [{"id": v, "label": G.nodes[v]["label"], "weight": G[node_id][v].get("weight", 1.0),
                   "edge_id": None, "pagerank": (m.get(str(v)) or {}).get("pagerank")} for v in G[node_id]]
    edge_ids = {(e.source_id, e.target_id): e.id for e in db.scalars(select(Edge).where(Edge.network_id == net.id))}
    for nb in neighbours:
        nb["edge_id"] = edge_ids.get(tuple(sorted((node_id, nb["id"]))))
    neighbours.sort(key=lambda x: -(x["pagerank"] or 0))
    return {"id": node.id, "label": node.label, "attributes": node.attributes, "degree": G.degree(node_id),
            "neighbours": neighbours, "metrics": m.get(str(node_id)), "total_nodes": G.number_of_nodes(),
            "analysed_at": r.created_at if r else None}


@router.get("/networks/{network_id}/reports/export")
def export(format: str = "md", net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    if format not in {"csv", "json", "md"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "format must be csv, json or md")
    body, name, mime = reports.export(net, require_latest(db, net), format)
    ns.log(db, net.user_id, f"Exported {format.upper()} report for '{net.name}'", net.id)
    db.commit()
    return Response(body, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    nets = db.scalars(select(Network).where(Network.user_id == user.id)).all()
    ids = [n.id for n in nets]
    total_nodes = db.scalar(select(func.count()).select_from(Node).where(Node.network_id.in_(ids))) if ids else 0
    total_edges = db.scalar(select(func.count()).select_from(Edge).where(Edge.network_id.in_(ids))) if ids else 0
    activity = db.scalars(select(Activity).where(Activity.user_id == user.id)
                          .order_by(Activity.created_at.desc()).limit(10)).all()
    return {
        "networks": len(nets),
        "total_people": total_nodes,
        "total_connections": total_edges,
        "recent_activity": [{"message": a.message, "created_at": a.created_at, "network_id": a.network_id}
                            for a in activity],
    }
