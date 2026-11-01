# Regression tests for APIs used by the DRESSELLA redesign (rack, shop, auth, admin login)
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except OSError:
        pass

ADMIN_EMAIL = "admin@dressella.test"
ADMIN_PASSWORD = "Dressella-0PA6Gfz73hkT3pXq"


@pytest.fixture
def s():
    return requests.Session()


# Homepage rack data source
def test_rack_products_newest(s):
    r = s.get(f"{BASE_URL}/api/products", params={"sort": "newest", "limit": 24})
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["items"], list) and len(d["items"]) > 0
    for p in d["items"]:
        assert p["slug"] and p["title"] and p["price"] > 0
        assert "_id" not in p


# Product detail by slug (rack click target)
def test_product_detail_by_slug(s):
    items = s.get(f"{BASE_URL}/api/products", params={"sort": "newest", "limit": 24}).json()["items"]
    p = items[0]
    r = s.get(f"{BASE_URL}/api/products/{p['slug']}")
    assert r.status_code == 200
    assert r.json()["product"]["title"] == p["title"]


def test_product_404(s):
    assert s.get(f"{BASE_URL}/api/products/does-not-exist-xyz").status_code == 404


# Shop sort
def test_shop_sort_price_asc(s):
    items = s.get(f"{BASE_URL}/api/products", params={"sort": "price_asc"}).json()["items"]
    prices = [p["price"] for p in items]
    assert prices == sorted(prices)


# Customer auth
def test_register_and_me(s):
    email = f"test_t1_{int(time.time()*1000)}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register", json={"name": "TEST User", "email": email, "password": "Shopper#2026pass"})
    assert r.status_code in (200, 201), r.text
    assert r.json()["email"] == email
    me = s.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == email


# Admin login with the configured credentials (currently FAILS: .test TLD rejected by EmailStr)
def test_admin_login(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    assert r.json().get("role") == "admin" or r.json().get("user", {}).get("role") == "admin"
