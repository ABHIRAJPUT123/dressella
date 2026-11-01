import asyncio
import csv
import io
import os
import re
from typing import List, Optional

import razorpay
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, Field

from core import client, db, new_id, now_iso, put_object, require_admin, require_owner, get_settings, APP_NAME, logger
from routes_catalog import bust_cache
from routes_orders import public_order, rzp_keys, payment_configured
import emails

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def page_args(page, limit):
    return (page - 1) * limit, limit


def rx(q):
    return {"$regex": re.escape(q[:60]), "$options": "i"}


@router.get("/metrics")
async def metrics():
    paid = {"payment_status": "paid"}
    agg = await db.orders.aggregate([{"$match": paid}, {"$group": {"_id": None, "revenue": {"$sum": "$totals.total"}, "n": {"$sum": 1}}}]).to_list(1)
    daily = await db.orders.aggregate([{"$match": paid}, {"$group": {"_id": {"$substr": ["$paid_at", 0, 10]}, "revenue": {"$sum": "$totals.total"}, "orders": {"$sum": 1}}},
                                       {"$sort": {"_id": -1}}, {"$limit": 30}]).to_list(30)
    top = await db.products.find({"sales_count": {"$gt": 0}}, {"_id": 0, "title": 1, "sku": 1, "sales_count": 1}).sort("sales_count", -1).limit(5).to_list(5)
    low = await db.products.aggregate([{"$match": {"status": "published"}}, {"$unwind": "$sizes"}, {"$match": {"sizes.stock": {"$lte": 2}}},
                                       {"$project": {"_id": 0, "title": 1, "sku": 1, "size": "$sizes.size", "stock": "$sizes.stock"}}, {"$limit": 20}]).to_list(20)
    return {"revenue": agg[0]["revenue"] if agg else 0, "paid_orders": agg[0]["n"] if agg else 0,
            "pending_orders": await db.orders.count_documents({"payment_status": {"$ne": "paid"}, "status": "pending_payment"}),
            "to_fulfil": await db.orders.count_documents({"status": {"$in": ["confirmed", "processing"]}}),
            "customers": await db.users.count_documents({"role": "customer"}), "subscribers": await db.newsletter.count_documents({"status": "subscribed"}),
            "exchange_requests": await db.exchange_requests.count_documents({"status": "submitted"}),
            "products": await db.products.count_documents({}), "daily": list(reversed(daily)), "top_products": top, "low_stock": low,
            "payment_configured": payment_configured(), "payment_mode": "live" if rzp_keys()[0].startswith("rzp_live") else "test",
            "email_configured": emails.email_configured(), "demo_products": await db.products.count_documents({"is_demo": True}),
            "webhook_url": os.environ["FRONTEND_URL"].rstrip("/") + "/api/webhooks/razorpay"}


# ---------- Products ----------
class SizeIn(BaseModel):
    size: str = Field(max_length=10)
    stock: int = Field(ge=0, le=100000)


class ImageIn(BaseModel):
    path: str = Field(max_length=300)
    path_lg: str = Field("", max_length=300)
    alt: str = Field("", max_length=200)


class ColorIn(BaseModel):
    name: str = Field(max_length=40)
    hex: str = Field("#000000", pattern=r"^#[0-9a-fA-F]{6}$")


class ProductIn(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    sku: str = Field(min_length=2, max_length=40)
    subtitle: str = Field("", max_length=200)
    description: str = Field("", max_length=4000)
    price: int = Field(ge=1, le=10000000)
    compare_at_price: Optional[int] = Field(None, ge=0, le=10000000)
    category: str = Field(max_length=60)
    collections: List[str] = []
    occasion: List[str] = []
    style: List[str] = []
    color: ColorIn
    group: str = Field("", max_length=60)
    sizes: List[SizeIn] = []
    images: List[ImageIn] = []
    fabric: str = Field("", max_length=200)
    composition: str = Field("", max_length=200)
    fit: str = Field("", max_length=100)
    care: str = Field("", max_length=500)
    length: str = Field("", max_length=60)
    neckline: str = Field("", max_length=60)
    sleeve: str = Field("", max_length=60)
    status: str = Field("draft", pattern=r"^(draft|published|archived)$")


@router.get("/products")
async def admin_products(q: str = "", status: str = "", category: str = "", page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    query = {}
    if q:
        query["$or"] = [{"title": rx(q)}, {"sku": rx(q)}]
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    skip, lim = page_args(page, limit)
    total = await db.products.count_documents(query)
    items = await db.products.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // limit))}


@router.get("/products/{pid}")
async def admin_product(pid: str):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    return p


async def _check_unique(body, pid=None):
    for f in ("slug", "sku"):
        other = await db.products.find_one({f: getattr(body, f), "id": {"$ne": pid}})
        if other:
            raise HTTPException(400, f"Another product already uses this {f}.")
    if body.compare_at_price and body.compare_at_price <= body.price:
        raise HTTPException(400, "Original price must be higher than the selling price to show a discount.")


@router.post("/products")
async def create_product(body: ProductIn):
    await _check_unique(body)
    p = {"id": new_id(), **body.model_dump(), "sales_count": 0, "is_demo": False, "created_at": now_iso(), "updated_at": now_iso()}
    await db.products.insert_one(dict(p))
    bust_cache()
    p.pop("_id", None)
    return p


@router.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn):
    await _check_unique(body, pid)
    r = await db.products.update_one({"id": pid}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Not found")
    bust_cache()
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/products/{pid}", dependencies=[Depends(require_owner)])
async def delete_product(pid: str):
    await db.products.delete_one({"id": pid})
    bust_cache()
    return {"ok": True}


class BulkRow(BaseModel):
    id: str = Field(max_length=64)
    price: int = Field(ge=1, le=10000000)
    compare_at_price: Optional[int] = Field(None, ge=0, le=10000000)
    sizes: List[SizeIn] = Field(max_length=20)


class BulkIn(BaseModel):
    rows: List[BulkRow] = Field(max_length=200)


@router.get("/products-bulk")
async def bulk_list():
    items = await db.products.find({}, {"_id": 0, "id": 1, "title": 1, "sku": 1, "price": 1, "compare_at_price": 1, "sizes": 1, "is_demo": 1, "status": 1, "images": {"$slice": 1}}).sort("created_at", -1).to_list(200)
    for p in items:
        p["image"] = (p.pop("images", None) or [{}])[0].get("path", "")
    return {"items": items, "demo_count": sum(1 for p in items if p.get("is_demo"))}


@router.put("/products-bulk")
async def bulk_update(body: BulkIn):
    """Saves prices & per-size stock for many products at once and clears the DEMO flag — values are now owner-confirmed."""
    updated = 0
    for r in body.rows:
        if r.compare_at_price and r.compare_at_price <= r.price:
            raise HTTPException(400, f"Original price must be higher than selling price (product {r.id[:8]}…).")
        if len({s.size for s in r.sizes}) != len(r.sizes):
            raise HTTPException(400, "Duplicate sizes in a product row.")
        res = await db.products.update_one({"id": r.id}, {"$set": {"price": r.price, "compare_at_price": r.compare_at_price or None, "sizes": [s.model_dump() for s in r.sizes],
                                                                   "is_demo": False, "updated_at": now_iso()}})
        updated += res.matched_count
    bust_cache()
    return {"updated": updated}


@router.get("/emails")
async def email_log(limit: int = Query(50, ge=1, le=200)):
    items = await db.email_log.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"items": items, "configured": emails.email_configured(), "from_name": emails.brand()}


MAX_UPLOAD = 8 * 1024 * 1024


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image must be under 8 MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > 40_000_000:
            raise HTTPException(400, "Image dimensions too large.")
        if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
            rgba = img.convert("RGBA")
            bg = Image.new("RGBA", rgba.size, (251, 248, 242, 255))
            img = Image.alpha_composite(bg, rgba).convert("RGB")
        else:
            img = img.convert("RGB")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Please upload a valid JPG, PNG or WebP image.")
    if img.format not in (None,) and img.width * img.height > 40_000_000:
        raise HTTPException(400, "Image dimensions too large.")
    base = f"{APP_NAME}/products/{new_id()}"
    out = {}
    for w, key in ((600, "path"), (1400, "path_lg")):
        c = img.copy()
        if c.width > w:
            c = c.resize((w, int(c.height * w / c.width)), Image.LANCZOS)
        buf = io.BytesIO()
        c.save(buf, "WEBP", quality=82)
        path = f"{base}-{w}.webp"
        try:
            res = await asyncio.to_thread(put_object, path, buf.getvalue(), "image/webp")
        except Exception as e:
            logger.error(f"upload failed: {e}")
            raise HTTPException(502, "Image storage is temporarily unavailable.")
        await db.media.insert_one({"id": new_id(), "path": res["path"], "content_type": "image/webp", "original_filename": (file.filename or "")[:120], "is_deleted": False, "created_at": now_iso()})
        out[key] = res["path"]
    return out


# ---------- Categories & collections ----------
class TaxonomyIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    description: str = Field("", max_length=400)
    image: str = Field("", max_length=300)
    order: int = 0
    active: bool = True


for coll in ("categories", "collections"):
    def make(coll=coll):
        @router.get(f"/{coll}", name=f"list_{coll}")
        async def _list():
            return await db[coll].find({}, {"_id": 0}).sort("order", 1).to_list(200)

        @router.put(f"/{coll}/{{slug}}", name=f"upsert_{coll}")
        async def _upsert(slug: str, body: TaxonomyIn):
            await db[coll].update_one({"slug": slug}, {"$set": body.model_dump()}, upsert=True)
            bust_cache()
            return {"ok": True}

        @router.delete(f"/{coll}/{{slug}}", name=f"delete_{coll}")
        async def _delete(slug: str):
            field = "category" if coll == "categories" else "collections"
            if await db.products.count_documents({field: slug}):
                raise HTTPException(400, "Remove products from this group first.")
            await db[coll].delete_one({"slug": slug})
            bust_cache()
            return {"ok": True}
    make()


# ---------- Orders ----------
@router.get("/orders")
async def admin_orders(q: str = "", status: str = "", payment_status: str = "", page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    query = {}
    if q:
        query["$or"] = [{"order_number": rx(q)}, {"email": rx(q)}, {"shipping.name": rx(q)}, {"shipping.phone": rx(q)}]
    if status:
        query["status"] = status
    if payment_status:
        query["payment_status"] = payment_status
    skip, lim = page_args(page, limit)
    total = await db.orders.count_documents(query)
    items = await db.orders.find(query, {"_id": 0, "access_token": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // limit))}


@router.get("/orders/{oid}")
async def admin_order(oid: str):
    o = await db.orders.find_one({"id": oid}, {"_id": 0, "access_token": 0})
    if not o:
        raise HTTPException(404, "Not found")
    return o


FLOW = {"payment_review": ["confirmed", "cancelled"], "confirmed": ["processing", "cancelled"], "processing": ["shipped", "cancelled"], "shipped": ["delivered"], "pending_payment": ["cancelled"], "delivered": [], "cancelled": [], "refunded": []}


class StatusIn(BaseModel):
    status: str = Field(max_length=20)
    note: str = Field("", max_length=300)
    carrier: str = Field("", max_length=60)
    tracking_number: str = Field("", max_length=60)
    tracking_url: str = Field("", max_length=300, pattern=r"^(https://.*)?$")


@router.patch("/orders/{oid}/status")
async def update_status(oid: str, body: StatusIn):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    if body.status not in FLOW.get(o["status"], []):
        raise HTTPException(400, f"Cannot move order from {o['status']} to {body.status}.")
    upd = {"status": body.status}
    if body.status == "shipped":
        if not body.tracking_number:
            raise HTTPException(400, "Tracking number is required to mark as shipped.")
        upd["tracking"] = {"carrier": body.carrier, "number": body.tracking_number, "url": body.tracking_url}
    if body.status == "confirmed" and o["status"] == "payment_review":
        async def confirm_review(session):
            current = await db.orders.find_one({"id": oid}, {"_id": 0}, session=session)
            if not current or current["status"] != "payment_review" or current["payment_status"] != "paid":
                raise HTTPException(409, "This order changed while you were updating it. Refresh and try again.")
            quantities = {}
            for line in current["lines"]:
                key = (line["product_id"], line["size"])
                quantities[key] = quantities.get(key, 0) + line["qty"]
            for (product_id, size), qty in quantities.items():
                product = await db.products.find_one(
                    {"id": product_id, "sizes": {"$elemMatch": {"size": size, "stock": {"$gte": qty}}}},
                    {"_id": 0, "id": 1}, session=session)
                if not product:
                    raise HTTPException(409, "Inventory is insufficient; this order cannot be confirmed.")
            for (product_id, size), qty in quantities.items():
                result = await db.products.update_one(
                    {"id": product_id, "sizes": {"$elemMatch": {"size": size, "stock": {"$gte": qty}}}},
                    {"$inc": {"sizes.$.stock": -qty, "sales_count": qty}}, session=session)
                if result.modified_count != 1:
                    raise HTTPException(409, "Inventory changed; refresh and review this order.")
            if current.get("coupon"):
                await db.coupons.update_one(
                    {"code": current["coupon"]["code"]}, {"$inc": {"used_count": 1}}, session=session)
            result = await db.orders.update_one(
                {"id": oid, "status": "payment_review", "payment_status": "paid"},
                {"$set": {**upd, "inventory_deducted": True, "payment_review": False, "stock_issue": False, "refund_due": False},
                 "$push": {"timeline": {"status": body.status, "at": now_iso(), "note": body.note}}},
                session=session)
            if result.modified_count != 1:
                raise HTTPException(409, "This order changed while you were updating it. Refresh and try again.")

        session = await client.start_session()
        async with session:
            await session.with_transaction(confirm_review)
    elif body.status == "cancelled" and (
        o["payment_status"] == "paid" or o.get("inventory_deducted", False)
    ):
        if o["payment_status"] == "paid":
            upd["refund_due"] = True
        async def cancel_paid(session):
            current = await db.orders.find_one({"id": oid}, {"_id": 0}, session=session)
            if (not current or current["status"] != o["status"]
                    or current["payment_status"] != o["payment_status"]):
                raise HTTPException(409, "This order changed while you were updating it. Refresh and try again.")
            if current.get("inventory_deducted", not current.get("stock_issue", False)):
                quantities = {}
                for line in current["lines"]:
                    key = (line["product_id"], line["size"])
                    quantities[key] = quantities.get(key, 0) + line["qty"]
                for (product_id, size), qty in quantities.items():
                    result = await db.products.update_one(
                        {"id": product_id, "sizes.size": size},
                        {"$inc": {"sizes.$.stock": qty, "sales_count": -qty}},
                        session=session)
                    if result.modified_count != 1:
                        raise HTTPException(409, "Product inventory changed; review this order before cancelling.")
                upd["inventory_deducted"] = False
            elif current.get("inventory_deducted") is None and current.get("stock_issue"):
                upd["inventory_review"] = True
            if current.get("coupon_usage_reserved") and current.get("coupon"):
                await db.coupons.update_one(
                    {"code": current["coupon"]["code"], "used_count": {"$gt": 0}},
                    {"$inc": {"used_count": -1}}, session=session)
                upd["coupon_usage_reserved"] = False
            result = await db.orders.update_one(
                {"id": oid, "status": current["status"], "payment_status": current["payment_status"]},
                {"$set": upd, "$push": {"timeline": {"status": body.status, "at": now_iso(), "note": body.note}}},
                session=session)
            if result.modified_count != 1:
                raise HTTPException(409, "This order changed while you were updating it. Refresh and try again.")

        session = await client.start_session()
        async with session:
            await session.with_transaction(cancel_paid)
    else:
        result = await db.orders.update_one(
            {"id": oid, "status": o["status"], "payment_status": o["payment_status"]},
            {"$set": upd, "$push": {"timeline": {"status": body.status, "at": now_iso(), "note": body.note}}})
        if result.modified_count != 1:
            raise HTTPException(409, "This order changed while you were updating it. Refresh and try again.")
    bust_cache()
    fresh = await db.orders.find_one({"id": oid}, {"_id": 0})
    sender = {"shipped": emails.send_order_shipped, "delivered": emails.send_order_delivered, "cancelled": emails.send_order_cancelled}.get(body.status)
    if sender:
        emails.fire(sender(fresh))
    return await admin_order(oid)


@router.post("/orders/{oid}/collect-cod")
async def collect_cod(oid: str, admin=Depends(require_admin)):
    timestamp = now_iso()
    collected_by = {"id": admin["id"], "email": admin["email"], "name": admin.get("name", "")}
    result = await db.orders.update_one(
        {"id": oid, "payment_method": "cod", "payment_status": "pending_collection",
         "status": "delivered"},
        {"$set": {"payment_status": "paid", "cod_collected_at": timestamp,
                  "cod_collected_by": collected_by},
         "$push": {"timeline": {"status": "payment_collected", "at": timestamp,
                                "note": "Cash on delivery collected"}}})
    if result.modified_count != 1:
        order = await db.orders.find_one({"id": oid}, {"_id": 0, "payment_method": 1,
                                                       "payment_status": 1, "status": 1})
        if not order:
            raise HTTPException(404, "Order not found.")
        if order.get("payment_method") != "cod":
            raise HTTPException(400, "Only COD orders can record cash collection.")
        if order.get("status") != "delivered":
            raise HTTPException(409, "COD collection can only be recorded after delivery.")
        raise HTTPException(409, "COD payment has already been collected.")
    return await admin_order(oid)


@router.post("/orders/{oid}/refund", dependencies=[Depends(require_owner)])
async def refund(oid: str):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o or o.get("payment_method", "razorpay") != "razorpay" or o["payment_status"] != "paid" or not o.get("payment_id"):
        raise HTTPException(400, "Only paid orders can be refunded.")
    if not payment_configured():
        raise HTTPException(503, "Razorpay is not configured.")
    try:
        rc = razorpay.Client(auth=rzp_keys())
        rf = await asyncio.wait_for(asyncio.to_thread(rc.payment.refund, o["payment_id"], {"amount": o["totals"]["total"] * 100}), timeout=20)
    except Exception:
        logger.error("Razorpay refund request failed.")
        raise HTTPException(502, "Refund request to Razorpay failed. Please retry or refund from the Razorpay dashboard.")
    await db.orders.update_one({"id": oid}, {"$set": {"payment_status": "refunded", "status": "refunded", "refund_id": rf.get("id"), "refund_due": False},
                                             "$push": {"timeline": {"status": "refunded", "at": now_iso(), "note": "Full refund initiated"}}})
    emails.fire(emails.send_order_refunded(await db.orders.find_one({"id": oid}, {"_id": 0})))
    return await admin_order(oid)


# ---------- Coupons ----------
class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=30, pattern=r"^[A-Z0-9_-]+$")
    description: str = Field("", max_length=200)
    type: str = Field(pattern=r"^(percent|fixed)$")
    value: int = Field(ge=1, le=100000)
    min_subtotal: int = Field(0, ge=0)
    max_discount: Optional[int] = Field(None, ge=0)
    max_uses: Optional[int] = Field(None, ge=0)
    expires_at: Optional[str] = None
    active: bool = True


@router.get("/coupons")
async def coupons():
    return await db.coupons.find({}, {"_id": 0}).sort("code", 1).to_list(500)


@router.put("/coupons/{code}")
async def upsert_coupon(code: str, body: CouponIn):
    if body.type == "percent" and body.value > 90:
        raise HTTPException(400, "Percentage discount cannot exceed 90%.")
    await db.coupons.update_one({"code": body.code}, {"$set": body.model_dump(), "$setOnInsert": {"used_count": 0, "created_at": now_iso()}}, upsert=True)
    if code != body.code:
        await db.coupons.delete_one({"code": code})
    return {"ok": True}


@router.delete("/coupons/{code}")
async def delete_coupon(code: str):
    await db.coupons.delete_one({"code": code})
    return {"ok": True}


# ---------- Customers / newsletter / messages ----------
@router.get("/customers", dependencies=[Depends(require_owner)])
async def customers(q: str = "", page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    query = {"role": "customer"}
    if q:
        query["$or"] = [{"email": rx(q)}, {"name": rx(q)}]
    skip, lim = page_args(page, limit)
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0, "password_hash": 0, "wishlist": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    emails_list = [u["email"] for u in users]
    counts = {c["_id"]: c for c in await db.orders.aggregate([{"$match": {"email": {"$in": emails_list}, "payment_status": "paid"}},
                                                               {"$group": {"_id": "$email", "orders": {"$sum": 1}, "spent": {"$sum": "$totals.total"}}}]).to_list(lim)}
    for u in users:
        c = counts.get(u["email"], {})
        u["orders"], u["spent"], u["addresses"] = c.get("orders", 0), c.get("spent", 0), len(u.get("addresses", []))
    return {"items": users, "total": total, "page": page, "pages": max(1, -(-total // limit))}


@router.get("/newsletter")
async def newsletter(q: str = "", page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200)):
    query = {"email": rx(q)} if q else {}
    skip, lim = page_args(page, limit)
    total = await db.newsletter.count_documents(query)
    items = await db.newsletter.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // limit))}


@router.get("/newsletter.csv", dependencies=[Depends(require_owner)])
async def newsletter_csv():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["email", "status", "consent_at"])
    async for s in db.newsletter.find({"status": "subscribed"}, {"_id": 0}):
        w.writerow([s["email"], s["status"], s.get("consent_at", "")])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=dressella-subscribers.csv"})


@router.patch("/newsletter/{email}")
async def unsubscribe(email: str):
    await db.newsletter.update_one({"email": email.lower()}, {"$set": {"status": "unsubscribed", "unsubscribed_at": now_iso()}})
    return {"ok": True}


@router.get("/messages")
async def messages():
    return await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------- Settings & pages ----------
class HeroIn(BaseModel):
    eyebrow: str = Field("", max_length=60)
    title: str = Field(max_length=120)
    subtitle: str = Field("", max_length=300)
    image: str = Field("", max_length=300)
    image_secondary: str = Field("", max_length=300)
    cta_primary: str = Field("Shop the Collection", max_length=40)
    cta_secondary: str = Field("Discover New Arrivals", max_length=40)


class EditorialIn(BaseModel):
    title: str = Field(max_length=120)
    text: str = Field("", max_length=400)
    image: str = Field(max_length=300)
    link: str = Field("/shop", max_length=200, pattern=r"^/.*")
    cta: str = Field("Explore", max_length=40)


class SettingsIn(BaseModel):
    announcement: str = Field("", max_length=160)
    shipping_flat: int = Field(ge=0, le=10000)
    free_shipping_threshold: int = Field(ge=0, le=1000000)
    delivery_estimate: str = Field(max_length=300)
    exchange_window_days: Optional[int] = Field(None, ge=1, le=365)
    contact_email: str = Field("", max_length=120)
    contact_phone: str = Field("", max_length=20)
    hero: HeroIn
    editorials: List[EditorialIn] = Field([], max_length=6)


@router.get("/settings")
async def get_store_settings():
    return await get_settings()


@router.put("/settings")
async def put_settings(body: SettingsIn):
    await db.settings.update_one({"key": "store"}, {"$set": body.model_dump()}, upsert=True)
    bust_cache()
    return await get_settings()


class PageIn(BaseModel):
    title: str = Field(max_length=120)
    body: str = Field(max_length=40000)
    meta_description: str = Field("", max_length=300)
    reviewed: bool = False


@router.get("/pages")
async def pages():
    return await db.pages.find({}, {"_id": 0}).sort("slug", 1).to_list(100)


@router.put("/pages/{slug}")
async def put_page(slug: str, body: PageIn):
    r = await db.pages.update_one({"slug": slug}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Page not found")
    return {"ok": True}
