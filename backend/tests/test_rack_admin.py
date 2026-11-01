# Rack config feature: public /api/rack, admin CRUD /api/admin/rack, rack image upload, media serving
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = ("admin@example.com", "Dressella-b0yqcdsM90wCsXsIxh9MEqfx")
CUSTOMER = ("t1shopper1793560624@example.com", "Shopper#2026pass")
EXPECTED_ORDER = ["pastel-stripe-dress", "scarlet-buti-a-line-kurta", "ivory-rose-a-line-kurta", "maroon-bloom-short-kurti",
                  "ivory-blossom-peplum-kurti", "rust-medallion-square-neck-tunic", "magenta-paisley-tiered-kurti",
                  "marigold-floral-short-kurti", "olive-lotus-square-neck-tunic", "taupe-straight-trousers"]


def _login(email, pw):
    s = requests.Session()
    s.headers.update({"Origin": BASE_URL})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def customer():
    return _login(*CUSTOMER)


@pytest.fixture(scope="module")
def original(admin):
    r = admin.get(f"{BASE_URL}/api/admin/rack")
    assert r.status_code == 200
    items = [{"product_id": i["product"]["id"], "image": i["image"]} for i in r.json()["items"]]
    yield items
    # always restore
    rr = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": items})
    assert rr.status_code == 200


def _png(alpha=True):
    im = Image.new("RGBA", (40, 60), (200, 50, 50, 0 if alpha else 255))
    for x in range(10, 30):
        for y in range(10, 50):
            im.putpixel((x, y), (120, 30, 30, 255))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


# Public rack
def test_public_rack_configured_10(original):
    r = requests.get(f"{BASE_URL}/api/rack")
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is True
    slugs = [i["product"]["slug"] for i in d["items"]]
    assert slugs == EXPECTED_ORDER
    for i in d["items"]:
        assert i["image"] and i["image"].startswith("anora/rack/")
        assert "_id" not in i["product"]
        for k in ("id", "slug", "title", "price", "images", "category"):
            assert k in i["product"]


def test_public_rack_images_webp_alpha():
    d = requests.get(f"{BASE_URL}/api/rack").json()
    for i in d["items"]:
        r = requests.get(f"{BASE_URL}/api/media/{i['image']}")
        assert r.status_code == 200, i["image"]
        assert r.headers["content-type"].startswith("image/webp")
        im = Image.open(io.BytesIO(r.content))
        assert im.mode in ("RGBA", "LA") or "transparency" in im.info, f"{i['image']} mode {im.mode}"
        assert im.convert("RGBA").getextrema()[3][0] < 50  # has transparent pixels


# Auth guards
@pytest.mark.parametrize("method,path", [("get", ""), ("put", ""), ("delete", ""), ("post", "/upload")])
def test_guest_blocked(method, path):
    s = requests.Session()
    s.headers["Origin"] = BASE_URL
    kw = {"json": {"items": []}} if method == "put" else {}
    if method == "post":
        kw = {"files": {"file": ("a.png", _png(), "image/png")}}
    r = getattr(s, method)(f"{BASE_URL}/api/admin/rack{path}", **kw)
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("method,path", [("get", ""), ("put", ""), ("delete", ""), ("post", "/upload")])
def test_customer_blocked(customer, method, path):
    kw = {"json": {"items": []}} if method == "put" else {}
    if method == "post":
        kw = {"files": {"file": ("a.png", _png(), "image/png")}}
    r = getattr(customer, method)(f"{BASE_URL}/api/admin/rack{path}", **kw)
    assert r.status_code == 403


# Validation
def test_put_duplicate_rejected(admin, original):
    pid = original[0]["product_id"]
    r = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": [{"product_id": pid}, {"product_id": pid}]})
    assert r.status_code == 400


def test_put_unknown_rejected(admin, original):
    r = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": [{"product_id": "TEST_nope"}]})
    assert r.status_code == 400


def test_put_too_many_rejected(admin, original):
    r = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": [{"product_id": f"x{i}"} for i in range(41)]})
    assert r.status_code == 422


def test_put_bad_image_path_rejected(admin, original):
    r = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": [{"product_id": original[0]["product_id"], "image": "<script>"}]})
    assert r.status_code == 422


# Upload
def test_upload_png_keeps_alpha(admin):
    r = admin.post(f"{BASE_URL}/api/admin/rack/upload", files={"file": ("TEST_g.png", _png(), "image/png")})
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    assert path.startswith("anora/rack/") and path.endswith(".webp")
    m = requests.get(f"{BASE_URL}/api/media/{path}")
    assert m.status_code == 200
    im = Image.open(io.BytesIO(m.content)).convert("RGBA")
    assert im.getpixel((0, 0))[3] == 0


def test_upload_non_image_rejected(admin):
    r = admin.post(f"{BASE_URL}/api/admin/rack/upload", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 400


# Reorder + delete/reset + restore
def test_reorder_and_reset_then_restore(admin, original):
    rev = list(reversed(original[:3]))
    r = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": rev})
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/rack").json()
    assert [i["product"]["id"] for i in pub["items"]] == [x["product_id"] for x in rev]

    r = admin.delete(f"{BASE_URL}/api/admin/rack")
    assert r.status_code == 200 and r.json()["configured"] is False
    pub = requests.get(f"{BASE_URL}/api/rack").json()
    assert pub["configured"] is False and len(pub["items"]) > 0
    assert all(i["image"] is None for i in pub["items"])
    g = admin.get(f"{BASE_URL}/api/admin/rack").json()
    assert g["configured"] is False and g["items"] == []

    r = admin.put(f"{BASE_URL}/api/admin/rack", json={"items": original})
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/rack").json()
    assert [i["product"]["slug"] for i in pub["items"]] == EXPECTED_ORDER


# Regression: Add Stock image upload with object storage
def test_admin_product_upload_regression(admin):
    b = io.BytesIO()
    Image.new("RGB", (80, 100), (10, 120, 90)).save(b, "JPEG")
    r = admin.post(f"{BASE_URL}/api/admin/upload", files={"file": ("TEST_p.jpg", b.getvalue(), "image/jpeg")})
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    m = requests.get(f"{BASE_URL}/api/media/{path}")
    assert m.status_code == 200 and m.headers["content-type"].startswith("image/")
