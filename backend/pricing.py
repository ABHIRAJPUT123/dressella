import hmac
import hashlib
import re
from datetime import datetime, timezone

PHONE_RE = re.compile(r"^(?:\+91[\-\s]?|0)?[6-9]\d{9}$")
PIN_RE = re.compile(r"^[1-9]\d{5}$")
MAX_QTY_PER_LINE = 5


def valid_phone(phone: str) -> bool:
    return bool(PHONE_RE.match((phone or "").replace(" ", "")))


def valid_pincode(pin: str) -> bool:
    return bool(PIN_RE.match(pin or ""))


def coupon_discount(coupon, subtotal, now=None):
    """Returns (discount_amount, error)."""
    if not coupon or not coupon.get("active"):
        return 0, "This code is not valid."
    now = now or datetime.now(timezone.utc)
    exp = coupon.get("expires_at")
    if exp and datetime.fromisoformat(exp) < now:
        return 0, "This code has expired."
    if coupon.get("max_uses") and coupon.get("used_count", 0) >= coupon["max_uses"]:
        return 0, "This code has reached its usage limit."
    if subtotal < (coupon.get("min_subtotal") or 0):
        return 0, f"Spend at least ₹{coupon['min_subtotal']:,} to use this code."
    if coupon["type"] == "percent":
        d = round(subtotal * min(coupon["value"], 90) / 100)
        if coupon.get("max_discount"):
            d = min(d, coupon["max_discount"])
    else:
        d = coupon["value"]
    return min(d, subtotal), None


def compute_totals(subtotal, discount, settings):
    after = max(subtotal - discount, 0)
    threshold = settings.get("free_shipping_threshold") or 0
    shipping = 0 if subtotal == 0 or (threshold and after >= threshold) else settings.get("shipping_flat", 0)
    return {"subtotal": subtotal, "discount": discount, "shipping": shipping, "total": after + shipping}


def razorpay_payment_signature_ok(order_id, payment_id, signature, secret) -> bool:
    if not (secret and signature):
        return False
    expected = hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def razorpay_webhook_signature_ok(body: bytes, signature, secret) -> bool:
    if not (secret and signature):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
