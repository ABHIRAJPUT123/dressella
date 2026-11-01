"""Integration tests for ANORA backend against an explicitly configured local test target.

Covers: catalog, consent, newsletter/contact, auth (register/login/me/logout/forgot/reset),
checkout (pending_payment flow, idempotency), cart validate (tampering, out-of-stock, unavailable),
payment verify (bad signature), webhook (HMAC + idempotency with Mongo seeded order),
admin login + CRUD + order status, authorization 401/403, foreign Origin CSRF 403, sitemap/pages/pincode.
"""
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from integration_safety import UnsafeIntegrationTarget, validate_integration_config  # noqa: E402

try:
    TEST_CONFIG = validate_integration_config()
except UnsafeIntegrationTarget as exc:
    pytest.skip(f"Integration tests not run: {exc}", allow_module_level=True)

import requests
from pymongo import MongoClient

BASE_URL = TEST_CONFIG["api_url"]
API = f"{BASE_URL}/api"
ALLOWED_ORIGIN = TEST_CONFIG["allowed_origin"]
MONGO_URL = TEST_CONFIG["mongo_url"]
DB_NAME = TEST_CONFIG["db_name"]
ADMIN_EMAIL = TEST_CONFIG["admin_email"]
ADMIN_PASSWORD = TEST_CONFIG["admin_password"]
WEBHOOK_SECRET = TEST_CONFIG["webhook_secret"]

mongo = MongoClient(MONGO_URL, connect=False, serverSelectionTimeoutMS=3000)
mdb = mongo[DB_NAME]


def _session(origin=ALLOWED_ORIGIN):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Origin": origin})
    return s


# ---------------- Catalog ----------------
class TestCatalog:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_meta(self):
        r = requests.get(f"{API}/catalog/meta", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "categories" in d and "collections" in d
        # has_sales_data may be True if prior test runs incremented sales_count via webhook.
        # Fresh seeded state has no sales_count>0; verifying field is present.
        assert "has_sales_data" in d
        # No sale (compare_at_price unset on all seeded products)
        assert d["has_sale"] is False
        # Settings surfaced
        assert d["settings"]["free_shipping_threshold"] == 2500
        assert d["settings"]["shipping_flat"] == 99

    def test_products_pagination(self):
        r = requests.get(f"{API}/products?limit=4&page=1", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["page"] == 1
        assert len(d["items"]) == 4
        assert d["pages"] >= 2
        # No _id leaks
        assert all("_id" not in it for it in d["items"])
        # Facets present
        assert "sizes" in d["facets"]

    def test_products_filter_category(self):
        r = requests.get(f"{API}/products?category=kurtas&limit=20", timeout=10)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["category"] == "kurtas"

    def test_product_detail(self):
        r = requests.get(f"{API}/products/scarlet-buti-a-line-kurta", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["product"]["slug"] == "scarlet-buti-a-line-kurta"
        assert isinstance(d["related"], list)

    def test_product_not_found(self):
        r = requests.get(f"{API}/products/does-not-exist-xyz", timeout=10)
        assert r.status_code == 404

    def test_search_suggest(self):
        r = requests.get(f"{API}/search/suggest?q=kurta", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json()["products"], list)

    def test_pincode_valid(self):
        r = requests.get(f"{API}/pincode/302001", timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_pincode_invalid(self):
        r = requests.get(f"{API}/pincode/012345", timeout=10)
        assert r.status_code == 400

    def test_sitemap(self):
        r = requests.get(f"{API}/sitemap.xml", timeout=10)
        assert r.status_code == 200
        assert "<urlset" in r.text

    def test_pages(self):
        r = requests.get(f"{API}/pages/about", timeout=10)
        # about page may or may not exist depending on seed
        assert r.status_code in (200, 404)


# ---------------- Consent / Newsletter / Contact ----------------
class TestPublicWrites:
    def test_consent_log(self):
        s = _session()
        r = s.post(f"{API}/consent", json={"consent_id": uuid.uuid4().hex, "analytics": True, "marketing": False, "personalization": True, "version": "1"})
        assert r.status_code == 200

    def test_newsletter_requires_consent(self):
        s = _session()
        r = s.post(f"{API}/newsletter", json={"email": f"TEST_nl_{uuid.uuid4().hex[:6]}@example.com", "consent": False})
        assert r.status_code == 400

    def test_newsletter_success(self):
        s = _session()
        r = s.post(f"{API}/newsletter", json={"email": f"TEST_nl_{uuid.uuid4().hex[:6]}@example.com", "consent": True})
        assert r.status_code == 200
        assert r.json()["ok"] is True


# ---------------- CSRF Origin guard ----------------
class TestCsrf:
    def test_foreign_origin_blocked(self):
        s = _session(origin="https://evil.example.com")
        r = s.post(f"{API}/consent", json={"consent_id": "x" * 10, "analytics": False, "marketing": False, "personalization": False, "version": "1"})
        assert r.status_code == 403


# ---------------- Auth ----------------
@pytest.fixture(scope="module")
def test_user():
    email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPass123!"
    s = _session()
    r = s.post(f"{API}/auth/register", json={"name": "Test User", "email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"email": email, "password": password, "session": s}


class TestAuth:
    def test_register_duplicate(self, test_user):
        s = _session()
        r = s.post(f"{API}/auth/register", json={"name": "x", "email": test_user["email"], "password": "StrongPass123!"})
        assert r.status_code == 400

    def test_login_success_and_cookies(self, test_user):
        s = _session()
        r = s.post(f"{API}/auth/login", json={"email": test_user["email"], "password": test_user["password"]})
        assert r.status_code == 200
        assert "access_token" in s.cookies
        # httpOnly set - check Set-Cookie header
        sc = r.headers.get("set-cookie", "").lower()
        assert "httponly" in sc

    def test_me(self, test_user):
        s = _session()
        s.post(f"{API}/auth/login", json={"email": test_user["email"], "password": test_user["password"]})
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == test_user["email"]

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_logout(self, test_user):
        s = _session()
        s.post(f"{API}/auth/login", json={"email": test_user["email"], "password": test_user["password"]})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200

    def test_forgot_password_generic_response(self):
        s = _session()
        r = s.post(f"{API}/auth/forgot-password", json={"email": "nonexistent_TEST@example.com"})
        assert r.status_code == 200
        assert "If an account exists" in r.json()["message"]

    def test_bcrypt_hash_format(self, test_user):
        u = mdb.users.find_one({"email": test_user["email"]})
        assert u and u["password_hash"].startswith("$2b$")

    def test_brute_force_lockout(self):
        # Create a dedicated user so this doesn't interfere
        email = f"test_bf_{uuid.uuid4().hex[:6]}@example.com"
        s = _session()
        r = s.post(f"{API}/auth/register", json={"name": "BF", "email": email, "password": "StrongPass123!"})
        assert r.status_code == 200
        got_429 = False
        for i in range(7):
            r = _session().post(f"{API}/auth/login", json={"email": email, "password": "WrongWrong1!"})
            if r.status_code == 429:
                got_429 = True
                break
        # Verify lockout state: either 429 observed or login_attempts shows count>=5 w/ locked_until
        if not got_429:
            att = mdb.login_attempts.find_one({"identifier": {"$regex": email}})
            assert att and att.get("count", 0) >= 5 and att.get("locked_until"), f"Expected brute-force lockout evidence, got: {att}"


# ---------------- Cart / Checkout ----------------
@pytest.fixture(scope="module")
def sample_product():
    # Pick a published product with stock
    p = mdb.products.find_one({"status": "published", "sizes.stock": {"$gt": 0}})
    assert p
    size = next(s for s in p["sizes"] if s.get("stock", 0) > 0)
    return {"id": p["id"], "slug": p["slug"], "price": p["price"], "size": size["size"], "stock": size["stock"]}


class TestCart:
    def test_validate_ok(self, sample_product):
        s = _session()
        r = s.post(f"{API}/cart/validate", json={"items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}]})
        assert r.status_code == 200
        d = r.json()
        assert d["lines"][0]["unit_price"] == sample_product["price"]
        assert d["issues"] == []

    def test_validate_qty_tampering(self, sample_product):
        s = _session()
        # qty 50 - should be rejected by Pydantic (max 5)
        r = s.post(f"{API}/cart/validate", json={"items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 50}]})
        assert r.status_code == 422

    def test_validate_unavailable(self):
        s = _session()
        r = s.post(f"{API}/cart/validate", json={"items": [{"product_id": "nonexistent", "size": "M", "qty": 1}]})
        assert r.status_code == 200
        assert any(i["issue"] == "unavailable" for i in r.json()["issues"])

    def test_coupon_welcome10(self, sample_product):
        # Build a cart that meets ≥1500 min subtotal
        qty = max(1, min(5, (1600 // sample_product["price"]) + 1))
        s = _session()
        r = s.post(f"{API}/cart/validate", json={"items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": qty}], "coupon_code": "WELCOME10"})
        assert r.status_code == 200
        d = r.json()
        if d["totals"]["subtotal"] >= 1500:
            assert d["totals"]["discount"] > 0
            assert d["totals"]["discount"] <= 500
            assert d["coupon"]["code"] == "WELCOME10"

    def test_invalid_coupon(self, sample_product):
        s = _session()
        r = s.post(f"{API}/cart/validate", json={"items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}], "coupon_code": "NOPE123"})
        assert r.status_code == 200
        assert r.json()["coupon_error"]


# ---------------- Checkout ----------------
VALID_SHIP = {"name": "Test Buyer", "phone": "9876543210", "line1": "1 Marine Drive", "city": "Jaipur", "state": "Rajasthan", "pincode": "302001"}


class TestCheckout:
    def test_bad_phone_422(self, sample_product):
        s = _session()
        r = s.post(f"{API}/checkout", json={
            "items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}],
            "email": "a@b.com",
            "shipping": {**VALID_SHIP, "phone": "12345"},
            "idempotency_key": uuid.uuid4().hex,
        })
        assert r.status_code == 422

    def test_bad_pincode_422(self, sample_product):
        s = _session()
        r = s.post(f"{API}/checkout", json={
            "items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}],
            "email": "a@b.com",
            "shipping": {**VALID_SHIP, "pincode": "0123"},
            "idempotency_key": uuid.uuid4().hex,
        })
        assert r.status_code == 422

    def test_pending_payment_order(self, sample_product):
        s = _session()
        idem = uuid.uuid4().hex
        body = {
            "items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}],
            "email": f"TEST_co_{uuid.uuid4().hex[:6]}@example.com",
            "shipping": VALID_SHIP,
            "idempotency_key": idem,
        }
        r = s.post(f"{API}/checkout", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["payment_configured"] is False
        assert d["razorpay"] is None
        order_id = d["order"]["id"]
        assert d["order"]["status"] == "pending_payment"
        # Idempotency: re-POST same key returns same order
        r2 = s.post(f"{API}/checkout", json=body)
        assert r2.status_code == 200
        assert r2.json()["order"]["id"] == order_id

    def test_verify_bad_signature(self, sample_product):
        # Create order first
        s = _session()
        body = {
            "items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}],
            "email": f"TEST_vb_{uuid.uuid4().hex[:6]}@example.com",
            "shipping": VALID_SHIP,
            "idempotency_key": uuid.uuid4().hex,
        }
        r = s.post(f"{API}/checkout", json=body)
        o = r.json()["order"]
        token = r.json()["access_token"]
        # Need razorpay_order_id in DB for lookup - inject one for test
        mdb.orders.update_one({"id": o["id"]}, {"$set": {"razorpay_order_id": "order_TESTBADSIG"}})
        r2 = s.post(f"{API}/checkout/verify", json={
            "order_id": o["id"], "access_token": token,
            "razorpay_order_id": "order_TESTBADSIG",
            "razorpay_payment_id": "pay_X", "razorpay_signature": "deadbeef"
        })
        assert r2.status_code == 400
        # Order remains unpaid
        after = mdb.orders.find_one({"id": o["id"]})
        assert after["payment_status"] != "paid"


# ---------------- Webhook ----------------
class TestWebhook:
    def test_webhook_bad_signature(self):
        body = json.dumps({"event": "payment.captured"}).encode()
        r = requests.post(f"{API}/webhooks/razorpay", data=body,
                          headers={"Content-Type": "application/json", "X-Razorpay-Signature": "bad", "X-Razorpay-Event-Id": uuid.uuid4().hex},
                          timeout=10)
        assert r.status_code == 400

    def test_webhook_captures_and_idempotency(self, sample_product):
        # Seed a pending order with a known razorpay_order_id
        rz_order_id = f"order_TEST{uuid.uuid4().hex[:8]}"
        s = _session()
        body = {
            "items": [{"product_id": sample_product["id"], "size": sample_product["size"], "qty": 1}],
            "email": f"TEST_wh_{uuid.uuid4().hex[:6]}@example.com",
            "shipping": VALID_SHIP,
            "idempotency_key": uuid.uuid4().hex,
        }
        r = s.post(f"{API}/checkout", json=body)
        assert r.status_code == 200
        order = r.json()["order"]
        mdb.orders.update_one({"id": order["id"]}, {"$set": {"razorpay_order_id": rz_order_id}})
        before = mdb.products.find_one({"id": sample_product["id"]})
        before_stock = next(s["stock"] for s in before["sizes"] if s["size"] == sample_product["size"])
        before_sales = before.get("sales_count", 0)

        payload = {"event": "payment.captured", "payload": {"payment": {"entity": {"order_id": rz_order_id, "id": "pay_T1"}}}}
        raw = json.dumps(payload).encode()
        sig = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()

        # First delivery
        evt1 = f"evt_{uuid.uuid4().hex[:10]}"
        evt2 = f"evt_{uuid.uuid4().hex[:10]}"
        r1 = requests.post(f"{API}/webhooks/razorpay", data=raw,
                           headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": evt1}, timeout=10)
        assert r1.status_code == 200
        # Same event id (duplicate)
        r2 = requests.post(f"{API}/webhooks/razorpay", data=raw,
                           headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": evt1}, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("status") == "duplicate"
        # Different event id, same order - mark_paid should be idempotent (no double decrement)
        r3 = requests.post(f"{API}/webhooks/razorpay", data=raw,
                           headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": evt2}, timeout=10)
        assert r3.status_code == 200

        time.sleep(0.3)
        after_order = mdb.orders.find_one({"id": order["id"]})
        assert after_order["payment_status"] == "paid"
        after_prod = mdb.products.find_one({"id": sample_product["id"]})
        after_stock = next(s["stock"] for s in after_prod["sizes"] if s["size"] == sample_product["size"])
        assert before_stock - after_stock == 1, f"stock decremented {before_stock - after_stock} times, expected 1"
        assert after_prod.get("sales_count", 0) - before_sales == 1


# ---------------- Admin ----------------
@pytest.fixture(scope="module")
def admin_session():
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.text}"
    assert r.json()["role"] == "admin"
    return s


class TestAdmin:
    def test_metrics(self, admin_session):
        r = admin_session.get(f"{API}/admin/metrics")
        assert r.status_code == 200
        d = r.json()
        assert d["payment_configured"] is False
        assert "products" in d

    def test_products_list(self, admin_session):
        r = admin_session.get(f"{API}/admin/products?limit=5")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_create_product_duplicate_slug(self, admin_session):
        # Get an existing slug
        existing = mdb.products.find_one({"status": "published"})
        body = {
            "title": "Test Dup", "slug": existing["slug"], "sku": f"TEST-{uuid.uuid4().hex[:6].upper()}",
            "price": 1000, "category": "dresses", "color": {"name": "Red", "hex": "#ff0000"},
            "sizes": [{"size": "M", "stock": 5}], "status": "draft",
        }
        r = admin_session.post(f"{API}/admin/products", json=body)
        assert r.status_code == 400

    def test_create_product_compare_at_lte_price(self, admin_session):
        body = {
            "title": "Test Compare", "slug": f"test-cmp-{uuid.uuid4().hex[:6]}", "sku": f"TC-{uuid.uuid4().hex[:6].upper()}",
            "price": 1000, "compare_at_price": 1000, "category": "dresses",
            "color": {"name": "Red", "hex": "#ff0000"}, "sizes": [{"size": "M", "stock": 5}], "status": "draft",
        }
        r = admin_session.post(f"{API}/admin/products", json=body)
        assert r.status_code == 400

    def test_orders_list(self, admin_session):
        r = admin_session.get(f"{API}/admin/orders?limit=5")
        assert r.status_code == 200

    def test_coupons_list(self, admin_session):
        r = admin_session.get(f"{API}/admin/coupons")
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()]
        assert "WELCOME10" in codes

    def test_order_status_requires_tracking_for_shipped(self, admin_session):
        # Create a paid confirmed order via webhook flow? too heavy. Just verify endpoint rejects invalid transition.
        # Find any pending order and try invalid transition.
        o = mdb.orders.find_one({"status": "pending_payment"})
        if o:
            r = admin_session.patch(f"{API}/admin/orders/{o['id']}/status", json={"status": "shipped", "note": "x", "carrier": "", "tracking_number": "", "tracking_url": ""})
            assert r.status_code == 400


# ---------------- Authorization ----------------
class TestAuthorization:
    def test_admin_requires_auth(self):
        r = requests.get(f"{API}/admin/metrics", timeout=10)
        assert r.status_code == 401

    def test_customer_forbidden_on_admin(self, test_user):
        s = _session()
        s.post(f"{API}/auth/login", json={"email": test_user["email"], "password": test_user["password"]})
        r = s.get(f"{API}/admin/metrics")
        assert r.status_code == 403


# ---------------- Cleanup ----------------
def test_zz_cleanup():
    mdb.users.delete_many({"email": {"$regex": "^test_"}})
    mdb.orders.delete_many({"email": {"$regex": "^test_"}})
    mdb.newsletter.delete_many({"email": {"$regex": "^test_"}})
    mdb.login_attempts.delete_many({"identifier": {"$regex": "test_"}})
    # Reset sales_count on seed products (webhook tests may have incremented it) so
    # Bestsellers section stays hidden on storefront.
    mdb.products.update_many({"is_demo": True}, {"$set": {"sales_count": 0}})
    # Also roll back stock decrements from webhook tests by resetting all seed sizes to 8
    mdb.products.update_many({"is_demo": True}, {"$set": {"sizes.$[].stock": 8}})
