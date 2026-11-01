import hashlib
import hmac
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from pricing import (coupon_discount, compute_totals, valid_phone, valid_pincode,  # noqa: E402
                     razorpay_payment_signature_ok, razorpay_webhook_signature_ok)

S = {"shipping_flat": 99, "free_shipping_threshold": 2500}


def test_phone_validation():
    assert valid_phone("9876543210")
    assert valid_phone("+91 9876543210")
    assert not valid_phone("1234567890")
    assert not valid_phone("98765")


def test_pincode_validation():
    assert valid_pincode("302001")
    assert not valid_pincode("012345")
    assert not valid_pincode("30200")


def test_totals_shipping_threshold():
    assert compute_totals(2000, 0, S) == {"subtotal": 2000, "discount": 0, "shipping": 99, "total": 2099}
    assert compute_totals(2600, 0, S)["shipping"] == 0
    assert compute_totals(2600, 200, S)["shipping"] == 99
    assert compute_totals(0, 0, S)["total"] == 0


def test_coupon_rules():
    c = {"active": True, "type": "percent", "value": 10, "min_subtotal": 1500, "max_discount": 500}
    assert coupon_discount(c, 2000) == (200, None)
    assert coupon_discount(c, 9000) == (500, None)
    assert coupon_discount(c, 1000)[1]
    assert coupon_discount({**c, "active": False}, 2000)[1]
    exp = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert coupon_discount({**c, "expires_at": exp}, 2000)[1] == "This code has expired."
    assert coupon_discount({**c, "max_uses": 1, "used_count": 1}, 2000)[1]
    assert coupon_discount({"active": True, "type": "fixed", "value": 5000}, 1200) == (1200, None)
    assert coupon_discount(None, 1000)[1]


def test_payment_signature():
    sig = hmac.new(b"secret", b"order_1|pay_1", hashlib.sha256).hexdigest()
    assert razorpay_payment_signature_ok("order_1", "pay_1", sig, "secret")
    assert not razorpay_payment_signature_ok("order_1", "pay_2", sig, "secret")
    assert not razorpay_payment_signature_ok("order_1", "pay_1", sig, "")


def test_webhook_signature():
    body = json.dumps({"event": "payment.captured"}).encode()
    sig = hmac.new(b"whsec", body, hashlib.sha256).hexdigest()
    assert razorpay_webhook_signature_ok(body, sig, "whsec")
    assert not razorpay_webhook_signature_ok(body + b" ", sig, "whsec")
    assert not razorpay_webhook_signature_ok(body, None, "whsec")
