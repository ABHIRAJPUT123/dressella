import asyncio
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from core import db, client, logger, init_storage
from seed import run_seed, seed_media, MEDIA_DIR
import routes_catalog
from routes_auth import router as auth_router
from routes_catalog import router as catalog_router
from routes_orders import router as orders_router
from routes_account import router as account_router
from routes_admin import router as admin_router
from routes_exchanges import customer_router as exchange_customer_router, admin_router as exchange_admin_router

app = FastAPI(
    title="DRESSELLA API",
    docs_url="/docs",
    redoc_url="/redoc"
)

ALLOWED_ORIGINS = [o.strip() for o in os.environ["CORS_ORIGINS"].split(",") if o.strip()]
MAX_BODY = 1 * 1024 * 1024
MAX_UPLOAD_BODY = 9 * 1024 * 1024
MAX_EXCHANGE_BODY = 3 * 1024 * 1024


@app.middleware("http")
async def guard(request: Request, call_next):
    cl = int(request.headers.get("content-length") or 0)
    limit = MAX_UPLOAD_BODY if request.url.path.endswith("/admin/upload") else MAX_EXCHANGE_BODY if request.url.path == "/api/exchanges" else MAX_BODY
    if cl > limit:
        return JSONResponse({"detail": "Request too large"}, status_code=413)
    # CSRF defence for cookie auth: unsafe browser requests must come from an allowed origin.
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and not request.url.path.startswith("/api/webhooks/"):
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    try:
        response = await call_next(request)
    except Exception as e:
        logger.exception(f"unhandled {request.method} {request.url.path}: {e}")
        return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith(("/api/auth", "/api/account", "/api/admin", "/api/checkout", "/api/orders", "/api/exchanges")):
        response.headers["Cache-Control"] = "no-store"
    return response


# Local fallback for seed media until it is uploaded to object storage
_orig_media = routes_catalog.media


@app.get("/api/media/anora/seed/{name}", include_in_schema=False)
async def seed_media_file(name: str):
    rec = await db.media.find_one({"path": f"anora/seed/{name}"}, {"uploaded": 1})
    local = MEDIA_DIR / Path(name).name
    if rec and not rec.get("uploaded") and local.exists():
        return Response(local.read_bytes(), media_type="image/webp", headers={"Cache-Control": "public, max-age=86400"})
    return await _orig_media(f"anora/seed/{name}")


app.include_router(auth_router)
app.include_router(catalog_router)
app.include_router(orders_router)
app.include_router(account_router)
app.include_router(admin_router)
app.include_router(exchange_customer_router)
app.include_router(exchange_admin_router)


@app.get("/api/health")
async def health():
    try:
        await asyncio.wait_for(db.command("ping"), timeout=2)
        return {"status": "ok", "db": "ok"}
    except Exception:
        return JSONResponse({"status": "degraded", "db": "unreachable"}, status_code=503)


app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    try:
        await asyncio.wait_for(db.command("ping"), timeout=5)
        await run_seed()
    except Exception:
        logger.error("MongoDB connection or required index initialization failed; verify database configuration and availability.")
        raise RuntimeError("MongoDB is unavailable or database initialization failed.") from None
    if not os.environ.get("EMERGENT_LLM_KEY"):
        logger.info("object storage is not configured; serving seed media locally")
        asyncio.create_task(seed_media())
        return
    try:
        await asyncio.to_thread(init_storage)
        asyncio.create_task(seed_media())
    except Exception as e:
        logger.error(f"storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
