import io
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import Binary
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from core import db, get_current_user, get_settings, new_id, now, now_iso, require_admin

customer_router = APIRouter(prefix="/api/exchanges", tags=["exchanges"])
admin_router = APIRouter(prefix="/api/admin/exchanges", tags=["admin exchanges"], dependencies=[Depends(require_admin)])

REASONS = {"Wrong size", "Wrong item", "Damaged item", "Defective item", "Other"}
ACTIVE_STATUSES = {"submitted", "approved"}
MAX_IMAGE_BYTES = 2 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def require_customer(user=Depends(get_current_user)):
    if user.get("role") != "customer":
        raise HTTPException(403, "Customer access required.")
    return user


def exchange_window_days(settings):
    days = settings.get("exchange_window_days")
    if days is None:
        return None
    if type(days) is not int or not 1 <= days <= 365:
        return None
    return days


def delivered_at(order):
    if order.get("delivered_at"):
        value = order["delivered_at"]
    else:
        value = next(
            (entry.get("at") for entry in reversed(order.get("timeline", [])) if entry.get("status") == "delivered"),
            None,
        )
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, datetime):
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def ensure_eligible(order, settings, at=None):
    if order.get("status") != "delivered":
        raise HTTPException(409, "Only delivered orders are eligible for an exchange request.")
    delivery_date = delivered_at(order)
    if delivery_date is None:
        raise HTTPException(409, "The delivery date is unavailable. Please contact DRESSELLA client care.")
    days = exchange_window_days(settings)
    if days is None:
        raise HTTPException(503, "The exchange window is not configured. Please contact DRESSELLA client care.")
    if (at or now()) > delivery_date + timedelta(days=days):
        raise HTTPException(409, "The exchange window for this order has closed.")
    return delivery_date, days


def public_request(request):
    return {key: value for key, value in request.items() if key not in ("_id", "active_key", "image")}


def _owner_query(order_id, user):
    return {"id": order_id, "user_id": user["id"]}


async def owned_order(order_id, user):
    order = await db.orders.find_one(_owner_query(order_id, user), {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found.")
    settings = await get_settings()
    delivery_date, days = ensure_eligible(order, settings)
    return order, delivery_date, days


async def replacement_options(product_id):
    purchased = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not purchased:
        raise HTTPException(409, "The purchased product is no longer available for exchange.")
    if purchased.get("group"):
        products = await db.products.find(
            {"group": purchased["group"], "status": "published"},
            {"_id": 0, "id": 1, "title": 1, "color": 1, "sizes": 1},
        ).to_list(20)
    elif purchased.get("status") == "published":
        products = await db.products.find(
            {"id": purchased["id"], "status": "published"},
            {"_id": 0, "id": 1, "title": 1, "color": 1, "sizes": 1},
        ).to_list(1)
    else:
        products = []
    return [
        {
            "product_id": product["id"],
            "title": product["title"],
            "color": product.get("color", {}).get("name", ""),
            "sizes": [{"size": size["size"], "stock": size.get("stock", 0)} for size in product.get("sizes", []) if size.get("stock", 0) > 0],
        }
        for product in products
    ]


async def normalized_image(file: Optional[UploadFile]):
    if not file:
        return None
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(400, "Upload a JPG, PNG, or WebP image.")
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Exchange images must be 2 MB or smaller.")
    try:
        source = Image.open(io.BytesIO(data))
        if source.format not in ("JPEG", "PNG", "WEBP"):
            raise HTTPException(400, "Upload a JPG, PNG, or WebP image.")
        source.verify()
        image = Image.open(io.BytesIO(data))
        if image.width * image.height > 20_000_000:
            raise HTTPException(400, "Image dimensions are too large.")
        image.load()
        image = image.convert("RGB")
        if image.width > 1600:
            image = image.resize((1600, math.ceil(image.height * 1600 / image.width)), Image.LANCZOS)
        output = io.BytesIO()
        image.save(output, "WEBP", quality=82, method=4)
        return output.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, "Please upload a valid image file.")


@customer_router.get("/policy")
async def exchange_policy():
    days = exchange_window_days(await get_settings())
    return {"exchange_window_days": days, "configured": days is not None}


@customer_router.get("/options")
async def exchange_options(order_id: str = Query(..., max_length=64), line_index: int = Query(..., ge=0), user=Depends(require_customer)):
    order, delivery_date, days = await owned_order(order_id, user)
    if line_index >= len(order.get("lines", [])):
        raise HTTPException(404, "Purchased item not found in this order.")
    line = order["lines"][line_index]
    return {
        "delivery_date": delivery_date.isoformat(),
        "exchange_window_days": days,
        "item": {"title": line.get("title", ""), "size": line.get("size", ""), "color": line.get("color", "")},
        "variants": await replacement_options(line["product_id"]),
    }


@customer_router.post("")
async def submit_exchange(
    order_id: str = Form(..., min_length=1, max_length=64),
    line_index: int = Form(..., ge=0),
    replacement_product_id: str = Form(..., min_length=1, max_length=64),
    replacement_size: str = Form(..., min_length=1, max_length=10),
    reason: str = Form(..., min_length=1, max_length=40),
    comments: str = Form("", max_length=1000),
    image: Optional[UploadFile] = File(None),
    user=Depends(require_customer),
):
    if reason not in REASONS:
        raise HTTPException(400, "Select a valid exchange reason.")
    order, delivery_date, days = await owned_order(order_id, user)
    if line_index >= len(order.get("lines", [])):
        raise HTTPException(404, "Purchased item not found in this order.")
    line = order["lines"][line_index]
    variants = await replacement_options(line["product_id"])
    variant = next((item for item in variants if item["product_id"] == replacement_product_id), None)
    if not variant:
        raise HTTPException(409, "The requested replacement product is not an available variant of this item.")
    selected_size = next((item for item in variant["sizes"] if item["size"] == replacement_size), None)
    if not selected_size:
        raise HTTPException(409, "The selected replacement size is unavailable or out of stock.")
    image_data = await normalized_image(image)
    created = now_iso()
    internal_id = new_id()
    active_key = f"{order_id}:{line_index}"
    record = {
        "id": internal_id,
        "request_id": f"ANX-{internal_id.upper()}",
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "customer_id": user["id"],
        "line_index": line_index,
        "item": {
            "product_id": line["product_id"],
            "title": line.get("title", ""),
            "sku": line.get("sku", ""),
            "size": line.get("size", ""),
            "color": line.get("color", ""),
            "qty": 1,
        },
        "replacement": {
            "product_id": variant["product_id"],
            "title": variant["title"],
            "size": replacement_size,
            "color": variant["color"],
        },
        "reason": reason,
        "comments": comments.strip(),
        "status": "submitted",
        "admin_note": "",
        "image_attached": image_data is not None,
        "delivery_date": delivery_date.isoformat(),
        "exchange_window_days": days,
        "active_key": active_key,
        "created_at": created,
        "updated_at": created,
        "timeline": [{"status": "submitted", "at": created, "note": "Exchange request submitted"}],
    }
    if image_data is not None:
        record["image"] = {"data": Binary(image_data), "content_type": "image/webp"}
    if await db.exchange_requests.find_one({"active_key": active_key}, {"_id": 1}):
        raise HTTPException(409, "An exchange request for this order item is already being reviewed.")
    try:
        await db.exchange_requests.insert_one(record)
    except DuplicateKeyError:
        raise HTTPException(409, "An exchange request for this order item is already being reviewed.") from None
    return public_request(record)


@customer_router.get("")
async def customer_exchanges(user=Depends(require_customer)):
    records = await db.exchange_requests.find({"customer_id": user["id"]}, {"_id": 0, "image": 0, "active_key": 0}).sort("created_at", -1).to_list(100)
    return [public_request(record) for record in records]


@customer_router.get("/{request_id}/image")
async def customer_exchange_image(request_id: str, user=Depends(require_customer)):
    record = await db.exchange_requests.find_one(
        {"request_id": request_id, "customer_id": user["id"]},
        {"_id": 0, "image": 1},
    )
    if not record or not record.get("image"):
        raise HTTPException(404, "Exchange image not found.")
    return Response(record["image"]["data"], media_type=record["image"]["content_type"], headers={"Cache-Control": "private, no-store"})


@customer_router.get("/{request_id}")
async def customer_exchange_detail(request_id: str, user=Depends(require_customer)):
    record = await db.exchange_requests.find_one(
        {"request_id": request_id, "customer_id": user["id"]},
        {"_id": 0, "image": 0, "active_key": 0},
    )
    if not record:
        raise HTTPException(404, "Exchange request not found.")
    return public_request(record)


class ExchangeReviewIn(BaseModel):
    status: str = Field(pattern=r"^(approved|rejected)$")
    admin_note: str = Field(min_length=1, max_length=1000)


async def admin_request(record):
    result = public_request(record)
    customer = await db.users.find_one({"id": record["customer_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    result["customer"] = customer or {"id": record["customer_id"], "name": "Customer", "email": ""}
    return result


@admin_router.get("")
async def admin_exchanges(status: str = "", page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    query = {"status": status} if status else {}
    total = await db.exchange_requests.count_documents(query)
    records = await db.exchange_requests.find(query, {"_id": 0, "image": 0, "active_key": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {
        "items": [await admin_request(record) for record in records],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
    }


@admin_router.get("/{request_id}")
async def admin_exchange_detail(request_id: str):
    record = await db.exchange_requests.find_one(
        {"request_id": request_id},
        {"_id": 0, "image": 0, "active_key": 0},
    )
    if not record:
        raise HTTPException(404, "Exchange request not found.")
    return await admin_request(record)


@admin_router.get("/{request_id}/image")
async def admin_exchange_image(request_id: str):
    record = await db.exchange_requests.find_one({"request_id": request_id}, {"_id": 0, "image": 1})
    if not record or not record.get("image"):
        raise HTTPException(404, "Exchange image not found.")
    return Response(record["image"]["data"], media_type=record["image"]["content_type"], headers={"Cache-Control": "private, no-store"})


@admin_router.patch("/{request_id}")
async def review_exchange(request_id: str, body: ExchangeReviewIn, admin=Depends(require_admin)):
    timestamp = now_iso()
    result = await db.exchange_requests.update_one(
        {"request_id": request_id, "status": "submitted"},
        {
            "$set": {"status": body.status, "admin_note": body.admin_note.strip(), "reviewed_by": admin["id"], "updated_at": timestamp},
            "$push": {"timeline": {"status": body.status, "at": timestamp, "note": body.admin_note.strip()}},
            **({"$unset": {"active_key": ""}} if body.status == "rejected" else {}),
        },
    )
    if result.modified_count != 1:
        record = await db.exchange_requests.find_one({"request_id": request_id}, {"_id": 0, "status": 1})
        if not record:
            raise HTTPException(404, "Exchange request not found.")
        raise HTTPException(409, "Only submitted requests can be approved or rejected.")
    record = await db.exchange_requests.find_one(
        {"request_id": request_id},
        {"_id": 0, "image": 0, "active_key": 0},
    )
    return await admin_request(record)
