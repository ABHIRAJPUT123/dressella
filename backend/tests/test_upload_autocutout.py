# Iteration 7: Add Stock upload alpha->ivory composite, Rack auto cutout (AI) endpoint + auth/404
import io
import json
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
TRANSPARENT_PNG = "/app/brand_assets/rack_cutouts/olive-lotus-square-neck-tunic.png"
RUN_AI = os.environ.get("RUN_AI_CUTOUT") == "1"  # costs credits; opt-in


def _login(email, pw):
    s = requests.Session()
    s.headers.update({"Origin": BASE_URL})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
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


def _get_img(s, path):
    r = s.get(f"{BASE_URL}/api/media/{path}")
    assert r.status_code == 200, r.text[:200]
    return Image.open(io.BytesIO(r.content))


def _near(px, target, tol=6):
    return all(abs(a - b) <= tol for a, b in zip(px[:3], target))


# --- Add Stock upload ---
class TestUpload:
    def test_transparent_png_gets_ivory(self, admin):
        with open(TRANSPARENT_PNG, "rb") as f:
            r = admin.post(f"{BASE_URL}/api/admin/upload", files={"file": ("t.png", f, "image/png")})
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("path", "path_lg"):
            im = _get_img(admin, d[key])
            assert im.format == "WEBP"
            assert im.mode == "RGB", im.mode
            w, h = im.size
            for xy in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]:
                px = im.getpixel(xy)
                assert _near(px, (251, 248, 242)), f"{key} corner {xy} = {px}"

    def test_palette_png_with_transparency(self, admin):
        im = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
        for x in range(15, 35):
            for y in range(15, 35):
                im.putpixel((x, y), (200, 20, 20, 255))
        p = im.convert("P", palette=Image.ADAPTIVE)
        p.info["transparency"] = p.getpixel((0, 0))
        b = io.BytesIO(); p.save(b, "PNG", transparency=p.getpixel((0, 0))); b.seek(0)
        r = admin.post(f"{BASE_URL}/api/admin/upload", files={"file": ("p.png", b, "image/png")})
        assert r.status_code == 200, r.text
        out = _get_img(admin, r.json()["path"])
        assert _near(out.getpixel((1, 1)), (251, 248, 242), 8), out.getpixel((1, 1))

    def test_jpeg_unchanged(self, admin):
        im = Image.new("RGB", (80, 100), (10, 60, 200))
        b = io.BytesIO(); im.save(b, "JPEG", quality=95); b.seek(0)
        r = admin.post(f"{BASE_URL}/api/admin/upload", files={"file": ("j.jpg", b, "image/jpeg")})
        assert r.status_code == 200, r.text
        out = _get_img(admin, r.json()["path"])
        assert out.mode == "RGB"
        assert _near(out.getpixel((40, 50)), (10, 60, 200), 10), out.getpixel((40, 50))

    def test_upload_requires_admin(self, customer):
        b = io.BytesIO(); Image.new("RGB", (10, 10)).save(b, "PNG"); b.seek(0)
        r = customer.post(f"{BASE_URL}/api/admin/upload", files={"file": ("x.png", b, "image/png")})
        assert r.status_code in (401, 403)

    def test_invalid_upload(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/upload", files={"file": ("x.png", b"notanimage", "image/png")})
        assert r.status_code == 400


# --- Auto cutout auth / 404 ---
class TestAutoCutoutGuards:
    def test_guest(self):
        r = requests.post(f"{BASE_URL}/api/admin/rack/auto/whatever", headers={"Origin": BASE_URL})
        assert r.status_code in (401, 403)

    def test_customer(self, customer):
        r = customer.post(f"{BASE_URL}/api/admin/rack/auto/whatever")
        assert r.status_code in (401, 403)

    def test_unknown_product(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/rack/auto/TEST_does_not_exist")
        assert r.status_code == 404


@pytest.mark.skipif(not RUN_AI, reason="AI cutout costs credits; set RUN_AI_CUTOUT=1")
def test_auto_cutout_real(admin):
    rack = admin.get(f"{BASE_URL}/api/admin/rack").json()
    item = next(i for i in rack["items"] if i["product"]["slug"] == "olive-lotus-square-neck-tunic")
    r = admin.post(f"{BASE_URL}/api/admin/rack/auto/{item['product']['id']}", timeout=150)
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    assert path.startswith("anora/rack/") and path.endswith(".webp")
    im = _get_img(admin, path)
    assert im.mode == "RGBA"
    w, h = im.size
    alphas = [im.getpixel(xy)[3] for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    print("auto path", path, im.size, "corner alphas", alphas)
    with open("/tmp/auto_cutout_result.json", "w") as f:
        json.dump({"path": path, "size": im.size}, f)
    im.save("/tmp/auto_cutout.png")
    assert sum(1 for a in alphas if a == 0) >= 2
    # rack config must not have changed (not live until save)
    after = admin.get(f"{BASE_URL}/api/admin/rack").json()
    assert [i["image"] for i in after["items"]] == [i["image"] for i in rack["items"]]
