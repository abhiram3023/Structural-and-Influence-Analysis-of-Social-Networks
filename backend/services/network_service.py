"""Create/update networks, manage nodes and edges, validate relationships."""
import networkx as nx
from fastapi import HTTPException, status
from sqlalchemy import bindparam, delete, func, insert, or_, select, update
from sqlalchemy.orm import Session

from ..models import Activity, Edge, Network, Node


def log(db: Session, user_id: int, message: str, network_id: int | None = None):
    db.add(Activity(user_id=user_id, network_id=network_id, message=message))


def counts(db: Session, network_id: int) -> tuple[int, int]:
    n = db.scalar(select(func.count()).select_from(Node).where(Node.network_id == network_id))
    e = db.scalar(select(func.count()).select_from(Edge).where(Edge.network_id == network_id))
    return n, e


def network_out(db: Session, net: Network) -> dict:
    n, e = counts(db, net.id)
    return {"id": net.id, "name": net.name, "description": net.description, "created_at": net.created_at,
            "updated_at": net.updated_at, "node_count": n, "edge_count": e}


def touch(net: Network):
    from ..models import now
    net.updated_at = now()


def add_node(db: Session, net: Network, label: str, attributes: dict) -> Node:
    label = label.strip()
    if db.scalar(select(Node).where(Node.network_id == net.id, Node.label == label)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A person named '{label}' already exists in this network")
    node = Node(network_id=net.id, label=label, attributes=attributes or {})
    db.add(node)
    touch(net)
    db.flush()
    return node


def get_node(db: Session, net: Network, node_id: int) -> Node:
    node = db.get(Node, node_id)
    if not node or node.network_id != net.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    return node


def update_node(db: Session, net: Network, node: Node, label: str | None, attributes: dict | None) -> Node:
    if label is not None and label.strip() != node.label:
        if db.scalar(select(Node).where(Node.network_id == net.id, Node.label == label.strip())):
            raise HTTPException(status.HTTP_409_CONFLICT, f"A person named '{label}' already exists")
        node.label = label.strip()
    if attributes is not None:
        node.attributes = attributes
    touch(net)
    return node


def delete_node(db: Session, net: Network, node: Node):
    db.execute(delete(Edge).where(or_(Edge.source_id == node.id, Edge.target_id == node.id)))
    db.delete(node)
    touch(net)


def add_edge(db: Session, net: Network, source_id: int, target_id: int, weight: float) -> Edge:
    if source_id == target_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A person cannot be connected to themselves")
    get_node(db, net, source_id)
    get_node(db, net, target_id)
    u, v = sorted((source_id, target_id))
    if db.scalar(select(Edge).where(Edge.network_id == net.id, Edge.source_id == u, Edge.target_id == v)):
        raise HTTPException(status.HTTP_409_CONFLICT, "These two people are already connected")
    edge = Edge(network_id=net.id, source_id=u, target_id=v, weight=weight)
    db.add(edge)
    touch(net)
    db.flush()
    return edge


def delete_edge(db: Session, net: Network, edge_id: int):
    edge = db.get(Edge, edge_id)
    if not edge or edge.network_id != net.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Edge not found")
    db.delete(edge)
    touch(net)


def graph_payload(db: Session, net: Network) -> dict:
    nodes = db.scalars(select(Node).where(Node.network_id == net.id).order_by(Node.id)).all()
    edges = db.scalars(select(Edge).where(Edge.network_id == net.id).order_by(Edge.id)).all()
    return {"nodes": nodes, "edges": edges}


def to_networkx(db: Session, net: Network) -> nx.Graph:
    G = nx.Graph()
    for n in db.scalars(select(Node).where(Node.network_id == net.id)):
        G.add_node(n.id, label=n.label, **{k: v for k, v in (n.attributes or {}).items() if k != "label"})
    for e in db.scalars(select(Edge).where(Edge.network_id == net.id)):
        G.add_edge(e.source_id, e.target_id, weight=e.weight)
    return G


def bulk_insert(db: Session, net: Network, G: nx.Graph, label_attr: str | None = None):
    """Persist a NetworkX graph into an (empty or existing) network, merging on label.

    Uses Core bulk inserts so imports of ~100k connections take seconds rather than minutes.
    """
    label_of = (lambda n: str(G.nodes[n].get(label_attr, n))) if label_attr else str
    existing = {}
    for label, nid, attrs in db.execute(select(Node.label, Node.id, Node.attributes).where(Node.network_id == net.id)):
        existing[label] = nid
        if attrs and "source_id" in attrs:  # renamed people still match their original ID
            existing[str(attrs["source_id"])] = nid
    new_rows = []
    for n, data in G.nodes(data=True):
        label = label_of(n)
        if label not in existing:
            attrs = {k: (v if isinstance(v, (str, int, float, bool)) else str(v)) for k, v in data.items()}
            new_rows.append({"network_id": net.id, "label": label, "attributes": attrs})
            existing[label] = None
    for i in range(0, len(new_rows), 5000):
        ids = db.execute(insert(Node).returning(Node.label, Node.id), new_rows[i:i + 5000]).all()
        existing.update(dict(ids))
    lookup = {n: existing[label_of(n)] for n in G}

    have = {(u, v): eid for u, v, eid in db.execute(
        select(Edge.source_id, Edge.target_id, Edge.id).where(Edge.network_id == net.id))}
    new_edges, bumps = {}, []
    for a, b, data in G.edges(data=True):
        u, v = sorted((lookup[a], lookup[b]))
        if u == v:
            continue
        w = float(data.get("weight", 1.0))
        if (u, v) in have:
            bumps.append({"eid": have[(u, v)], "w": w})
        elif (u, v) in new_edges:
            new_edges[(u, v)]["weight"] += w
        else:
            new_edges[(u, v)] = {"network_id": net.id, "source_id": u, "target_id": v, "weight": w}
    rows = list(new_edges.values())
    for i in range(0, len(rows), 10000):
        db.execute(insert(Edge), rows[i:i + 10000])
    if bumps:
        db.execute(update(Edge).where(Edge.id == bindparam("eid")).values(weight=Edge.weight + bindparam("w")),
                   bumps, execution_options={"synchronize_session": False})
    touch(net)
    db.flush()
    return {"nodes_added": len(new_rows), "edges_added": len(rows)}
