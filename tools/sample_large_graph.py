"""Extract an analysable sample from an edge list too large for the web app (millions of rows, GBs on disk).

Streams the file in chunks, so memory stays flat regardless of its size. Two sampling methods:

  snowball (default)  Start from a few random seed people and repeatedly add a capped number of their
                      neighbours, then keep every connection among the chosen people. Preserves local
                      structure (communities, bridges), which is what the analysis studies.
  top-degree          Keep the N most-connected people and the connections among them (the network's "core").

Usage:
  python tools/sample_large_graph.py edges.csv                          # -> edges_sample.csv, ~3000 people
  python tools/sample_large_graph.py edges.csv --people 5000 --method top-degree --max-edges 100000

The output CSV has a 'source,target' header and can be uploaded on the Import Data page.
A separate node-list file (one ID per line) is not needed: every person with a connection appears in the edges.
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

CHUNK = 10_000_000


def has_header(path: Path) -> bool:
    first = path.open().readline().strip().split(",")
    try:
        [float(x) for x in first]
        return False
    except ValueError:
        return True


def chunks(path: Path):
    header = has_header(path)
    for ch in pd.read_csv(path, header=0 if header else None, usecols=[0, 1], chunksize=CHUNK):
        ch.columns = ["s", "t"]
        yield ch.dropna()


def to_index(path: Path):
    """Map arbitrary IDs to 0..n-1 integers. Fast path when IDs are already non-negative integers."""
    first = next(chunks(path))
    if pd.api.types.is_integer_dtype(first.s) and pd.api.types.is_integer_dtype(first.t):
        mx = 0
        for ch in chunks(path):
            mx = max(mx, int(ch.s.max()), int(ch.t.max()))
            if ch.s.min() < 0 or ch.t.min() < 0:
                break
        else:
            return None, mx + 1
    codes = {}
    for ch in chunks(path):
        for v in pd.unique(pd.concat([ch.s, ch.t]).astype(str)):
            codes.setdefault(v, len(codes))
    return codes, len(codes)


def encode(ch, codes):
    if codes is None:
        return ch.s.to_numpy(np.int64), ch.t.to_numpy(np.int64)
    return ch.s.astype(str).map(codes).to_numpy(np.int64), ch.t.astype(str).map(codes).to_numpy(np.int64)


def degrees(path, codes, n):
    deg = np.zeros(n, np.int64)
    for ch in chunks(path):
        s, t = encode(ch, codes)
        deg += np.bincount(s, minlength=n) + np.bincount(t, minlength=n)
    return deg


def snowball(path, codes, n, deg, people, per_person, seeds, rng):
    # seeds: ordinary, reasonably active people (not celebrities, not near-isolated)
    lo, hi = np.percentile(deg[deg > 0], [60, 99])
    pool = np.flatnonzero((deg >= max(lo, 3)) & (deg <= hi))
    chosen = np.zeros(n, bool)
    frontier = rng.choice(pool, size=min(seeds, len(pool)), replace=False)
    chosen[frontier] = True
    wave = 0
    while chosen.sum() < people and len(frontier):
        wave += 1
        in_frontier = np.zeros(n, bool)
        in_frontier[frontier] = True
        cand_owner, cand = [], []
        for ch in chunks(path):
            s, t = encode(ch, codes)
            m = in_frontier[s] & ~chosen[t]
            cand_owner.append(s[m]); cand.append(t[m])
            m = in_frontier[t] & ~chosen[s]
            cand_owner.append(t[m]); cand.append(s[m])
        df = pd.DataFrame({"o": np.concatenate(cand_owner), "c": np.concatenate(cand)}).drop_duplicates()
        # cap neighbours taken per person so one hub doesn't swallow the sample
        df = df.sample(frac=1, random_state=int(rng.integers(1 << 31))).groupby("o").head(per_person)
        new = pd.unique(df.c.to_numpy())
        new = new[~chosen[new]][: max(0, people - int(chosen.sum()))]
        chosen[new] = True
        frontier = new
        print(f"  wave {wave}: +{len(new):,} people (total {int(chosen.sum()):,})", file=sys.stderr)
    return chosen


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edges", type=Path, help="edge list CSV: two columns (source, target), header optional")
    ap.add_argument("-o", "--out", type=Path, help="output CSV (default: <edges>_sample.csv)")
    ap.add_argument("--people", type=int, default=3000, help="target number of people (default 3000)")
    ap.add_argument("--max-edges", type=int, default=100_000, help="cap on connections kept (default 100000)")
    ap.add_argument("--method", choices=["snowball", "top-degree"], default="snowball")
    ap.add_argument("--per-person", type=int, default=12, help="snowball: neighbours added per person per wave")
    ap.add_argument("--seeds", type=int, default=5, help="snowball: number of starting people")
    ap.add_argument("--seed", type=int, default=42, help="random seed")
    a = ap.parse_args()
    out = a.out or a.edges.with_name(a.edges.stem + "_sample.csv")
    rng = np.random.default_rng(a.seed)
    t0 = time.time()

    print("Indexing IDs...", file=sys.stderr)
    codes, n = to_index(a.edges)
    print("Counting connections per person...", file=sys.stderr)
    deg = degrees(a.edges, codes, n)
    print(f"  {int((deg > 0).sum()):,} people, {int(deg.sum() // 2):,} connections", file=sys.stderr)

    if a.method == "top-degree":
        chosen = np.zeros(n, bool)
        chosen[np.argsort(deg)[::-1][: a.people]] = True
    else:
        print("Snowball sampling...", file=sys.stderr)
        chosen = snowball(a.edges, codes, n, deg, a.people, a.per_person, a.seeds, rng)

    print("Collecting connections among sampled people...", file=sys.stderr)
    parts = []
    for ch in chunks(a.edges):
        s, t = encode(ch, codes)
        m = chosen[s] & chosen[t] & (s != t)
        parts.append(np.stack([np.minimum(s[m], t[m]), np.maximum(s[m], t[m])], 1))
    e = np.unique(np.concatenate(parts), axis=0)  # undirected, de-duplicated
    if len(e) > a.max_edges:
        e = e[rng.choice(len(e), a.max_edges, replace=False)]
        print(f"  capped to {a.max_edges:,} connections (random subset)", file=sys.stderr)

    if codes is not None:
        back = np.empty(n, dtype=object)
        for k, v in codes.items():
            back[v] = k
        e = back[e]
    pd.DataFrame(e, columns=["source", "target"]).to_csv(out, index=False)
    people = len(np.unique(np.asarray(e).ravel()))
    print(f"Wrote {out}: {people:,} people, {len(e):,} connections ({time.time() - t0:.0f}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
