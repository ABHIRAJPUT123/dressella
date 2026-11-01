import asyncio
import json
import os
import re
import secrets
from datetime import timedelta
from typing import List, Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from pymongo.errors import DuplicateKeyError, PyMongoError

from core import client, db, now, now_iso, new_id, get_optional_user, get_settings, rate_limit, logger
from pricing import valid_phone, valid_pincode, coupon_discount, compute_totals, MAX_QTY_PER_LINE, razorpay_payment_signature_ok, razorpay_webhook_signature_ok
from routes_catalog import bust_cache
import emails

router = APIRouter(prefix="/api", tags=["orders"])


def rzp_keys():
    return os.environ.get("RAZORPAY_KEY_ID", ""), os.environ.get("RAZORPAY_KEY_SECRET", "")


def razorpay_configuration_issue():
    key_id, key_secret = rzp_keys()
    webhook_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    mode = os.environ.get("RAZORPAY_MODE", "").strip().lower()
    if not key_id or not key_secret or not webhook_secret or mode not in ("test", "live"):
        return "Razorpay credentials, webhook secret, and RAZORPAY_MODE must all be configured."
    expected_prefix = f"rzp_{mode}_"
    if not key_id.startswith(expected_prefix):
        return "RAZORPAY_MODE does not match the configured Razorpay key ID."
    return None


def payment_configured():
    return razorpay_configuration_issue() is None


class LineIn(BaseModel):
    product_id: str = Field(max_length=64)
    size: str = Field(max_length=10)
    qty: int = Field(ge=1, le=MAX_QTY_PER_LINE)


class CartIn(BaseModel):
    items: List[LineIn] = Field(max_length=30)
    coupon_code: Optional[str] = Field(None, max_length=30)


class AddressIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(max_length=16)
    line1: str = Field(min_length=3, max_length=160)
    line2: str = Field("", max_length=160)
    city: str = Field(min_length=2, max_length=60)
    state: str = Field(min_length=2, max_length=60)
    pincode: str = Field(max_length=6)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        if not valid_phone(v):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return v.replace(" ", "")[-10:]

    @field_validator("pincode")
    @classmethod
    def _pin(cls, v):
        if not valid_pincode(v):
            raise ValueError("Enter a valid 6-digit PIN code")
        return v


class CheckoutIn(CartIn):
    email: EmailStr
    shipping: AddressIn
    payment_method: str = Field("razorpay", pattern=r"^(razorpay|cod)$")
    billing_same: bool = True
    billing: Optional[AddressIn] = None
    idempotency_key: str = Field(min_length=12, max_length=64)
    save_address: bool = False


async def price_cart(items, coupon_code):
    requested = {}
    for item in items:
        key = (item.product_id, item.size)
        requested[key] = requested.get(key, 0) + item.qty
    ids = list({product_id for product_id, _ in requested})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids) or 1)}
    lines, issues = [], []
    for (product_id, size_name), requested_qty in requested.items():
        p = prods.get(product_id)
        if not p or p.get("status") != "published":
            issues.append({"product_id": product_id, "size": size_name, "issue": "unavailable", "message": "This item is no longer available."})
            continue
        size = next((s for s in p.get("sizes", []) if s["size"] == size_name), None)
        stock = size.get("stock", 0) if size else 0
        if stock <= 0:
            issues.append({"product_id": product_id, "size": size_name, "issue": "out_of_stock", "message": f"{p['title']} in size {size_name} is out of stock."})
            continue
        qty = min(requested_qty, stock, MAX_QTY_PER_LINE)
        if qty < requested_qty:
            issues.append({"product_id": product_id, "size": size_name, "issue": "qty_reduced", "message": f"Only {qty} available for {p['title']} ({size_name})."})
        img = (p.get("images") or [{}])[0].get("path", "")
        lines.append({"product_id": p["id"], "slug": p["slug"], "sku": p["sku"], "title": p["title"], "size": size_name, "color": p.get("color", {}).get("name", ""),
                      "qty": qty, "unit_price": p["price"], "compare_at_price": p.get("compare_at_price"), "line_total": p["price"] * qty, "image": img, "max_qty": min(stock, MAX_QTY_PER_LINE)})
    subtotal = sum(l["line_total"] for l in lines)
    discount, coupon_error, coupon = 0, None, None
    if coupon_code:
        coupon = await db.coupons.find_one({"code": coupon_code.strip().upper()}, {"_id": 0})
        discount, coupon_error = coupon_discount(coupon, subtotal)
    settings = await get_settings()
    totals = compute_totals(subtotal, discount, settings)
    return {"lines": lines, "issues": issues, "totals": totals, "coupon": {"code": coupon["code"], "description": coupon.get("description", "")} if coupon and not coupon_error else None,
            "coupon_error": coupon_error, "free_shipping_threshold": settings.get("free_shipping_threshold")}


@router.post("/cart/validate", dependencies=[Depends(rate_limit("cart", 120, 60))])
async def validate_cart(body: CartIn):
    return await price_cart(body.items, body.coupon_code)


def order_number():
    return "ANR" + now().strftime("%y%m") + str(secrets.randbelow(900000) + 100000)


def public_order(o, full=True):
    keys = ["id", "order_number", "email", "status", "payment_method", "payment_status", "lines", "totals", "coupon", "shipping", "created_at", "timeline", "tracking", "paid_at", "cod_collected_at"]
    out = {k: o.get(k) for k in keys}
    out["payment_method"] = o.get("payment_method", "razorpay")
    if not full:
        out.pop("email")
    return out


def _safe_pymongo_diagnostic(error):
    details = getattr(error, "details", None)
    message = details.get("errmsg") if isinstance(details, dict) else None
    message = message or str(error)
    message = re.sub(
        r"(mongodb(?:\+srv)?://)[^@\s]+@",
        r"\1[REDACTED]@",
        message,
        flags=re.IGNORECASE,
    )
    message = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[REDACTED_EMAIL]", message)
    message = re.sub(r"(?<!\w)\+?\d[\d\s().-]{8,}\d(?!\w)", "[REDACTED_PHONE]", message)
    message = re.sub(
        r"(?i)\b(password|passwd|secret|token|api[_-]?key)(=|:)([^,\s&}]+)",
        r"\1\2[REDACTED]",
        message,
    )
    return message[:500]


async def create_cod_order(order):
    """Create a COD order and reserve its inventory in one transaction."""
    async def create(session):
        existing = await db.orders.find_one(
            {"idempotency_key": order["idempotency_key"]}, {"_id": 0}, session=session)
        if existing:
            return existing

        quantities = {}
        for line in order["lines"]:
            key = (line["product_id"], line["size"])
            quantities[key] = quantities.get(key, 0) + line["qty"]
        for (product_id, size), qty in quantities.items():
            product = await db.products.find_one(
                {"id": product_id, "status": "published",
                 "sizes": {"$elemMatch": {"size": size, "stock": {"$gte": qty}}}},
                {"_id": 0, "id": 1}, session=session)
            if not product:
                raise HTTPException(409, "Product availability changed. Please review your bag and try again.")

        for (product_id, size), qty in quantities.items():
            result = await db.products.update_one(
                {"id": product_id, "status": "published",
                 "sizes": {"$elemMatch": {"size": size, "stock": {"$gte": qty}}}},
                {"$inc": {"sizes.$.stock": -qty, "sales_count": qty}}, session=session)
            if result.modified_count != 1:
                raise HTTPException(409, "Product availability changed. Please review your bag and try again.")

        if order.get("coupon"):
            await db.coupons.update_one(
                {"code": order["coupon"]["code"]}, {"$inc": {"used_count": 1}}, session=session)
            order["coupon_usage_reserved"] = True
        await db.orders.insert_one(dict(order), session=session)
        return order

    session = await client.start_session()
    async with session:
        try:
            created = await session.with_transaction(create)
        except HTTPException:
            raise
        except DuplicateKeyError:
            created = await db.orders.find_one({"idempotency_key": order["idempotency_key"]}, {"_id": 0})
            if not created:
                raise HTTPException(409, "The order could not be created. Please try again.") from None
        except PyMongoError as error:
            logger.error(
                "COD order transaction failed (%s, code=%s): %s",
                type(error).__name__,
                getattr(error, "code", None),
                _safe_pymongo_diagnostic(error),
            )
            if getattr(error, "code", None) == 20:
                raise HTTPException(
                    503,
                    "Cash on Delivery requires MongoDB transactions. Configure MongoDB as a replica set or use a replica-set/sharded deployment.",
                ) from None
            raise HTTPException(503, "We couldn't safely reserve your items. Please try again.") from None
    if created.get("payment_method") != "cod":
        raise HTTPException(409, "This checkout key was already used for another payment method.")
    bust_cache()
    return created


async def create_rzp_order(order):
    if not payment_configured():
        raise HTTPException(503, razorpay_configuration_issue())
    if order.get("razorpay_order_id"):
        return existing_rzp_order(order)
    claim = new_id()
    claimed = await db.orders.update_one(
        {"id": order["id"], "payment_status": "pending", "status": "pending_payment",
         "razorpay_order_id": {"$exists": False},
         "$or": [{"razorpay_creation_started_at": {"$exists": False}},
                 {"razorpay_creation_started_at": {"$lt": now() - timedelta(seconds=60)}}]},
        {"$set": {"razorpay_creation_token": claim, "razorpay_creation_started_at": now()}})
    if claimed.modified_count != 1:
        current = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        if current and current.get("razorpay_order_id"):
            return existing_rzp_order(current)
        raise HTTPException(409, "Payment setup is already in progress. Please retry shortly.")

    key, secret = rzp_keys()
    total = order["totals"]["total"]
    if type(total) is not int or total <= 0:
        await db.orders.update_one(
            {"id": order["id"], "razorpay_creation_token": claim},
            {"$unset": {"razorpay_creation_token": "", "razorpay_creation_started_at": ""}})
        raise HTTPException(400, "The order total is invalid for payment.")
    payload = {"amount": total * 100, "currency": "INR", "receipt": order["order_number"], "notes": {"order_id": order["id"]}}
    try:
        rc = razorpay.Client(auth=(key, secret))
        rz = await asyncio.wait_for(asyncio.to_thread(rc.order.create, payload), timeout=15)
    except Exception:
        await db.orders.update_one(
            {"id": order["id"], "razorpay_creation_token": claim},
            {"$unset": {"razorpay_creation_token": "", "razorpay_creation_started_at": ""}})
        logger.error("Razorpay order creation failed.")
        raise HTTPException(502, "Payment gateway is temporarily unavailable. Your bag is saved — please try again shortly.")
    if (not isinstance(rz, dict) or rz.get("amount") != payload["amount"] or rz.get("currency") != "INR"
            or not isinstance(rz.get("id"), str) or not rz["id"]):
        await db.orders.update_one(
            {"id": order["id"], "razorpay_creation_token": claim},
            {"$unset": {"razorpay_creation_token": "", "razorpay_creation_started_at": ""}})
        logger.error("Razorpay returned an invalid order response.")
        raise HTTPException(502, "Payment gateway returned an invalid response. Please retry.")
    result = await db.orders.update_one(
        {"id": order["id"], "payment_status": "pending", "status": "pending_payment", "razorpay_creation_token": claim},
        {"$set": {"razorpay_order_id": rz["id"]},
         "$push": {"payment_attempts": {"razorpay_order_id": rz["id"], "at": now_iso()}},
         "$unset": {"razorpay_creation_token": "", "razorpay_creation_started_at": ""}})
    if result.matched_count != 1:
        raise HTTPException(409, "This order is no longer available for payment.")
    return {"key_id": key, "order_id": rz["id"], "amount": rz["amount"], "currency": "INR"}


def existing_rzp_order(order):
    key, _ = rzp_keys()
    return {
        "key_id": key,
        "order_id": order["razorpay_order_id"],
        "amount": order["totals"]["total"] * 100,
        "currency": "INR",
    }


@router.post("/checkout", dependencies=[Depends(rate_limit("checkout", 15, 600))])
async def checkout(body: CheckoutIn, request: Request):
    user = await get_optional_user(request)
    existing = await db.orders.find_one({"idempotency_key": body.idempotency_key}, {"_id": 0})
    if existing:
        if existing.get("payment_method", "razorpay") != body.payment_method:
            raise HTTPException(409, "This checkout was already submitted with a different payment method.")
        if existing["payment_status"] == "paid":
            return {"order": public_order(existing), "access_token": existing["access_token"], "payment_configured": payment_configured(), "razorpay": None}
        if existing.get("payment_method", "razorpay") == "cod":
            return {"order": public_order(existing), "access_token": existing["access_token"], "payment_configured": payment_configured(), "razorpay": None}
        rz = None
        if payment_configured() and existing.get("razorpay_order_id"):
            rz = existing_rzp_order(existing)
        elif payment_configured() and existing.get("status") == "pending_payment":
            rz = await create_rzp_order(existing)
        return {"order": public_order(existing), "access_token": existing["access_token"], "payment_configured": payment_configured(), "razorpay": rz}
    priced = await price_cart(body.items, body.coupon_code)
    if priced["issues"]:
        raise HTTPException(409, {"message": "Some items in your bag have changed. Please review your bag.", "issues": priced["issues"]})
    if body.coupon_code and priced["coupon_error"]:
        raise HTTPException(400, priced["coupon_error"])
    if not priced["lines"]:
        raise HTTPException(400, "Your bag is empty.")
    if body.payment_method == "razorpay" and not payment_configured():
        raise HTTPException(503, "Online payment is not yet configured. Select Cash on Delivery or try again later.")
    ship = body.shipping.model_dump()
    order = {"id": new_id(), "order_number": order_number(), "access_token": secrets.token_urlsafe(24), "idempotency_key": body.idempotency_key,
             "user_id": user["id"] if user else None, "email": body.email.lower(), "lines": priced["lines"], "totals": priced["totals"],
             "coupon": priced["coupon"], "shipping": ship, "billing": ship if body.billing_same or not body.billing else body.billing.model_dump(),
             "payment_method": body.payment_method,
             "status": "confirmed" if body.payment_method == "cod" else "pending_payment",
             "payment_status": "pending_collection" if body.payment_method == "cod" else "pending",
             "created_at": now_iso(),
             "timeline": [{"status": "confirmed" if body.payment_method == "cod" else "pending_payment",
                           "at": now_iso(),
                           "note": "COD order placed; payment due on delivery" if body.payment_method == "cod" else "Order placed, awaiting payment"}],
             "tracking": None, "payment_attempts": [],
             "inventory_deducted": body.payment_method == "cod",
             "is_test": not os.environ.get("RAZORPAY_KEY_ID", "").startswith("rzp_live")}
    if body.payment_method == "cod":
        order = await create_cod_order(order)
        if user and body.save_address:
            addrs = user.get("addresses", [])
            if not any(a.get("line1") == ship["line1"] and a.get("pincode") == ship["pincode"] for a in addrs):
                await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": {"id": new_id(), **ship, "is_default": not addrs}}})
        return {"order": public_order(order), "access_token": order["access_token"],
                "payment_configured": payment_configured(), "razorpay": None}
    for _ in range(3):
        try:
            await db.orders.insert_one(dict(order))
            break
        except DuplicateKeyError as e:
            if "idempotency_key" in str(e):
                existing = await db.orders.find_one({"idempotency_key": body.idempotency_key}, {"_id": 0})
                if not existing:
                    raise
                if existing.get("payment_method", "razorpay") != body.payment_method:
                    raise HTTPException(409, "This checkout was already submitted with a different payment method.")
                rz = None
                if payment_configured() and existing.get("razorpay_order_id"):
                    rz = existing_rzp_order(existing)
                elif payment_configured() and existing.get("status") == "pending_payment":
                    rz = await create_rzp_order(existing)
                return {"order": public_order(existing), "access_token": existing["access_token"], "payment_configured": payment_configured(), "razorpay": rz}
            order["order_number"] = order_number()
    if user and body.save_address:
        addrs = user.get("addresses", [])
        if not any(a.get("line1") == ship["line1"] and a.get("pincode") == ship["pincode"] for a in addrs):
            await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": {"id": new_id(), **ship, "is_default": not addrs}}})
    rz = await create_rzp_order(order) if payment_configured() else None
    return {"order": public_order(order), "access_token": order["access_token"], "payment_configured": payment_configured(), "razorpay": rz}


async def mark_paid(razorpay_order_id, payment_id, source, amount=None, currency=None):
    """Atomically commit payment, inventory, and coupon changes; safe to retry after failures."""
    timestamp = now_iso()
    changed = False
    stock_issue = False

    async def apply_payment(session):
        nonlocal changed, stock_issue
        changed = False
        stock_issue = False
        order = await db.orders.find_one({"razorpay_order_id": razorpay_order_id}, {"_id": 0}, session=session)
        if not order:
            return None
        if order.get("payment_status") == "paid":
            return order

        late_cancel = order.get("status") == "cancelled"
        amount_mismatch = amount is not None and (
            amount != order["totals"]["total"] * 100 or currency != "INR")
        if not late_cancel and (order.get("status") != "pending_payment" or order.get("payment_status") != "pending"):
            return order

        if not late_cancel and not amount_mismatch:
            quantities = {}
            for line in order["lines"]:
                key = (line["product_id"], line["size"])
                quantities[key] = quantities.get(key, 0) + line["qty"]
            for (product_id, size), qty in quantities.items():
                product = await db.products.find_one(
                    {"id": product_id, "sizes": {"$elemMatch": {"size": size, "stock": {"$gte": qty}}}},
                    {"_id": 0, "id": 1}, session=session)
                if not product:
                    stock_issue = True
                    break

        status = "cancelled" if late_cancel else "payment_review" if amount_mismatch or stock_issue else "confirmed"
        note = ("Payment received after cancellation; refund review required." if late_cancel
                else "Captured payment amount or currency does not match the order; manual review required." if amount_mismatch
                else "Payment verified; inventory requires manual review." if stock_issue
                else "Payment verified.")
        update_fields = {
            "payment_status": "paid", "status": status, "paid_at": timestamp,
            "payment_id": payment_id, "paid_via": source,
            "inventory_deducted": not late_cancel and not amount_mismatch and not stock_issue,
        }
        if late_cancel or amount_mismatch:
            update_fields["refund_due"] = True
        if amount_mismatch:
            update_fields["payment_review"] = True
        if stock_issue:
            update_fields["stock_issue"] = True

        if not late_cancel and not amount_mismatch and not stock_issue:
            for (product_id, size), qty in quantities.items():
                result = await db.products.update_one(
                    {"id": product_id, "sizes": {"$elemMatch": {"size": size, "stock": {"$gte": qty}}}},
                    {"$inc": {"sizes.$.stock": -qty, "sales_count": qty}}, session=session)
                if result.modified_count != 1:
                    raise RuntimeError("Inventory changed during payment confirmation.")
            if order.get("coupon"):
                await db.coupons.update_one({"code": order["coupon"]["code"]}, {"$inc": {"used_count": 1}}, session=session)

        result = await db.orders.update_one(
            {"id": order["id"], "payment_status": "pending", "status": order["status"]},
            {"$set": update_fields,
             "$push": {"timeline": {"status": status, "at": timestamp, "note": note}}},
            session=session)
        if result.modified_count != 1:
            raise RuntimeError("Order changed during payment confirmation.")
        changed = True
        order.update(update_fields)
        order.setdefault("timeline", []).append({"status": status, "at": timestamp, "note": note})
        return order

    session = await client.start_session()
    async with session:
        order = await session.with_transaction(apply_payment)
    if not order:
        return None
    if order.get("status") == "cancelled" and order.get("payment_status") == "paid":
        logger.warning("Payment was received for a cancelled order; refund review is required.")
    elif changed and order.get("status") == "payment_review":
        logger.warning("A captured payment requires manual order review.")
    elif changed and stock_issue:
        logger.warning("Payment was received but inventory is unavailable; manual review is required.")
    if not changed:
        return order
    if stock_issue:
        bust_cache()
    elif order.get("status") == "confirmed":
        bust_cache()
    if order.get("status") == "confirmed":
        logger.info("A payment was verified and the order was confirmed.")
        emails.fire(emails.send_order_confirmed(order))
    return order


class VerifyIn(BaseModel):
    order_id: str = Field(max_length=64)
    access_token: str = Field(max_length=64)
    razorpay_order_id: str = Field(max_length=64)
    razorpay_payment_id: str = Field(max_length=64)
    razorpay_signature: str = Field(max_length=256)


@router.post("/checkout/verify", dependencies=[Depends(rate_limit("verify", 30, 600))])
async def verify(body: VerifyIn):
    o = await db.orders.find_one({"id": body.order_id, "access_token": body.access_token}, {"_id": 0})
    if not o or o.get("payment_method", "razorpay") != "razorpay" or o.get("razorpay_order_id") != body.razorpay_order_id:
        raise HTTPException(404, "Order not found")
    if not payment_configured():
        raise HTTPException(503, razorpay_configuration_issue())
    _, secret = rzp_keys()
    if not razorpay_payment_signature_ok(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, secret):
        await db.orders.update_one({"id": o["id"]}, {"$push": {"timeline": {"status": "payment_failed", "at": now_iso(), "note": "Signature verification failed"}}})
        raise HTTPException(400, "We could not verify this payment. If money was debited, it will be reconciled automatically or refunded.")
    o = await mark_paid(body.razorpay_order_id, body.razorpay_payment_id, "checkout_verify")
    if not o:
        raise HTTPException(404, "Order not found")
    return {"order": public_order(o)}


class FailIn(BaseModel):
    order_id: str = Field(max_length=64)
    access_token: str = Field(max_length=64)
    reason: str = Field("", max_length=300)


@router.post("/checkout/failed")
async def payment_failed(body: FailIn):
    order = await db.orders.find_one(
        {"id": body.order_id, "access_token": body.access_token}, {"_id": 0})
    if (not order or order.get("payment_method", "razorpay") != "razorpay"
            or order.get("status") != "pending_payment" or order.get("payment_status") == "paid"):
        return {"ok": False}
    r = await db.orders.update_one({"id": body.order_id, "access_token": body.access_token,
                                    "status": "pending_payment", "payment_status": {"$ne": "paid"}},
                                   {"$push": {"timeline": {"status": "payment_failed", "at": now_iso(), "note": body.reason[:300] or "Payment not completed"}}})
    return {"ok": bool(r.matched_count)}


class RetryIn(BaseModel):
    order_id: str = Field(max_length=64)
    access_token: str = Field(max_length=64)


@router.post("/checkout/retry", dependencies=[Depends(rate_limit("retry", 10, 600))])
async def retry(body: RetryIn):
    o = await db.orders.find_one({"id": body.order_id, "access_token": body.access_token}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("payment_method", "razorpay") != "razorpay":
        raise HTTPException(400, "This order does not use online payment.")
    if o["payment_status"] == "paid" or o["status"] == "cancelled":
        raise HTTPException(400, "This order can no longer be paid.")
    if not payment_configured():
        raise HTTPException(503, "Online payment is not yet configured for this store.")
    rz = existing_rzp_order(o) if o.get("razorpay_order_id") else await create_rzp_order(o)
    return {"razorpay": rz, "order": public_order(o)}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    body = await request.body()
    if len(body) > 256 * 1024:
        raise HTTPException(413, "Payload too large")
    if not payment_configured():
        raise HTTPException(503, razorpay_configuration_issue())
    if not razorpay_webhook_signature_ok(body, request.headers.get("X-Razorpay-Signature"), os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")):
        raise HTTPException(400, "Invalid signature")
    event_id = request.headers.get("X-Razorpay-Event-Id")
    if not event_id or len(event_id) > 128:
        raise HTTPException(400, "Missing or invalid event identifier")
    try:
        evt = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid webhook payload") from None
    if not isinstance(evt, dict):
        raise HTTPException(400, "Invalid webhook payload")
    kind = evt.get("event", "")
    payload = evt.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    payment = payload.get("payment")
    if not isinstance(payment, dict):
        payment = {}
    pay = payment.get("entity", {})
    if not isinstance(pay, dict):
        pay = {}
    if kind in ("payment.captured", "order.paid") and pay.get("order_id"):
        if not pay.get("id"):
            raise HTTPException(400, "Payment identifier is missing")
        if not isinstance(pay.get("amount"), int) or pay.get("currency") != "INR":
            raise HTTPException(400, "Payment amount or currency is invalid")
        order = await mark_paid(pay["order_id"], pay["id"], f"webhook:{kind}", pay["amount"], pay["currency"])
        if not order:
            raise HTTPException(404, "Order not found")
    elif kind == "payment.failed" and pay.get("order_id"):
        failure_note = pay.get("error_description", "Payment failed")
        if not isinstance(failure_note, str):
            failure_note = "Payment failed"
        result = await db.orders.update_one(
            {"razorpay_order_id": pay["order_id"], "payment_status": {"$ne": "paid"},
             "processed_payment_event_ids": {"$ne": event_id}},
            {"$push": {"timeline": {"status": "payment_failed", "at": now_iso(), "note": failure_note[:200]}},
             "$addToSet": {"processed_payment_event_ids": event_id}})
        if result.matched_count != 1:
            current = await db.orders.find_one({"razorpay_order_id": pay["order_id"]}, {"_id": 0})
            if not current:
                raise HTTPException(404, "Order not found")
            if current.get("payment_status") != "paid" and event_id not in current.get("processed_payment_event_ids", []):
                raise HTTPException(409, "Payment event could not be processed.")
    try:
        await db.webhook_events.insert_one({"event_id": event_id, "received_at": now_iso(), "event": kind, "processed": True})
    except DuplicateKeyError:
        return {"status": "duplicate"}
    return {"status": "ok"}


@router.get("/orders/view/{order_id}")
async def view_order(order_id: str, t: str):
    o = await db.orders.find_one({"id": order_id[:64], "access_token": t[:64]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    return {"order": public_order(o), "payment_configured": payment_configured()}


class TrackIn(BaseModel):
    order_number: str = Field(min_length=6, max_length=20)
    email: EmailStr


@router.post("/orders/track", dependencies=[Depends(rate_limit("track", 20, 600))])
async def track(body: TrackIn):
    o = await db.orders.find_one({"order_number": body.order_number.strip().upper(), "email": body.email.lower()}, {"_id": 0})
    if not o:
        raise HTTPException(404, "We couldn't find an order with those details.")
    out = public_order(o, full=False)
    out["shipping"] = {"city": o["shipping"]["city"], "pincode": o["shipping"]["pincode"]}
    return out
