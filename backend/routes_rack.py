import asyncio
import base64
import io
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field

from core import APP_NAME, db, logger, new_id, now_iso, put_object, require_admin
from routes_catalog import LIST_FIELDS, media, present

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


def _save_rack_image(img, filename):
    if img.width > 900:
        img = img.resize((900, int(img.height * 900 / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=86)
    path = f"{APP_NAME}/rack/{new_id()}.webp"
    res = put_object(path, buf.getvalue(), "image/webp")
    return res["path"], filename


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
    return await _store(img, file.filename or "")


async def _store(img, filename):
    try:
        path, _ = await asyncio.to_thread(_save_rack_image, img, filename)
    except Exception as e:
        logger.error(f"rack upload failed: {e}")
        raise HTTPException(502, "Image storage is temporarily unavailable.")
    await db.media.insert_one({"id": new_id(), "path": path, "content_type": "image/webp", "original_filename": filename[:120], "is_deleted": False, "created_at": now_iso()})
    return {"path": path}


CUTOUT_PROMPT = (
    "Create an e-commerce ghost-mannequin packshot of ONLY the main garment worn in this photo ({title}). "
    "Remove the person completely: no head, face, hair, skin, arms, hands, legs, feet, shoes, jewellery or bag. "
    "{extra}Show the garment front-facing, upright and symmetrical with a natural drape, fully visible from neckline/waistband to hem. "
    "Keep the EXACT colours, print, pattern, buttons, neckline, sleeves and length. "
    "Place it on a perfectly flat, uniform pure green (#00FF00) background with no shadows, no gradient, no hanger and no text."
)


def _key_out_green(raw):
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    w, h = img.size
    px = img.load()

    def is_bg(p):
        r, g, b, _ = p
        return g > 140 and g - max(r, b) > 70

    seen = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a or g <= max(r, b) + 25:
                continue
            near = any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0 for dx in (-2, 0, 2) for dy in (-2, 0, 2))
            if near:
                px[x, y] = (r, max(r, b), b, a)
    bbox = img.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
    if not bbox or (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) < 0.05 * w * h:
        raise ValueError("no garment found")
    return img.crop(bbox)


@admin_router.post("/auto/{product_id}")
async def auto_cutout(product_id: str):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "Automatic cutouts are not configured.")
    try:
        from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
    except ImportError:
        raise HTTPException(503, "Automatic cutouts are not available on this server.")
    p = await db.products.find_one({"id": product_id}, {"_id": 0, "title": 1, "category": 1, "images": 1})
    if not p or not p.get("images"):
        raise HTTPException(404, "Product or product photo not found.")
    src = p["images"][0].get("path_lg") or p["images"][0]["path"]
    try:
        raw = (await media(src)).body
    except Exception:
        raise HTTPException(404, "Product photo could not be loaded.")
    extra = "Only the trousers/bottoms. " if p.get("category") == "trousers" else "Only the top/kurta/dress — not the trousers or bottoms. " if p.get("category") != "dresses" else ""
    chat = LlmChat(api_key=key, session_id=f"rack-{new_id()}", system_message="You are a fashion product photo retoucher.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=CUTOUT_PROMPT.format(title=p.get("title", "garment"), extra=extra), file_contents=[ImageContent(base64.b64encode(raw).decode())])
    try:
        _, images = await asyncio.wait_for(chat.send_message_multimodal_response(msg), timeout=110)
        if not images:
            raise ValueError("no image returned")
        cut = await asyncio.to_thread(_key_out_green, base64.b64decode(images[0]["data"]))
    except Exception as e:
        logger.error(f"auto cutout failed for {product_id}: {type(e).__name__}")
        raise HTTPException(502, "Could not create a cutout this time. Please try again or upload one manually.")
    return await _store(cut, f"auto-{product_id}.webp")
