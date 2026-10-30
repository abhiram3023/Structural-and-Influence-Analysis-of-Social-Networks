#!/usr/bin/env bash
# Starts local PostgreSQL (port 5433), the FastAPI backend (8000) and the Next.js frontend (3000).
set -e
cd "$(dirname "$0")"
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8

if [ ! -d .pgdata ]; then
  initdb -D .pgdata -U sna --auth=trust -E UTF8 --locale=en_US.UTF-8 >/dev/null
fi
if ! pg_ctl -D .pgdata status >/dev/null 2>&1; then
  pg_ctl -D .pgdata -o "-p 5433 -k /tmp" -l .pgdata/server.log start
  sleep 2
fi
createdb -h localhost -p 5433 -U sna sna 2>/dev/null || true

[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -r requirements.txt; }
[ -d frontend/node_modules ] || npm --prefix frontend install

.venv/bin/uvicorn backend.main:app --reload --port 8000 &
API=$!
trap 'kill $API 2>/dev/null' EXIT
npm --prefix frontend run dev
