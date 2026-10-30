import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://sna@localhost:5433/sna")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-in-production-0123456789")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
CORS_ORIGINS = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]
# dev default: any localhost port; set CORS_ORIGIN_REGEX="" and CORS_ORIGINS in production
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", r"http://(localhost|127\.0\.0\.1)(:\d+)?") or None
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", ROOT / "storage"))
(STORAGE_DIR / "uploads").mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "reports").mkdir(parents=True, exist_ok=True)
