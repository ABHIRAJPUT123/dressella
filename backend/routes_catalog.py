import os
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from core import db, get_object, get_settings, new_id, now_iso, rate_limit, logger
from pricing import valid_pincode

router = APIRouter(prefix="/api", tags=["catalog"])

PUBLIC_FIELDS = {"_id": 0, "id": 1, "slug": 1, "sku": 1, "title": 1, "subtitle": 1, "price": 1, "compare_at_price": 1, "category": 1,
                 "collections": 1, "occasion": 1, "style": 1, "color": 1, "images": 1, "sizes": 1, "created_at": 1, "sales_count": 1,
                 "description": 1, "fabric": 1, "composition": 1, "fit": 1, "care": 1, "length": 1, "neckline": 1, "sleeve": 1,
                 "details": 1, "is_demo": 1, "group": 1}
LIST_FIELDS = {k: 1 for k in ["id", "slug", "sku", "title", "price", "compare_at_price", "category", "color", "images", "sizes", "sales_count", "created_at", "group", "collections"]}
LIST_FIELDS["_id"] = 0

_cache = {}


def cached(key, ttl=30):
    v = _cache.get(key)
    return v[1] if v and time.time() - v[0] < ttl else None


def bust_cache():
    _cache.clear()


def present(p, full=False):
    sizes = p.get("sizes", [])
    p["sizes"] = [{"size": s["size"], "available": s.get("stock", 0) > 0, "max_qty": min(s.get("stock", 0), 5)} for s in sizes]
    p["in_stock"] = any(s["available"] for s in p["sizes"])
    if full:
        p["sales_count"] = None
    return p


async def get_meta():
    hit = cached("meta", 30)
    if hit:
        return hit
    cats = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    cols = await db.collections.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(100)
    pub = {"status": "published"}
    cat_counts = {c["_id"]: c["n"] for c in await db.products.aggregate([{"$match": pub}, {"$group": {"_id": "$category", "n": {"$sum": 1}}}]).to_list(100)}
    col_counts = {c["_id"]: c["n"] for c in await db.products.aggregate([{"$match": pub}, {"$unwind": "$collections"}, {"$group": {"_id": "$collections", "n": {"$sum": 1}}}]).to_list(100)}
    for c in cats:
        c["count"] = cat_counts.get(c["slug"], 0)
    for c in cols:
        c["count"] = col_counts.get(c["slug"], 0)
    has_sale = await db.products.count_documents({**pub, "compare_at_price": {"$gt": 0}}) > 0
    has_sales_data = await db.products.count_documents({**pub, "sales_count": {"$gt": 0}}) > 0
    s = await get_settings()
    data = {"categories": cats, "collections": cols, "has_sale": has_sale, "has_sales_data": has_sales_data,
            "payment_configured": bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET")),
            "settings": {k: s.get(k) for k in ["announcement", "shipping_flat", "free_shipping_threshold", "delivery_estimate", "hero", "editorials", "contact_email", "contact_phone"]}}
    _cache["meta"] = (time.time(), data)
    return data


@router.get("/catalog/meta")
async def catalog_meta(response: Response):
    response.headers["Cache-Control"] = "public, max-age=30"
    return await get_meta()


def build_query(category, collection, q, sale, extra=True, size=None, color=None, occasion=None, style=None, min_price=None, max_price=None, in_stock=None):
    query = {"status": "published"}
    if category:
        query["category"] = {"$in": category.split(",")}
    if collection:
        query["collections"] = collection
    if sale:
        query["compare_at_price"] = {"$gt": 0}
    if q:
        rx = re.escape(q.strip()[:60])
        query["$or"] = [{"title": {"$regex": rx, "$options": "i"}}, {"category": {"$regex": rx, "$options": "i"}},
                        {"color.name": {"$regex": rx, "$options": "i"}}, {"fabric": {"$regex": rx, "$options": "i"}},
                        {"style": {"$regex": rx, "$options": "i"}}, {"sku": {"$regex": rx, "$options": "i"}}]
    if not extra:
        return query
    if size:
        query["sizes"] = {"$elemMatch": {"size": {"$in": size.split(",")}, "stock": {"$gt": 0}}}
    if color:
        query["color.name"] = {"$in": color.split(",")}
    if occasion:
        query["occasion"] = {"$in": occasion.split(",")}
    if style:
        query["style"] = {"$in": style.split(",")}
    if min_price is not None or max_price is not None:
        query["price"] = {**({"$gte": min_price} if min_price is not None else {}), **({"$lte": max_price} if max_price is not None else {})}
    if in_stock:
        query["sizes.stock"] = {"$gt": 0}
    return query


SORTS = {"newest": [("created_at", -1)], "price_asc": [("price", 1)], "price_desc": [("price", -1)], "popular": [("sales_count", -1), ("created_at", -1)]}


@router.get("/products", dependencies=[Depends(rate_limit("list", 240, 60))])
async def list_products(category: Optional[str] = None, collection: Optional[str] = None, q: Optional[str] = Query(None, max_length=60),
                        sale: bool = False, size: Optional[str] = None, color: Optional[str] = None, occasion: Optional[str] = None,
                        style: Optional[str] = None, min_price: Optional[int] = Query(None, ge=0), max_price: Optional[int] = Query(None, ge=0),
                        in_stock: bool = False, sort: str = "newest", page: int = Query(1, ge=1, le=500), limit: int = Query(12, ge=1, le=48)):
    query = build_query(category, collection, q, sale, True, size, color, occasion, style, min_price, max_price, in_stock)
    total = await db.products.count_documents(query)
    items = await db.products.find(query, LIST_FIELDS).sort(SORTS.get(sort, SORTS["newest"])).skip((page - 1) * limit).limit(limit).to_list(limit)
    base = build_query(category, collection, q, sale, extra=False)
    scope = await db.products.find(base, {"_id": 0, "category": 1, "sizes": 1, "color": 1, "occasion": 1, "style": 1, "price": 1}).to_list(2000)
    order = ["XS", "S", "M", "L", "XL", "2XL", "3XL"]
    facets = {
        "categories": sorted({p["category"] for p in scope}),
        "sizes": sorted({s["size"] for p in scope for s in p.get("sizes", [])}, key=lambda x: order.index(x) if x in order else 99),
        "colors": sorted({(p["color"]["name"], p["color"].get("hex", "")) for p in scope if p.get("color")}),
        "occasions": sorted({o for p in scope for o in p.get("occasion", [])}),
        "styles": sorted({o for p in scope for o in p.get("style", [])}),
        "price_min": min([p["price"] for p in scope], default=0), "price_max": max([p["price"] for p in scope], default=0),
    }
    facets["colors"] = [{"name": n, "hex": h} for n, h in facets["colors"]]
    return {"items": [present(i) for i in items], "total": total, "page": page, "pages": max(1, -(-total // limit)), "facets": facets}


@router.get("/products/by-ids")
async def products_by_ids(ids: str = Query(..., max_length=2000)):
    id_list = ids.split(",")[:40]
    items = await db.products.find({"id": {"$in": id_list}, "status": "published"}, LIST_FIELDS).to_list(40)
    m = {i["id"]: present(i) for i in items}
    return [m[i] for i in id_list if i in m]


@router.get("/products/{slug}")
async def product_detail(slug: str, response: Response):
    p = await db.products.find_one({"slug": slug[:120], "status": "published"}, PUBLIC_FIELDS)
    if not p:
        raise HTTPException(404, "Product not found")
    rel_q = {"status": "published", "id": {"$ne": p["id"]}, "$or": [{"category": p["category"]}, {"collections": {"$in": p.get("collections", [])}}]}
    related = await db.products.find(rel_q, LIST_FIELDS).limit(8).to_list(8)
    variants = []
    if p.get("group"):
        variants = await db.products.find({"group": p["group"], "status": "published"}, {"_id": 0, "slug": 1, "color": 1, "id": 1}).to_list(20)
    response.headers["Cache-Control"] = "public, max-age=15"
    return {"product": present(p, full=True), "related": [present(r) for r in related], "variants": variants}


@router.get("/search/suggest", dependencies=[Depends(rate_limit("suggest", 120, 60))])
async def suggest(q: str = Query(..., min_length=1, max_length=60)):
    query = build_query(None, None, q, False, extra=False)
    items = await db.products.find(query, LIST_FIELDS).limit(6).to_list(6)
    rx = re.compile(re.escape(q.strip()), re.I)
    meta = await get_meta()
    cats = [c for c in meta["categories"] if rx.search(c["name"]) and c["count"]]
    cols = [c for c in meta["collections"] if rx.search(c["name"]) and c["count"]]
    return {"products": [present(i) for i in items], "categories": cats, "collections": cols}


@router.get("/media/{path:path}")
async def media(path: str):
    if not path.startswith("anora/") or ".." in path:
        raise HTTPException(404, "Not found")
    rec = await db.media.find_one({"path": path, "is_deleted": False}, {"_id": 0, "content_type": 1})
    if not rec:
        raise HTTPException(404, "Not found")
    try:
        data, ctype = get_object(path)
    except Exception as e:
        logger.error(f"media fetch failed {path}: {e}")
        raise HTTPException(503, "Image temporarily unavailable")
    return Response(content=data, media_type=rec.get("content_type", ctype), headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/pages/{slug}")
async def page(slug: str):
    p = await db.pages.find_one({"slug": slug[:60]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Page not found")
    return p


@router.get("/pincode/{pin}")
async def pincode(pin: str):
    if not valid_pincode(pin):
        raise HTTPException(400, "Please enter a valid 6-digit PIN code.")
    s = await get_settings()
    return {"pincode": pin, "valid": True, "serviceability_checked": False, "message": s["delivery_estimate"]}


class NewsletterIn(BaseModel):
    email: EmailStr
    consent: bool


@router.post("/newsletter", dependencies=[Depends(rate_limit("newsletter", 5, 600))])
async def newsletter(body: NewsletterIn):
    if not body.consent:
        raise HTTPException(400, "Please confirm you agree to receive emails from DRESSELLA.")
    await db.newsletter.update_one({"email": body.email.lower()}, {"$set": {"status": "subscribed", "consent_at": now_iso(), "consent_text": "Agreed to receive DRESSELLA emails; can unsubscribe anytime."},
                                                                   "$setOnInsert": {"id": new_id(), "created_at": now_iso()}}, upsert=True)
    return {"ok": True}


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    order_number: str = Field("", max_length=30)
    message: str = Field(min_length=5, max_length=2000)


@router.post("/contact", dependencies=[Depends(rate_limit("contact", 5, 600))])
async def contact(body: ContactIn):
    await db.contact_messages.insert_one({"id": new_id(), **body.model_dump(), "status": "new", "created_at": now_iso()})
    return {"ok": True}


class ConsentIn(BaseModel):
    consent_id: str = Field(min_length=8, max_length=64)
    analytics: bool
    marketing: bool
    personalization: bool
    version: str = Field(max_length=10)


@router.post("/consent", dependencies=[Depends(rate_limit("consent", 20, 600))])
async def consent(body: ConsentIn):
    # Audit log of consent choices; no IP or personal data stored.
    await db.consent_log.insert_one({**body.model_dump(), "recorded_at": now_iso()})
    return {"ok": True}


@router.get("/sitemap.xml")
async def sitemap():
    import os
    base = os.environ["FRONTEND_URL"].rstrip("/")
    meta = await get_meta()
    prods = await db.products.find({"status": "published"}, {"_id": 0, "slug": 1, "updated_at": 1}).to_list(5000)
    urls = ["", "/shop", "/new-in", "/collections", "/about", "/contact", "/faq", "/size-guide", "/shipping-policy", "/returns", "/privacy-policy", "/terms"]
    urls += [f"/category/{c['slug']}" for c in meta["categories"] if c["count"]]
    urls += [f"/collections/{c['slug']}" for c in meta["collections"] if c["count"]]
    urls += [f"/product/{p['slug']}" for p in prods]
    xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{base}{u}</loc></url>" for u in urls) + "</urlset>"
    return Response(content=xml, media_type="application/xml")
