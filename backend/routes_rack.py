import asyncio
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field

from core import APP_NAME, db, logger, new_id, now_iso, put_object, require_admin
from routes_catalog import LIST_FIELDS, present

public_router = APIRouter(prefix="/api", tags=["rack"])
admin_router = APIRouter(prefix="/api/admin/rack", tags=["admin-rack"], dependencies=[Depends(require_admin)])

MAX_ITEMS = 40
MAX_UPLOAD = 8 * 1024 * 1024
DEFAULT_COUNT = 24


class RackItemIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=64)
    image: Optional[str] = Field(None, max_length=300, pattern=r"^[A-Za-z0-9_\-/.]+$")


class RackIn(BaseModel):
    items: List[RackItemIn] = Field([], max_length=MAX_ITEMS)


async def _config():
    doc = await db.settings.find_one({"key": "rack"}, {"_id": 0})
    return doc.get("items") if doc else None


async def _resolve(items, published_only=True):
    ids = [i["product_id"] for i in items]
    q = {"id": {"$in": ids}}
    if published_only:
        q["status"] = "published"
    found = {p["id"]: present(p) async for p in db.products.find(q, LIST_FIELDS if published_only else {**LIST_FIELDS, "status": 1})}
    return [{"product": found[i["product_id"]], "image": i.get("image")} for i in items if i["product_id"] in found]


@public_router.get("/rack")
async def public_rack():
    items = await _config()
    if items is None:
        cur = db.products.find({"status": "published"}, LIST_FIELDS).sort("created_at", -1).limit(DEFAULT_COUNT)
        return {"configured": False, "items": [{"product": present(p), "image": None} async for p in cur]}
    return {"configured": True, "items": await _resolve(items)}


@admin_router.get("")
async def admin_rack():
    items = await _config()
    return {"configured": items is not None, "items": await _resolve(items or [], published_only=False)}


@admin_router.put("")
async def save_rack(body: RackIn):
    items = [i.model_dump() for i in body.items]
    ids = [i["product_id"] for i in items]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "Each product can only hang on the rack once.")
    existing = {p["id"] async for p in db.products.find({"id": {"$in": ids}}, {"_id": 0, "id": 1})} if ids else set()
    missing = [i for i in ids if i not in existing]
    if missing:
        raise HTTPException(400, "One or more selected products no longer exist.")
    paths = [i["image"] for i in items if i.get("image")]
    if paths:
        known = {m["path"] async for m in db.media.find({"path": {"$in": paths}, "is_deleted": False}, {"_id": 0, "path": 1})}
        if any(p not in known for p in paths):
            raise HTTPException(400, "One or more rack images could not be found. Please upload them again.")
    await db.settings.update_one({"key": "rack"}, {"$set": {"key": "rack", "items": items, "updated_at": now_iso()}}, upsert=True)
    return {"configured": True, "items": await _resolve(items, published_only=False)}


@admin_router.delete("")
async def reset_rack():
    await db.settings.update_one({"key": "rack"}, {"$unset": {"items": ""}, "$set": {"updated_at": now_iso()}})
    return {"configured": False}


@admin_router.post("/upload")
async def upload_rack_image(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image must be under 8 MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > 40_000_000:
            raise ValueError("too large")
        img = img.convert("RGBA")
    except Exception:
        raise HTTPException(400, "Please upload a valid PNG or WebP image (transparent background works best).")
    if img.width > 900:
        img = img.resize((900, int(img.height * 900 / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=86)
    path = f"{APP_NAME}/rack/{new_id()}.webp"
    try:
        res = await asyncio.to_thread(put_object, path, buf.getvalue(), "image/webp")
    except Exception as e:
        logger.error(f"rack upload failed: {e}")
        raise HTTPException(502, "Image storage is temporarily unavailable.")
    await db.media.insert_one({"id": new_id(), "path": res["path"], "content_type": "image/webp", "original_filename": (file.filename or "")[:120], "is_deleted": False, "created_at": now_iso()})
    return {"path": res["path"]}
