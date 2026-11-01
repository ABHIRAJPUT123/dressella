import asyncio
import io
import os
import sys
from copy import deepcopy
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import Headers

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/anora_unit_test")
os.environ.setdefault("DB_NAME", "anora_unit_test")

import core  # noqa: E402
import routes_exchanges  # noqa: E402
import server  # noqa: E402


class Cursor:
    def __init__(self, records):
        self.records = records

    def sort(self, *_args):
        return self

    def skip(self, amount):
        self.records = self.records[amount:]
        return self

    def limit(self, amount):
        self.records = self.records[:amount]
        return self

    async def to_list(self, length):
        return deepcopy(self.records[:length])


class Collection:
    def __init__(self, records=None):
        self.records = records or []

    async def find_one(self, query, projection=None, **_kwargs):
        record = next((entry for entry in self.records if self.matches(entry, query)), None)
        if record is None:
            return None
        value = deepcopy(record)
        if projection:
            for key, include in projection.items():
                if include == 0:
                    value.pop(key, None)
        return value

    def find(self, query=None, projection=None):
        records = [deepcopy(entry) for entry in self.records if self.matches(entry, query or {})]
        if projection:
            for record in records:
                for key, include in projection.items():
                    if include == 0:
                        record.pop(key, None)
        return Cursor(records)

    async def count_documents(self, query):
        return sum(1 for record in self.records if self.matches(record, query))

    async def insert_one(self, record):
        if any(existing.get("request_id") == record.get("request_id")
               or record.get("active_key") and existing.get("active_key") == record.get("active_key")
               for existing in self.records):
            from pymongo.errors import DuplicateKeyError
            raise DuplicateKeyError("duplicate exchange request")
        self.records.append(deepcopy(record))
        return type("Result", (), {"inserted_id": record.get("id")})()

    async def update_one(self, query, update):
        record = next((entry for entry in self.records if self.matches(entry, query)), None)
        if record is None:
            return type("Result", (), {"matched_count": 0, "modified_count": 0})()
        record.update(deepcopy(update.get("$set", {})))
        for key, value in update.get("$unset", {}).items():
            record.pop(key, None)
        for key, value in deepcopy(update.get("$push", {})).items():
            record.setdefault(key, []).append(value)
        return type("Result", (), {"matched_count": 1, "modified_count": 1})()

    @classmethod
    def matches(cls, record, query):
        for key, value in query.items():
            if key == "$or":
                if not any(cls.matches(record, item) for item in value):
                    return False
                continue
            actual = record.get(key)
            if isinstance(value, dict):
                if "$in" in value and actual not in value["$in"]:
                    return False
                if "$ne" in value and actual == value["$ne"]:
                    return False
                if "$gt" in value and not actual > value["$gt"]:
                    return False
            elif actual != value:
                return False
        return True


def setup(monkeypatch, *, status="delivered", days_ago=1, stock=5, window=7, user_id="customer-1"):
    timestamp = (routes_exchanges.now() - timedelta(days=days_ago)).isoformat()
    order = {
        "id": "order-1",
        "order_number": "ANR2601000001",
        "user_id": user_id,
        "email": "customer@example.test",
        "status": status,
        "timeline": [{"status": "delivered", "at": timestamp}],
        "lines": [{"product_id": "product-1", "title": "ANORA Kurta", "sku": "ANR-1", "size": "S", "color": "Ivory", "qty": 1}],
    }
    products = [
        {"id": "product-1", "title": "ANORA Kurta", "status": "published", "group": "kurta-colors", "color": {"name": "Ivory"}, "sizes": [{"size": "S", "stock": 2}, {"size": "M", "stock": stock}]},
        {"id": "product-2", "title": "ANORA Kurta", "status": "published", "group": "kurta-colors", "color": {"name": "Rose"}, "sizes": [{"size": "M", "stock": 3}]},
    ]
    fake_db = type("FakeDB", (), {
        "orders": Collection([order]),
        "products": Collection(products),
        "exchange_requests": Collection(),
        "users": Collection([{"id": "customer-1", "name": "Test Customer", "email": "customer@example.test"}]),
    })()
    monkeypatch.setattr(routes_exchanges, "db", fake_db)
    monkeypatch.setattr(routes_exchanges, "get_settings", lambda: asyncio.sleep(0, result={"exchange_window_days": window}))
    customer = {"id": "customer-1", "email": "customer@example.test", "role": "customer"}
    admin = {"id": "admin-1", "email": "admin@example.test", "role": "admin"}
    return fake_db, customer, admin


def submit(customer, **overrides):
    values = {
        "order_id": "order-1",
        "line_index": 0,
        "replacement_product_id": "product-2",
        "replacement_size": "M",
        "reason": "Wrong size",
        "comments": "Please exchange",
        "image": None,
        "user": customer,
    }
    values.update(overrides)
    return asyncio.run(routes_exchanges.submit_exchange(**values))


def test_successful_submission_records_request_without_mutating_order_or_stock(monkeypatch):
    fake_db, customer, _admin = setup(monkeypatch)
    order_before = deepcopy(fake_db.orders.records)
    products_before = deepcopy(fake_db.products.records)

    request = submit(customer)

    assert request["request_id"].startswith("ANX-")
    assert request["status"] == "submitted"
    assert request["customer_id"] == customer["id"]
    assert request["replacement"] == {"product_id": "product-2", "title": "ANORA Kurta", "size": "M", "color": "Rose"}
    assert fake_db.orders.records == order_before
    assert fake_db.products.records == products_before


def test_authenticated_exchange_api_accepts_a_multipart_request(monkeypatch):
    fake_db, customer, _admin = setup(monkeypatch)
    app = FastAPI()
    app.include_router(routes_exchanges.customer_router)
    app.dependency_overrides[core.get_current_user] = lambda: customer

    response = TestClient(app).post(
        "/api/exchanges",
        files={
            "order_id": (None, "order-1"),
            "line_index": (None, "0"),
            "replacement_product_id": (None, "product-2"),
            "replacement_size": (None, "M"),
            "reason": (None, "Wrong size"),
            "comments": (None, "Please exchange"),
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "submitted"
    assert len(fake_db.exchange_requests.records) == 1


def test_wrong_customer_cannot_submit_for_an_order(monkeypatch):
    _fake_db, _customer, _admin = setup(monkeypatch)
    outsider = {"id": "customer-2", "email": "other@example.test", "role": "customer"}

    with pytest.raises(HTTPException) as error:
        submit(outsider)

    assert error.value.status_code == 404


def test_customer_cannot_claim_guest_order_for_exchange_by_email(monkeypatch):
    _fake_db, _customer, _admin = setup(monkeypatch, user_id=None)
    matching_email_user = {"id": "customer-2", "email": "customer@example.test", "role": "customer"}

    with pytest.raises(HTTPException) as error:
        submit(matching_email_user)

    assert error.value.status_code == 404


def test_unknown_order_is_not_found(monkeypatch):
    _fake_db, customer, _admin = setup(monkeypatch)

    with pytest.raises(HTTPException) as error:
        submit(customer, order_id="not-an-order")

    assert error.value.status_code == 404


def test_non_delivered_or_expired_order_is_ineligible(monkeypatch):
    _fake_db, customer, _admin = setup(monkeypatch, status="shipped")
    with pytest.raises(HTTPException) as not_delivered:
        submit(customer)
    assert not_delivered.value.status_code == 409

    setup(monkeypatch, days_ago=9)
    with pytest.raises(HTTPException) as expired:
        submit(customer)
    assert expired.value.status_code == 409


def test_replacement_variant_must_have_stock(monkeypatch):
    _fake_db, customer, _admin = setup(monkeypatch, stock=0)

    with pytest.raises(HTTPException) as error:
        submit(customer, replacement_product_id="product-1", replacement_size="M")

    assert error.value.status_code == 409


def test_duplicate_is_blocked_and_rejected_request_can_be_resubmitted(monkeypatch):
    fake_db, customer, admin = setup(monkeypatch)
    submitted = submit(customer)
    with pytest.raises(HTTPException) as duplicate:
        submit(customer)
    assert duplicate.value.status_code == 409

    reviewed = asyncio.run(routes_exchanges.review_exchange(
        submitted["request_id"],
        routes_exchanges.ExchangeReviewIn(status="rejected", admin_note="Item does not meet condition requirements."),
        admin,
    ))
    assert reviewed["status"] == "rejected"
    assert reviewed["admin_note"] == "Item does not meet condition requirements."
    assert submit(customer)["status"] == "submitted"
    assert len(fake_db.exchange_requests.records) == 2


def test_review_status_cannot_be_changed_after_approval(monkeypatch):
    _fake_db, customer, admin = setup(monkeypatch)
    submitted = submit(customer)
    asyncio.run(routes_exchanges.review_exchange(
        submitted["request_id"],
        routes_exchanges.ExchangeReviewIn(status="approved", admin_note="Proceed with manual review."),
        admin,
    ))

    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_exchanges.review_exchange(
            submitted["request_id"],
            routes_exchanges.ExchangeReviewIn(status="rejected", admin_note="Changed decision."),
            admin,
        ))

    assert error.value.status_code == 409


def test_admin_review_is_visible_in_customer_list_and_detail(monkeypatch):
    fake_db, customer, admin = setup(monkeypatch)
    submitted = submit(customer)
    app = FastAPI()
    app.include_router(routes_exchanges.customer_router)
    app.include_router(routes_exchanges.admin_router)

    async def authenticated_user(request: Request):
        return admin if request.headers.get("x-test-role") == "admin" else customer

    monkeypatch.setattr(core, "get_current_user", authenticated_user)
    app.dependency_overrides[routes_exchanges.get_current_user] = authenticated_user
    client = TestClient(app)
    customer_headers = {"X-Test-Role": "customer"}
    admin_headers = {"X-Test-Role": "admin"}

    customer_list = client.get("/api/exchanges", headers=customer_headers)
    assert customer_list.status_code == 200
    assert customer_list.json()[0]["status"] == "submitted"

    admin_list = client.get("/api/admin/exchanges", headers=admin_headers)
    assert admin_list.status_code == 200
    assert admin_list.json()["items"][0]["customer"]["email"] == customer["email"]

    review = client.patch(
        f"/api/admin/exchanges/{submitted['request_id']}",
        headers=admin_headers,
        json={"status": "approved", "admin_note": "Please wait for manual shipping instructions."},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "approved"

    customer_list = client.get("/api/exchanges", headers=customer_headers)
    assert customer_list.status_code == 200
    assert customer_list.json()[0]["status"] == "approved"
    assert customer_list.json()[0]["admin_note"] == "Please wait for manual shipping instructions."
    detail = client.get(f"/api/exchanges/{submitted['request_id']}", headers=customer_headers)
    assert detail.status_code == 200
    assert detail.json()["status"] == "approved"
    assert len(fake_db.orders.records) == 1


def test_admin_exchange_routes_require_admin(monkeypatch):
    setup(monkeypatch)
    app = FastAPI()
    app.include_router(routes_exchanges.customer_router)
    app.include_router(routes_exchanges.admin_router)

    async def current_customer(_request):
        return {"id": "customer-1", "email": "customer@example.test", "role": "customer"}

    monkeypatch.setattr(core, "get_current_user", current_customer)

    response = TestClient(app).get("/api/admin/exchanges")

    assert response.status_code == 403


def test_exchange_routes_require_authentication(monkeypatch):
    setup(monkeypatch)
    app = FastAPI()
    app.include_router(routes_exchanges.customer_router)

    response = TestClient(app).get("/api/exchanges")

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("settings", "expected"),
    [
        ({"exchange_window_days": 14}, {"exchange_window_days": 14, "configured": True}),
        ({"exchange_window_days": None}, {"exchange_window_days": None, "configured": False}),
    ],
)
def test_application_policy_endpoint_returns_store_configuration(monkeypatch, settings, expected):
    async def get_settings():
        return settings

    monkeypatch.setattr(routes_exchanges, "get_settings", get_settings)

    response = TestClient(server.app).get("/api/exchanges/policy")

    assert response.status_code == 200
    assert response.json() == expected


def test_missing_exchange_window_disables_requests(monkeypatch):
    _fake_db, customer, _admin = setup(monkeypatch, window=None)

    with pytest.raises(HTTPException) as error:
        submit(customer)

    assert error.value.status_code == 503


def test_evidence_image_is_validated_and_reencoded():
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(buffer, format="PNG")
    file = UploadFile(filename="evidence.png", file=io.BytesIO(buffer.getvalue()), headers=Headers({"content-type": "image/png"}))

    normalized = asyncio.run(routes_exchanges.normalized_image(file))

    assert Image.open(io.BytesIO(normalized)).format == "WEBP"

    invalid = UploadFile(filename="evidence.png", file=io.BytesIO(b"not an image"), headers=Headers({"content-type": "image/png"}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_exchanges.normalized_image(invalid))
    assert error.value.status_code == 400
