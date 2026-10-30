"""End-to-end API test against the configured database.  Run:  .venv/bin/python -m pytest tests -q"""
import uuid

from fastapi.testclient import TestClient

from backend.main import app

c = TestClient(app)


def auth():
    email = f"t{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/api/auth/register", json={"email": email, "password": "secret123", "name": "Tester"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, email


def test_full_flow():
    h, email = auth()
    assert c.post("/api/auth/register", json={"email": email, "password": "secret123"}).status_code == 409
    assert c.post("/api/auth/login", json={"email": email, "password": "wrong!!"}).status_code == 401
    assert c.get("/api/networks").status_code == 401

    # sample dataset -> analysis
    net = c.post("/api/networks/sample", json={"dataset": "Zachary Karate Club"}, headers=h).json()
    assert net["node_count"] == 34 and net["edge_count"] == 78
    res = c.post(f"/api/networks/{net['id']}/analyze", headers=h)
    assert res.status_code == 201, res.text
    res = res.json()
    assert res["summary"]["Nodes"] == 34 and len(res["metrics"]) == 34 and res["insights"]
    assert "random" in res["robustness"]["auc"]

    # manual network: nodes, edges, validation
    n = c.post("/api/networks", json={"name": "Manual"}, headers=h).json()
    ids = [c.post(f"/api/networks/{n['id']}/nodes", json={"label": x}, headers=h).json()["id"] for x in "ABCD"]
    assert c.post(f"/api/networks/{n['id']}/nodes", json={"label": "A"}, headers=h).status_code == 409
    for a, b in [(0, 1), (1, 2), (2, 3)]:
        assert c.post(f"/api/networks/{n['id']}/edges", json={"source_id": ids[a], "target_id": ids[b]}, headers=h).status_code == 201
    assert c.post(f"/api/networks/{n['id']}/edges", json={"source_id": ids[1], "target_id": ids[0]}, headers=h).status_code == 409
    assert c.post(f"/api/networks/{n['id']}/edges", json={"source_id": ids[0], "target_id": ids[0]}, headers=h).status_code == 422

    # CSV import with dirty rows
    csv = b"from,to,w\nA,E,2\nE,A,1\nF,F,1\n,G,1\nE,F,1\n"
    r = c.post(f"/api/networks/{n['id']}/import", files={"file": ("e.csv", csv, "text/csv")},
               data={"source": "from", "target": "to", "weight": "w"}, headers=h)
    assert r.status_code == 200, r.text
    rep = r.json()["report"]
    assert rep["dropped_self_loops"] == 1 and rep["dropped_missing"] == 1 and rep["merged_duplicates"] == 1
    assert r.json()["network"]["node_count"] == 6

    # JSON import
    js = b'{"nodes":[{"id":"Z"}],"edges":[{"source":"E","target":"B"}]}'
    assert c.post(f"/api/networks/{n['id']}/import", files={"file": ("g.json", js, "application/json")}, headers=h).status_code == 200

    # headerless edge list ("1,2" first row is data) and a one-column node list
    r = c.post(f"/api/networks/{n['id']}/import", files={"file": ("e2.csv", b"from,to\nA,Q\n", "text/csv")}, headers=h)
    assert r.json()["report"]["header_row"] is True
    r = c.post(f"/api/networks/{n['id']}/import", files={"file": ("e3.csv", b"101,102\n102,103\n", "text/csv")}, headers=h)
    assert r.status_code == 200 and r.json()["report"]["header_row"] is False and r.json()["report"]["edges"] == 2
    r = c.post(f"/api/networks/{n['id']}/import", files={"file": ("nodes.csv", b"104\n105\n105\n", "text/csv")}, headers=h)
    assert r.status_code == 200 and r.json()["report"]["nodes_added"] == 2
    big = b"".join(f"{i},{i + 1}\n".encode() for i in range(200_000))
    r = c.post(f"/api/networks/{n['id']}/import", files={"file": ("big.csv", big, "text/csv")}, headers=h)
    assert r.status_code == 413 and "sample_large_graph" in r.json()["detail"]

    c.post(f"/api/networks/{n['id']}/analyze", headers=h).raise_for_status()
    p = c.get(f"/api/networks/{n['id']}/people/{ids[1]}", headers=h).json()
    assert p["metrics"]["label"] == "B" and p["degree"] == 3
    for fmt in ("csv", "json", "md"):
        assert c.get(f"/api/networks/{n['id']}/reports/export?format={fmt}", headers=h).status_code == 200
    rb = c.post(f"/api/networks/{n['id']}/robustness", json={"strategies": ["degree"]}, headers=h)
    assert rb.status_code == 200 and "degree" in rb.json()["auc"]

    # names file: relabel by ID, keep extra columns, relabel stored analysis, IDs still match afterwards
    r = c.post(f"/api/networks/{n['id']}/names", files={"file": ("names.csv", b"id,name,city\n101,Asha,Pune\n102,Ravi,\n999,Nobody,X\n", "text/csv")}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["renamed"] == 2 and r.json()["unmatched"] == 1
    labels = {m["label"] for m in c.get(f"/api/networks/{n['id']}/analysis/latest", headers=h).json()["metrics"].values()}
    assert {"Asha", "Ravi"} <= labels and "101" not in labels
    before = c.get(f"/api/networks/{n['id']}", headers=h).json()["node_count"]
    r = c.post(f"/api/networks/{n['id']}/import", files={"file": ("e4.csv", b"101,103\n", "text/csv")}, headers=h)
    assert r.json()["report"]["nodes_added"] == 0 and r.json()["network"]["node_count"] == before
    asha = next(x for x in c.get(f"/api/networks/{n['id']}/graph", headers=h).json()["nodes"] if x["label"] == "Asha")
    assert asha["attributes"]["city"] == "Pune" and asha["attributes"]["source_id"] == "101"

    # access control: another user cannot see it
    h2, _ = auth()
    assert c.get(f"/api/networks/{n['id']}", headers=h2).status_code == 404

    d = c.get("/api/dashboard", headers=h).json()
    assert d["networks"] == 2 and d["recent_activity"]
    assert c.delete(f"/api/networks/{n['id']}/nodes/{ids[0]}", headers=h).status_code == 204
    assert c.delete(f"/api/networks/{n['id']}", headers=h).status_code == 204
