"""FastAPI application.  Run from the project root:  uvicorn backend.main:app --reload --port 8000"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGIN_REGEX, CORS_ORIGINS
from .db import Base, engine
from .routers import analytics, auth, networks

Base.metadata.create_all(engine)

app = FastAPI(title="Social Network Graph Analytics API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_origin_regex=CORS_ORIGIN_REGEX,
                   allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(networks.router)
app.include_router(analytics.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
