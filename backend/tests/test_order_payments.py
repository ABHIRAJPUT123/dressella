import asyncio
import hashlib
import hmac
import json
import os
import sys
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pymongo.errors import OperationFailure
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/anora_unit_test")
os.environ.setdefault("DB_NAME", "anora_unit_test")

import routes_orders  # noqa: E402
import routes_admin  # noqa: E402
import core  # noqa: E402


class FakeOrders:
    def __init__(self, records):
        self.records = records

    async def find_one(self, query, projection=None, **_kwargs):
        record = deepcopy(next((item for item in self.records if self._matches(item, query)), None))
        if record and projection:
            for key, include in projection.items():
                if include == 0:
                    record.pop(key, None)
        return record

    async def update_one(self, query, update, **_kwargs):
        record = next((item for item in self.records if self._matches(item, query)), None)
        if record is None:
            return type("Result", (), {"matched_count": 0, "modified_count": 0})()
        record.update(deepcopy(update.get("$set", {})))
        for key, value in deepcopy(update.get("$push", {})).items():
            record.setdefault(key, []).append(value)
        for key, value in deepcopy(update.get("$addToSet", {})).items():
            if value not in record.setdefault(key, []):
                record[key].append(value)
        for key in update.get("$unset", {}):
            record.pop(key, None)
        return type("Result", (), {"matched_count": 1, "modified_count": 1})()

    async def insert_one(self, record, **_kwargs):
        if self._matches_any_id(record):
            from pymongo.errors import DuplicateKeyError
            raise DuplicateKeyError("duplicate")
        self.records.append(deepcopy(record))
        return type("Result", (), {"inserted_id": record.get("id")})()

    def _matches_any_id(self, record):
        return any(item.get("idempotency_key") == record.get("idempotency_key") for item in self.records)

    @staticmethod
    def _matches(record, query):
        for key, value in query.items():
            actual = record.get(key)
            if isinstance(value, dict) and "$ne" in value:
                if actual == value["$ne"] or isinstance(actual, list) and value["$ne"] in actual:
                    return False
            elif actual != value:
                return False
        return True


class FakeProducts:
    def __init__(self, records):
        self.records = records

    async def find_one(self, query, *_args, **_kwargs):
        product = next((p for p in self.records if p["id"] == query["id"]), None)
        if not product or ("status" in query and product.get("status") != query["status"]):
            return None
        size_req = query["sizes"]["$elemMatch"]
        return deepcopy(product) if any(
            size["size"] == size_req["size"] and size["stock"] >= size_req["stock"]["$gte"]
            for size in product["sizes"]
        ) else None

    async def update_one(self, query, update, **_kwargs):
        product = next((p for p in self.records if p["id"] == query["id"]), None)
        if not product or ("status" in query and product.get("status") != query["status"]):
            return type("Result", (), {"matched_count": 0, "modified_count": 0})()
        if "sizes" in query:
            req = query["sizes"]["$elemMatch"]
            size_name = req["size"]
            min_stock = req["stock"]["$gte"]
        else:
            size_name = query["sizes.size"]
            min_stock = 0
        size = next((s for s in product["sizes"] if s["size"] == size_name), None)
        if not size or size["stock"] < min_stock:
            return type("Result", (), {"matched_count": 0, "modified_count": 0})()
        size["stock"] += update["$inc"]["sizes.$.stock"]
        product["sales_count"] = product.get("sales_count", 0) + update["$inc"].get("sales_count", 0)
        return type("Result", (), {"matched_count": 1, "modified_count": 1})()


class FakeCoupons:
    def __init__(self):
        self.used_count = 0

    async def update_one(self, query, update, **_kwargs):
        if "used_count" in query and "$gt" in query["used_count"] and self.used_count <= query["used_count"]["$gt"]:
            return type("Result", (), {"matched_count": 0, "modified_count": 0})()
        self.used_count += update["$inc"]["used_count"]
        return type("Result", (), {"matched_count": 1, "modified_count": 1})()


class FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def with_transaction(self, callback):
        return await callback(self)


class FakeClient:
    async def start_session(self):
        return FakeSession()


class FakeEvents:
    def __init__(self):
        self.records = {}

    async def insert_one(self, record):
        from pymongo.errors import DuplicateKeyError

        if record["event_id"] in self.records:
            raise DuplicateKeyError("duplicate")
        self.records[record["event_id"]] = record


def _order(status="pending_payment"):
    return {
        "id": "order-1",
        "order_number": "ANR123456",
        "razorpay_order_id": "rz_order_1",
        "status": status,
        "payment_status": "pending",
        "totals": {"total": 1000},
        "payment_attempts": [],
        "timeline": [],
        "lines": [{"product_id": "p1", "size": "M", "qty": 2}],
        "coupon": {"code": "SAVE"},
    }


def _fake_db(order, stock=5):
    product = {"id": "p1", "status": "published", "sizes": [{"size": "M", "stock": stock}], "sales_count": 0}
    coupons = FakeCoupons()
    return type("FakeDB", (), {
        "orders": FakeOrders([order]),
        "products": FakeProducts([product]),
        "coupons": coupons,
        "webhook_events": FakeEvents(),
    })(), product, coupons


def _cod_order(order_idempotency_key="cod-order-key-123", qty=2):
    return {
        "id": "cod-order-1",
        "order_number": "ANR2610123456",
        "access_token": "guest-order-secret-token",
        "idempotency_key": order_idempotency_key,
        "payment_method": "cod",
        "status": "confirmed",
        "payment_status": "pending_collection",
        "totals": {"subtotal": 2000, "discount": 0, "shipping": 99, "total": 2099},
        "lines": [{"product_id": "p1", "size": "M", "qty": qty, "title": "Product"}],
        "coupon": None,
        "shipping": {"name": "Customer", "phone": "9876543210", "line1": "12 Market Road",
                     "line2": "", "city": "Jaipur", "state": "Rajasthan", "pincode": "302001"},
        "email": "customer@example.com",
        "created_at": "2026-10-24T00:00:00+00:00",
        "timeline": [{"status": "confirmed", "at": "2026-10-24T00:00:00+00:00",
                      "note": "COD order placed; payment due on delivery"}],
        "tracking": None,
        "payment_attempts": [],
        "inventory_deducted": True,
    }


def _signed_webhook_request(payload, event_id="evt-1", secret="webhook-test-secret"):
    body = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    headers = [(b"x-razorpay-signature", signature.encode()), (b"x-razorpay-event-id", event_id.encode())]
    return Request({"type": "http", "method": "POST", "path": "/api/webhooks/razorpay", "headers": headers, "query_string": b""}), body


def _configure_payments(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_public")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unit-test-secret")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "webhook-test-secret")
    monkeypatch.setenv("RAZORPAY_MODE", "test")


def test_payment_configuration_requires_all_credentials_and_matching_mode(monkeypatch):
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("RAZORPAY_MODE", raising=False)
    assert not routes_orders.payment_configured()
    _configure_payments(monkeypatch)
    assert routes_orders.payment_configured()
    monkeypatch.setenv("RAZORPAY_MODE", "live")
    assert not routes_orders.payment_configured()


def test_mark_paid_is_transactional_and_duplicate_callbacks_do_not_decrement_twice(monkeypatch):
    order = _order()
    fake_db, product, coupon = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    monkeypatch.setattr(routes_orders.emails, "fire", lambda *_args: None)
    monkeypatch.setattr(routes_orders.emails, "send_order_confirmed", lambda *_args: None)
    result = asyncio.run(routes_orders.mark_paid("rz_order_1", "pay-1", "test"))
    assert result["payment_status"] == "paid"
    assert product["sizes"][0]["stock"] == 3
    assert product["sales_count"] == 2
    assert coupon.used_count == 1

    asyncio.run(routes_orders.mark_paid("rz_order_1", "pay-1", "duplicate"))
    assert product["sizes"][0]["stock"] == 3
    assert product["sales_count"] == 2
    assert coupon.used_count == 1


def test_late_payment_keeps_cancelled_order_cancelled_and_flags_refund(monkeypatch):
    order = _order(status="cancelled")
    fake_db, product, coupon = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    result = asyncio.run(routes_orders.mark_paid("rz_order_1", "pay-1", "test"))
    assert result["status"] == "cancelled"
    assert result["payment_status"] == "paid"
    assert result["refund_due"] is True
    assert product["sizes"][0]["stock"] == 5
    assert coupon.used_count == 0


def test_insufficient_inventory_marks_review_without_partial_decrement(monkeypatch):
    order = _order()
    order["lines"].append({"product_id": "p2", "size": "S", "qty": 1})
    fake_db, product, coupon = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    result = asyncio.run(routes_orders.mark_paid("rz_order_1", "pay-1", "test"))
    assert result["payment_status"] == "paid"
    assert result["status"] == "payment_review"
    assert result["stock_issue"] is True
    assert product["sizes"][0]["stock"] == 5
    assert coupon.used_count == 0


def test_captured_payment_amount_mismatch_is_held_for_review(monkeypatch):
    order = _order()
    fake_db, product, coupon = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    result = asyncio.run(routes_orders.mark_paid("rz_order_1", "pay-1", "test", 5000, "INR"))
    assert result["status"] == "payment_review"
    assert result["payment_status"] == "paid"
    assert result["refund_due"] is True
    assert result["payment_review"] is True
    assert product["sizes"][0]["stock"] == 5
    assert coupon.used_count == 0


def test_webhook_failure_is_not_recorded_before_processing_succeeds(monkeypatch):
    _configure_payments(monkeypatch)
    order = _order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    attempts = []

    async def flaky_mark_paid(*_args):
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("temporary processing failure")
        return {"id": "order-1", "status": "confirmed", "payment_status": "paid"}

    monkeypatch.setattr(routes_orders, "mark_paid", flaky_mark_paid)
    request, body = _signed_webhook_request({
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"order_id": "rz_order_1", "id": "pay-1", "amount": 100000, "currency": "INR"}}},
    })
    request._body = body

    with pytest.raises(RuntimeError):
        asyncio.run(routes_orders.razorpay_webhook(request))
    assert not fake_db.webhook_events.records

    request, body = _signed_webhook_request({
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"order_id": "rz_order_1", "id": "pay-1", "amount": 100000, "currency": "INR"}}},
    })
    request._body = body
    assert asyncio.run(routes_orders.razorpay_webhook(request)) == {"status": "ok"}
    assert fake_db.webhook_events.records["evt-1"]["processed"] is True


def test_duplicate_webhook_does_not_repeat_inventory_mutation(monkeypatch):
    _configure_payments(monkeypatch)
    fake_db, product, coupon = _fake_db(_order())
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    monkeypatch.setattr(routes_orders.emails, "fire", lambda *_args: None)
    monkeypatch.setattr(routes_orders.emails, "send_order_confirmed", lambda *_args: None)
    payload = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"order_id": "rz_order_1", "id": "pay-1", "amount": 100000, "currency": "INR"}}},
    }

    request, body = _signed_webhook_request(payload, "evt-duplicate")
    request._body = body
    assert asyncio.run(routes_orders.razorpay_webhook(request)) == {"status": "ok"}
    request, body = _signed_webhook_request(payload, "evt-duplicate")
    request._body = body
    assert asyncio.run(routes_orders.razorpay_webhook(request)) == {"status": "duplicate"}
    assert product["sizes"][0]["stock"] == 3
    assert product["sales_count"] == 2
    assert coupon.used_count == 1


def test_failed_payment_webhook_keeps_order_retryable(monkeypatch):
    _configure_payments(monkeypatch)
    order = _order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    payload = {
        "event": "payment.failed",
        "payload": {"payment": {"entity": {"order_id": "rz_order_1", "error_description": "declined"}}},
    }
    request, body = _signed_webhook_request(payload)
    request._body = body
    assert asyncio.run(routes_orders.razorpay_webhook(request)) == {"status": "ok"}
    assert order["payment_status"] == "pending"
    assert order["status"] == "pending_payment"
    assert order["timeline"][-1]["status"] == "payment_failed"


def test_duplicate_failed_webhook_does_not_duplicate_timeline(monkeypatch):
    _configure_payments(monkeypatch)
    order = _order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    payload = {
        "event": "payment.failed",
        "payload": {"payment": {"entity": {"order_id": "rz_order_1", "error_description": "declined"}}},
    }
    request, body = _signed_webhook_request(payload, "evt-failed")
    request._body = body
    asyncio.run(routes_orders.razorpay_webhook(request))
    request, body = _signed_webhook_request(payload, "evt-failed")
    request._body = body
    assert asyncio.run(routes_orders.razorpay_webhook(request)) == {"status": "duplicate"}
    assert len(order["timeline"]) == 1


def test_gateway_order_uses_server_total_in_inr_minor_units(monkeypatch):
    _configure_payments(monkeypatch)
    captured = {}

    class FakeGatewayOrder:
        def create(self, payload):
            captured.update(payload)
            return {"id": "rz_order_mock", "amount": payload["amount"], "currency": payload["currency"]}

    class FakeGateway:
        def __init__(self, auth):
            assert auth == ("rzp_test_public", "unit-test-secret")
            self.order = FakeGatewayOrder()

    class FakeOrderCollection:
        async def update_one(self, query, update):
            if "razorpay_creation_token" not in query:
                assert query["id"] == "order-1"
                assert "razorpay_creation_token" in update["$set"]
                return type("Result", (), {"matched_count": 1, "modified_count": 1})()
            assert query["id"] == "order-1"
            assert update["$set"]["razorpay_order_id"] == "rz_order_mock"
            return type("Result", (), {"matched_count": 1})()

    monkeypatch.setattr(routes_orders.razorpay, "Client", FakeGateway)
    monkeypatch.setattr(routes_orders, "db", type("FakeDB", (), {"orders": FakeOrderCollection()})())
    order = {
        "id": "order-1",
        "order_number": "ANR123456",
        "totals": {"total": 2301},
    }
    result = asyncio.run(routes_orders.create_rzp_order(order))
    assert captured["amount"] == 230100
    assert captured["currency"] == "INR"
    assert result == {"key_id": "rzp_test_public", "order_id": "rz_order_mock", "amount": 230100, "currency": "INR"}


def test_duplicate_checkout_reuses_gateway_order(monkeypatch):
    _configure_payments(monkeypatch)
    existing = {
        "id": "order-1",
        "order_number": "ANR123456",
        "idempotency_key": "idempotency-key-123",
        "access_token": "order-access-token",
        "email": "customer@example.com",
        "status": "pending_payment",
        "payment_status": "pending",
        "razorpay_order_id": "rz_order_existing",
        "lines": [],
        "totals": {"total": 1000},
        "coupon": None,
        "shipping": {},
        "created_at": "2026-01-01T00:00:00+00:00",
        "timeline": [],
        "tracking": None,
    }
    fake_db = type("FakeDB", (), {"orders": FakeOrders([existing])})()
    monkeypatch.setattr(routes_orders, "db", fake_db)

    async def no_user(_request):
        return None

    async def unexpected_gateway_call(_order):
        raise AssertionError("An idempotent checkout must reuse its current Razorpay order.")

    monkeypatch.setattr(routes_orders, "get_optional_user", no_user)
    monkeypatch.setattr(routes_orders, "create_rzp_order", unexpected_gateway_call)
    body = routes_orders.CheckoutIn(
        items=[],
        email="customer@example.com",
        shipping={
            "name": "Customer Name", "phone": "9876543210", "line1": "12 Market Road",
            "city": "Jaipur", "state": "Rajasthan", "pincode": "302001",
        },
        idempotency_key="idempotency-key-123",
    )

    response = asyncio.run(routes_orders.checkout(body, None))
    assert response["order"]["id"] == "order-1"
    assert response["razorpay"]["order_id"] == "rz_order_existing"
    assert response["razorpay"]["amount"] == 100000


def test_razorpay_retry_reuses_order_and_failed_payment_stays_unpaid(monkeypatch):
    _configure_payments(monkeypatch)
    order = _order()
    order.update({
        "payment_method": "razorpay",
        "access_token": "order-access-token",
        "razorpay_order_id": "rz_order_1",
    })
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)

    async def unexpected_new_gateway_order(_order):
        raise AssertionError("Retry must reuse the pending Razorpay order.")

    monkeypatch.setattr(routes_orders, "create_rzp_order", unexpected_new_gateway_order)
    retried = asyncio.run(routes_orders.retry(
        routes_orders.RetryIn(order_id="order-1", access_token="order-access-token")))
    assert retried["razorpay"]["order_id"] == "rz_order_1"

    failed = asyncio.run(routes_orders.payment_failed(
        routes_orders.FailIn(order_id="order-1", access_token="order-access-token", reason="declined")))
    assert failed["ok"] is True
    assert order["payment_status"] == "pending"
    assert order["status"] == "pending_payment"


def test_cod_order_cannot_be_retried_as_razorpay(monkeypatch):
    _configure_payments(monkeypatch)
    order = _cod_order()
    order["access_token"] = "order-access-token"
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.retry(
            routes_orders.RetryIn(order_id=order["id"], access_token="order-access-token")))
    assert error.value.status_code == 400


def test_duplicate_product_size_cart_lines_are_combined(monkeypatch):
    product = {
        "id": "p1", "status": "published", "slug": "product", "sku": "ANR-1",
        "title": "Product", "price": 1200, "sizes": [{"size": "M", "stock": 5}],
        "images": [], "color": {"name": "Blue"},
    }

    class Cursor:
        async def to_list(self, _limit):
            return [product]

    class Products:
        def find(self, *_args, **_kwargs):
            return Cursor()

    async def settings():
        return {"shipping_flat": 99, "free_shipping_threshold": 2500}

    monkeypatch.setattr(routes_orders, "db", type("FakeDB", (), {"products": Products()})())
    monkeypatch.setattr(routes_orders, "get_settings", settings)
    result = asyncio.run(routes_orders.price_cart(
        [routes_orders.LineIn(product_id="p1", size="M", qty=1),
         routes_orders.LineIn(product_id="p1", size="M", qty=2)],
        None,
    ))
    assert len(result["lines"]) == 1
    assert result["lines"][0]["qty"] == 3
    assert result["lines"][0]["line_total"] == 3600


def test_admin_confirmation_of_payment_review_checks_and_deducts_inventory(monkeypatch):
    order = _order(status="payment_review")
    order.update({
        "payment_status": "paid",
        "payment_review": True,
        "stock_issue": True,
        "inventory_deducted": False,
        "refund_due": False,
    })
    fake_db, product, coupon = _fake_db(order)
    monkeypatch.setattr(routes_admin, "db", fake_db)
    monkeypatch.setattr(routes_admin, "client", FakeClient())
    monkeypatch.setattr(routes_admin, "bust_cache", lambda: None)

    result = asyncio.run(routes_admin.update_status(
        "order-1", routes_admin.StatusIn(status="confirmed", note="Reviewed")))
    assert result["status"] == "confirmed"
    assert result["inventory_deducted"] is True
    assert result["payment_review"] is False
    assert result["stock_issue"] is False
    assert product["sizes"][0]["stock"] == 3
    assert coupon.used_count == 1


def test_admin_cannot_confirm_payment_review_without_sufficient_inventory(monkeypatch):
    order = _order(status="payment_review")
    order.update({"payment_status": "paid", "payment_review": True, "inventory_deducted": False})
    fake_db, _, _ = _fake_db(order, stock=1)
    monkeypatch.setattr(routes_admin, "db", fake_db)
    monkeypatch.setattr(routes_admin, "client", FakeClient())
    monkeypatch.setattr(routes_admin, "bust_cache", lambda: None)

    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_admin.update_status(
            "order-1", routes_admin.StatusIn(status="confirmed")))
    assert error.value.status_code == 409
    assert order["status"] == "payment_review"


def test_cod_checkout_creates_confirmed_unpaid_order_and_reserves_stock(monkeypatch):
    product = {"id": "p1", "status": "published", "sizes": [{"size": "M", "stock": 5}], "sales_count": 0}
    coupons = FakeCoupons()
    fake_db = type("FakeDB", (), {
        "orders": FakeOrders([]), "products": FakeProducts([product]), "coupons": coupons,
    })()
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    monkeypatch.setattr(routes_orders, "bust_cache", lambda: None)

    async def no_user(_request):
        return None

    async def trusted_price(_items, _coupon):
        return {
            "lines": [{"product_id": "p1", "size": "M", "qty": 2, "unit_price": 1000,
                       "line_total": 2000, "title": "Trusted product"}],
            "issues": [], "totals": {"subtotal": 2000, "discount": 0, "shipping": 99, "total": 2099},
            "coupon": None, "coupon_error": None,
        }

    async def no_razorpay(_order):
        raise AssertionError("COD must never create a Razorpay order.")

    monkeypatch.setattr(routes_orders, "get_optional_user", no_user)
    monkeypatch.setattr(routes_orders, "price_cart", trusted_price)
    monkeypatch.setattr(routes_orders, "create_rzp_order", no_razorpay)
    body = routes_orders.CheckoutIn(
        items=[{"product_id": "p1", "size": "M", "qty": 2, "price": 1}],
        email="customer@example.com",
        shipping=_cod_order()["shipping"],
        payment_method="cod",
        idempotency_key="cod-order-key-123",
    )

    response = asyncio.run(routes_orders.checkout(body, None))
    saved = fake_db.orders.records[0]
    assert response["razorpay"] is None
    assert response["order"]["payment_method"] == "cod"
    assert response["order"]["status"] == "confirmed"
    assert response["order"]["payment_status"] == "pending_collection"
    assert response["order"]["totals"]["total"] == 2099
    assert saved["payment_status"] != "paid"
    assert "price" not in body.items[0].model_dump()
    assert product["sizes"][0]["stock"] == 3
    assert product["sales_count"] == 2


def test_duplicate_cod_checkout_is_idempotent_and_deducts_stock_once(monkeypatch):
    product = {"id": "p1", "status": "published", "sizes": [{"size": "M", "stock": 5}], "sales_count": 0}
    fake_db = type("FakeDB", (), {
        "orders": FakeOrders([]), "products": FakeProducts([product]), "coupons": FakeCoupons(),
    })()
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    monkeypatch.setattr(routes_orders, "bust_cache", lambda: None)
    monkeypatch.setattr(routes_orders, "get_optional_user", lambda _request: asyncio.sleep(0, result=None))
    monkeypatch.setattr(routes_orders, "price_cart", lambda *_args: asyncio.sleep(0, result={
        "lines": [{"product_id": "p1", "size": "M", "qty": 2, "unit_price": 1000, "line_total": 2000}],
        "issues": [], "totals": {"subtotal": 2000, "discount": 0, "shipping": 99, "total": 2099},
        "coupon": None, "coupon_error": None,
    }))
    body = routes_orders.CheckoutIn(
        items=[{"product_id": "p1", "size": "M", "qty": 2}],
        email="customer@example.com",
        shipping=_cod_order()["shipping"],
        payment_method="cod",
        idempotency_key="cod-order-key-123",
    )

    first = asyncio.run(routes_orders.checkout(body, None))
    second = asyncio.run(routes_orders.checkout(body, None))
    assert first["order"]["id"] == second["order"]["id"]
    assert len(fake_db.orders.records) == 1
    assert product["sizes"][0]["stock"] == 3


def test_cod_stock_shortage_does_not_create_order_or_mutate_inventory(monkeypatch):
    order = _cod_order(qty=2)
    fake_db, product, _ = _fake_db(order, stock=1)
    fake_db.orders = FakeOrders([])
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.create_cod_order(order))
    assert error.value.status_code == 409
    assert fake_db.orders.records == []
    assert product["sizes"][0]["stock"] == 1


def test_cod_transaction_failure_logs_safe_diagnostic(caplog, monkeypatch):
    class FailingSession(FakeSession):
        async def with_transaction(self, _callback):
            raise OperationFailure(
                "Transaction numbers are only allowed; customer@example.com "
                "+1 415 555 2671 mongodb://dbuser:dbpassword@localhost/test "
                "password=private",
                code=20,
            )

    class FailingClient:
        async def start_session(self):
            return FailingSession()

    monkeypatch.setattr(routes_orders, "client", FailingClient())
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.create_cod_order(_cod_order()))

    assert error.value.status_code == 503
    assert "requires MongoDB transactions" in error.value.detail
    assert "replica set" in error.value.detail
    assert "OperationFailure" in caplog.text
    assert "code=20" in caplog.text
    assert "Transaction numbers are only allowed" in caplog.text
    for sensitive in ("customer@example.com", "415 555 2671", "dbpassword", "private"):
        assert sensitive not in caplog.text
    assert "[REDACTED_EMAIL]" in caplog.text
    assert "[REDACTED_PHONE]" in caplog.text
    assert "mongodb://[REDACTED]@localhost/test" in caplog.text


def test_cod_creation_reserves_coupon_usage_in_same_order_transaction(monkeypatch):
    order = _cod_order()
    order["coupon"] = {"code": "SAVE"}
    fake_db, product, coupon = _fake_db(order)
    fake_db.orders = FakeOrders([])
    monkeypatch.setattr(routes_orders, "db", fake_db)
    monkeypatch.setattr(routes_orders, "client", FakeClient())
    created = asyncio.run(routes_orders.create_cod_order(order))
    assert created["coupon_usage_reserved"] is True
    assert coupon.used_count == 1
    assert product["sizes"][0]["stock"] == 3


@pytest.mark.parametrize(
    "line,expected_issue",
    [
        (routes_orders.LineIn(product_id="missing", size="M", qty=1), "unavailable"),
        (routes_orders.LineIn(product_id="p1", size="NO-SIZE", qty=1), "out_of_stock"),
    ],
)
def test_unknown_product_or_size_is_rejected_by_trusted_cart_pricing(monkeypatch, line, expected_issue):
    product = {
        "id": "p1", "status": "published", "slug": "product", "sku": "ANR-1",
        "title": "Product", "price": 1200, "sizes": [{"size": "M", "stock": 5}],
        "images": [], "color": {"name": "Blue"},
    }

    class Cursor:
        def __init__(self, ids):
            self.ids = ids

        async def to_list(self, _limit):
            return [product] if "p1" in self.ids else []

    class Products:
        def find(self, query, _projection=None, **_kwargs):
            return Cursor(query["id"]["$in"])

    async def settings():
        return {"shipping_flat": 99, "free_shipping_threshold": 2500}

    monkeypatch.setattr(routes_orders, "db", type("FakeDB", (), {"products": Products()})())
    monkeypatch.setattr(routes_orders, "get_settings", settings)
    result = asyncio.run(routes_orders.price_cart([line], None))
    assert result["issues"][0]["issue"] == expected_issue
    assert result["lines"] == []


def test_invalid_shipping_fields_are_rejected_by_checkout_model():
    with pytest.raises(ValidationError):
        routes_orders.CheckoutIn(
            items=[],
            email="not-an-email",
            shipping={**_cod_order()["shipping"], "phone": "123", "pincode": "12"},
            payment_method="cod",
            idempotency_key="cod-order-key-123",
        )


def test_cod_collection_requires_admin_and_only_records_once(monkeypatch):
    order = _cod_order()
    order["status"] = "delivered"
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_admin, "db", fake_db)
    admin = {"id": "admin-1", "email": "admin@example.com", "name": "Store Admin"}
    route = next(r for r in routes_admin.router.routes if r.path == "/api/admin/orders/{oid}/collect-cod")
    assert any(dependency.call is routes_admin.require_admin for dependency in route.dependant.dependencies)

    collected = asyncio.run(routes_admin.collect_cod("cod-order-1", admin))
    assert collected["payment_status"] == "paid"
    assert collected["cod_collected_by"]["id"] == "admin-1"
    assert collected["cod_collected_at"]
    assert collected["status"] == "delivered"
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_admin.collect_cod("cod-order-1", admin))
    assert error.value.status_code == 409


def test_cod_collection_is_rejected_before_delivery(monkeypatch):
    order = _cod_order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_admin, "db", fake_db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_admin.collect_cod("cod-order-1", {"id": "admin-1", "email": "admin@example.com"}))
    assert error.value.status_code == 409
    assert order["payment_status"] == "pending_collection"


def test_unauthorized_caller_cannot_record_cod_collection(monkeypatch):
    order = _cod_order()
    order["status"] = "delivered"
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_admin, "db", fake_db)

    async def deny_admin():
        raise HTTPException(403, "Admin access required")

    app = FastAPI()
    app.include_router(routes_admin.router)
    app.dependency_overrides[core.require_admin] = deny_admin
    response = TestClient(app).post("/api/admin/orders/cod-order-1/collect-cod")
    assert response.status_code == 403
    assert order["payment_status"] == "pending_collection"
    assert "cod_collected_at" not in order


def test_guest_order_view_requires_matching_secure_access_token(monkeypatch):
    order = _cod_order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    viewed = asyncio.run(routes_orders.view_order("cod-order-1", order["access_token"]))
    assert viewed["order"]["order_number"] == order["order_number"]
    assert viewed["order"]["lines"][0]["size"] == "M"
    assert viewed["order"]["payment_method"] == "cod"
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.view_order("cod-order-1", "wrong-token"))
    assert error.value.status_code == 404


def test_guest_tracking_shows_order_summary_only_for_matching_email(monkeypatch):
    order = _cod_order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    tracked = asyncio.run(routes_orders.track(routes_orders.TrackIn(
        order_number=order["order_number"], email=order["email"])))
    assert tracked["payment_method"] == "cod"
    assert tracked["payment_status"] == "pending_collection"
    assert tracked["totals"]["total"] == 2099
    assert tracked["lines"][0]["size"] == "M"
    assert tracked["shipping"] == {"city": "Jaipur", "pincode": "302001"}
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.track(routes_orders.TrackIn(
            order_number=order["order_number"], email="other@example.com")))
    assert error.value.status_code == 404


def test_admin_order_details_include_payment_method_and_status(monkeypatch):
    order = _cod_order()
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_admin, "db", fake_db)
    response = asyncio.run(routes_admin.admin_order("cod-order-1"))
    assert response["payment_method"] == "cod"
    assert response["payment_status"] == "pending_collection"
    assert response["status"] == "confirmed"
    assert "access_token" not in response


def test_cancelling_cod_order_restores_reserved_inventory_once(monkeypatch):
    order = _cod_order()
    order["coupon"] = {"code": "SAVE"}
    order["coupon_usage_reserved"] = True
    fake_db, product, _ = _fake_db(order, stock=3)
    product["sales_count"] = 2
    fake_db.coupons.used_count = 1
    monkeypatch.setattr(routes_admin, "db", fake_db)
    monkeypatch.setattr(routes_admin, "client", FakeClient())
    monkeypatch.setattr(routes_admin, "bust_cache", lambda: None)
    monkeypatch.setattr(routes_admin.emails, "fire", lambda *_args: None)
    monkeypatch.setattr(routes_admin.emails, "send_order_cancelled", lambda *_args: None)

    cancelled = asyncio.run(routes_admin.update_status(
        "cod-order-1", routes_admin.StatusIn(status="cancelled")))
    assert cancelled["status"] == "cancelled"
    assert cancelled["inventory_deducted"] is False
    assert product["sizes"][0]["stock"] == 5
    assert product["sales_count"] == 0
    assert cancelled["payment_status"] == "pending_collection"
    assert fake_db.coupons.used_count == 0


def test_webhook_rejects_invalid_signature_before_processing(monkeypatch):
    _configure_payments(monkeypatch)
    fake_db, _, _ = _fake_db(_order())
    monkeypatch.setattr(routes_orders, "db", fake_db)
    request, body = _signed_webhook_request({"event": "payment.captured"})
    request._body = body
    request.scope["headers"] = [(b"x-razorpay-signature", b"invalid"), (b"x-razorpay-event-id", b"evt-1")]
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.razorpay_webhook(request))
    assert error.value.status_code == 400
    assert not fake_db.webhook_events.records


def test_checkout_verify_rejects_invalid_signature_without_marking_paid(monkeypatch):
    _configure_payments(monkeypatch)
    order = _order()
    order.update({"access_token": "order-access-token", "razorpay_order_id": "rz_order_1"})
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)

    async def unexpected_mark_paid(*_args):
        raise AssertionError("An invalid signature must never mark the order paid.")

    monkeypatch.setattr(routes_orders, "mark_paid", unexpected_mark_paid)
    body = routes_orders.VerifyIn(
        order_id="order-1",
        access_token="order-access-token",
        razorpay_order_id="rz_order_1",
        razorpay_payment_id="pay-1",
        razorpay_signature="invalid",
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_orders.verify(body))
    assert error.value.status_code == 400
    assert order["payment_status"] == "pending"


def test_checkout_verify_accepts_only_a_valid_mock_signature(monkeypatch):
    _configure_payments(monkeypatch)
    order = _order()
    order.update({"access_token": "order-access-token", "razorpay_order_id": "rz_order_1"})
    fake_db, _, _ = _fake_db(order)
    monkeypatch.setattr(routes_orders, "db", fake_db)
    signature = hmac.new(
        b"unit-test-secret", b"rz_order_1|pay-1", hashlib.sha256).hexdigest()
    expected = {**order, "payment_status": "paid", "status": "confirmed"}

    async def mocked_mark_paid(*_args):
        return expected

    monkeypatch.setattr(routes_orders, "mark_paid", mocked_mark_paid)
    body = routes_orders.VerifyIn(
        order_id="order-1",
        access_token="order-access-token",
        razorpay_order_id="rz_order_1",
        razorpay_payment_id="pay-1",
        razorpay_signature=signature,
    )
    result = asyncio.run(routes_orders.verify(body))
    assert result["order"]["payment_status"] == "paid"
