"""Network Management + Data Import endpoints."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from sna.data import BUILTIN, available_datasets, load_builtin

from ..db import get_db
from ..models import Network, User
from ..schemas import (EdgeIn, EdgeOut, GraphOut, NetworkIn, NetworkOut, NetworkUpdate, NodeIn, NodeOut,
                       NodeUpdate, SampleIn)
from ..services import import_service as imp
from ..services import network_service as ns
from ..services.auth_service import current_user, owned_network

router = APIRouter(prefix="/api", tags=["networks"])
MAX_UPLOAD = 50 * 1024 * 1024


@router.get("/datasets")
def datasets():
    return [{"name": n, "description": BUILTIN.get(n, "SNAP Facebook ego networks")} for n in available_datasets()]


@router.get("/networks", response_model=list[NetworkOut])
def list_networks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    nets = db.scalars(select(Network).where(Network.user_id == user.id).order_by(Network.updated_at.desc()))
    return [ns.network_out(db, n) for n in nets]


@router.post("/networks", response_model=NetworkOut, status_code=201)
def create_network(body: NetworkIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    net = Network(user_id=user.id, name=body.name, description=body.description)
    db.add(net)
    db.flush()
    ns.log(db, user.id, f"Created network '{net.name}'", net.id)
    db.commit()
    return ns.network_out(db, net)


@router.post("/networks/sample", response_model=NetworkOut, status_code=201)
def create_sample(body: SampleIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.dataset not in available_datasets():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown dataset")
    net = Network(user_id=user.id, name=body.dataset, description=BUILTIN.get(body.dataset, ""))
    db.add(net)
    db.flush()
    ns.bulk_insert(db, net, load_builtin(body.dataset))
    ns.log(db, user.id, f"Loaded sample dataset '{body.dataset}'", net.id)
    db.commit()
    return ns.network_out(db, net)


@router.get("/networks/{network_id}", response_model=NetworkOut)
def get_network(net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    return ns.network_out(db, net)


@router.patch("/networks/{network_id}", response_model=NetworkOut)
def update_network(body: NetworkUpdate, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    if body.name is not None:
        net.name = body.name
    if body.description is not None:
        net.description = body.description
    db.commit()
    return ns.network_out(db, net)


@router.delete("/networks/{network_id}", status_code=204)
def delete_network(net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    ns.log(db, net.user_id, f"Deleted network '{net.name}'")
    db.delete(net)
    db.commit()


@router.get("/networks/{network_id}/graph", response_model=GraphOut)
def get_graph(net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    return ns.graph_payload(db, net)


@router.post("/networks/{network_id}/nodes", response_model=NodeOut, status_code=201)
def add_node(body: NodeIn, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    node = ns.add_node(db, net, body.label, body.attributes)
    ns.log(db, net.user_id, f"Added {node.label} to '{net.name}'", net.id)
    db.commit()
    return node


@router.patch("/networks/{network_id}/nodes/{node_id}", response_model=NodeOut)
def update_node(node_id: int, body: NodeUpdate, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    node = ns.update_node(db, net, ns.get_node(db, net, node_id), body.label, body.attributes)
    db.commit()
    return node


@router.delete("/networks/{network_id}/nodes/{node_id}", status_code=204)
def delete_node(node_id: int, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    node = ns.get_node(db, net, node_id)
    ns.log(db, net.user_id, f"Removed {node.label} from '{net.name}'", net.id)
    ns.delete_node(db, net, node)
    db.commit()


@router.post("/networks/{network_id}/edges", response_model=EdgeOut, status_code=201)
def add_edge(body: EdgeIn, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    edge = ns.add_edge(db, net, body.source_id, body.target_id, body.weight)
    db.commit()
    return edge


@router.delete("/networks/{network_id}/edges/{edge_id}", status_code=204)
def delete_edge(edge_id: int, net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    ns.delete_edge(db, net, edge_id)
    db.commit()


@router.post("/networks/{network_id}/import")
async def import_file(file: UploadFile = File(...), source: str | None = Form(None), target: str | None = Form(None),
                      weight: str | None = Form(None), net: Network = Depends(owned_network),
                      db: Session = Depends(get_db)):
    # read in chunks so a multi-GB upload is rejected without loading it all into memory
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_UPLOAD:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, imp.TOO_LARGE_HINT.format(
                what=f"File is larger than {MAX_UPLOAD // 2**20} MB"))
        chunks.append(chunk)
    content = b"".join(chunks)
    name = (file.filename or "").lower()
    if name.endswith(".json"):
        G, report = imp.parse_json(content)
    elif name.endswith(".csv") or name.endswith(".txt"):
        G, report = imp.parse_csv(content, source or None, target or None, weight or None)
    else:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a .csv or .json file")
    if G.number_of_nodes() == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "No valid relationships found in file")
    n, e = ns.counts(db, net.id)
    imp.check_limits(G, n, e)
    stored = imp.save_upload(net.user_id, file.filename or "upload", content)
    report.update(ns.bulk_insert(db, net, G))
    report["stored_as"] = stored
    ns.log(db, net.user_id, f"Imported {file.filename} into '{net.name}' "
                            f"(+{report['nodes_added']} people, +{report['edges_added']} connections)", net.id)
    db.commit()
    return {"report": report, "network": ns.network_out(db, net)}


@router.post("/networks/{network_id}/names")
async def import_names(file: UploadFile = File(...), id_column: str | None = Form(None), name_column: str | None = Form(None),
                       net: Network = Depends(owned_network), db: Session = Depends(get_db)):
    content = await file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Names file larger than {MAX_UPLOAD // 2**20} MB")
    report = imp.apply_names(db, net, content, id_column or None, name_column or None)
    ns.log(db, net.user_id, f"Named {report['renamed']} people in '{net.name}' from {file.filename}", net.id)
    db.commit()
    return report
