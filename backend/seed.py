"""Idempotent seed. Products are DEMO content built from the owner's uploaded photos; prices & stock are placeholders to be confirmed in Admin."""
import asyncio
import os
from datetime import timedelta
from pathlib import Path

from core import db, now, new_id, hash_password, put_object, logger

MEDIA_DIR = Path(__file__).parent / "seed_media"
ALL = ["S", "M", "L", "XL", "2XL"]
FOUR = ["S", "M", "L", "XL"]
DEMO_STOCK = 8

CATEGORIES = [
    {"slug": "dresses", "name": "Dresses", "description": "Easy, fluid silhouettes for warm days.", "order": 1},
    {"slug": "kurtas", "name": "Kurtas", "description": "A-line kurtas in Jaipuri cotton, cut for movement.", "order": 2},
    {"slug": "tops", "name": "Tops & Short Kurtis", "description": "Block-printed short kurtis and tunics.", "order": 3},
    {"slug": "trousers", "name": "Trousers", "description": "Clean, straight-leg foundations.", "order": 4},
]
COLLECTIONS = [
    {"slug": "the-jaipur-edit", "name": "The Jaipur Edit", "description": "Hand-block inspired prints from the Pink City.", "order": 1, "active": True},
    {"slug": "festive-edit", "name": "Festive Edit", "description": "Saturated reds and berry tones for celebrations.", "order": 2, "active": True},
    {"slug": "desk-to-dinner", "name": "Desk to Dinner", "description": "Polished pieces that move through the working day.", "order": 3, "active": True},
    {"slug": "everyday-ease", "name": "Everyday Ease", "description": "Breathable layers for daily rituals.", "order": 4, "active": True},
]

CAMBRIC = dict(fabric="Jaipuri cotton cambric (60x60)", composition="100% Cotton", care="Gentle hand wash cold, separately. Dry in shade. Warm iron on reverse.")
RAYON = dict(fabric="Jaipuri rayon", composition="100% Rayon", care="Gentle hand wash cold. Do not wring. Dry in shade. Low iron.")

PRODUCTS = [
    dict(slug="pastel-stripe-dress", n=5, title="Pastel Stripe Belted Midi Dress", sku="ANR-DR-001", category="dresses", collections=["the-jaipur-edit", "everyday-ease"],
         occasion=["Casual", "Day Out"], style=["Western", "Midi"], color={"name": "Pastel Stripe", "hex": "#E6CAD6"}, price=2450, sizes=ALL, fit="Regular", length='46"',
         neckline="Round neck", sleeve="Cap sleeve", **RAYON,
         description="A softly washed palette of blush, mint and lilac stripes on a fluid rayon midi. Front buttons, an easy cap sleeve and a self belt with a woven ring buckle define the waist without restriction."),
    dict(slug="scarlet-buti-a-line-kurta", n=4, src="red-aline-kurta", title="Scarlet Buti A-Line Kurta", sku="ANR-KU-001", category="kurtas", collections=["the-jaipur-edit", "festive-edit"],
         occasion=["Festive", "Everyday"], style=["Ethnic", "A-Line"], color={"name": "Scarlet", "hex": "#B3303A"}, price=1950, sizes=ALL, fit="Regular", length='44"',
         neckline="Chinese collar", sleeve="Three-quarter", **CAMBRIC,
         description="A scarlet A-line kurta scattered with ivory buti motifs. The Chinese collar and concealed placket keep the line clean; the flare falls gently from the bust."),
    dict(slug="ivory-rose-a-line-kurta", n=4, src="rose-floral-aline-kurta", title="Ivory Rose A-Line Kurta", sku="ANR-KU-002", category="kurtas", collections=["the-jaipur-edit", "everyday-ease"],
         occasion=["Everyday", "Day Out"], style=["Ethnic", "A-Line"], color={"name": "Ivory", "hex": "#F3EEE7"}, price=1950, sizes=ALL, fit="Regular", length='44"',
         neckline="Chinese collar", sleeve="Three-quarter", **CAMBRIC,
         description="Oversized crimson roses bloom across an ivory cotton ground. A breathable A-line kurta with a Chinese collar and button placket."),
    dict(slug="maroon-bloom-short-kurti", n=4, src="maroon-floral-short-kurti", title="Maroon Bloom Short Kurti", sku="ANR-TP-001", category="tops", collections=["the-jaipur-edit", "desk-to-dinner"],
         occasion=["Workwear", "Everyday"], style=["Ethnic", "Short Kurti"], color={"name": "Maroon", "hex": "#6E2232"}, price=1450, sizes=ALL, fit="Regular", length='32"',
         neckline="Chinese collar", sleeve="Three-quarter", **CAMBRIC,
         description="A deep maroon short kurti with tonal floral print, side pockets and a neat Chinese collar — made to pair with straight trousers."),
    dict(slug="ivory-blossom-peplum-kurti", n=3, title="Ivory Blossom Peplum Kurti", sku="ANR-TP-002", category="tops", collections=["everyday-ease"],
         occasion=["Everyday", "Day Out"], style=["Ethnic", "Peplum"], color={"name": "Off White", "hex": "#ECE5DA"}, price=1450, sizes=ALL, fit="Regular", length='32"',
         neckline="V-neck", sleeve="Three-quarter", **CAMBRIC,
         description="Fine lilac and rose florals on off-white cotton, gathered into a gentle peplum below a V-neck."),
    dict(slug="rust-medallion-square-neck-tunic", n=4, src="rust-orange-square-neck-top", title="Rust Medallion Square-Neck Tunic", sku="ANR-TP-003", category="tops", collections=["desk-to-dinner", "everyday-ease"],
         occasion=["Workwear", "Casual"], style=["Tunic", "Square Neck"], color={"name": "Rust", "hex": "#B5532E"}, price=990, sizes=FOUR, fit="Regular", length='32"',
         neckline="Square neck", sleeve="Three-quarter", **RAYON,
         description="Ivory medallions printed on a warm rust rayon. A clean square neckline and straight body make this an easy desk-to-dinner tunic."),
    dict(slug="magenta-paisley-tiered-kurti", n=4, title="Magenta Paisley Tiered Kurti", sku="ANR-TP-004", category="tops", collections=["festive-edit", "the-jaipur-edit"],
         occasion=["Festive", "Day Out"], style=["Ethnic", "Tiered"], color={"name": "Magenta", "hex": "#9E2A5E"}, price=1450, sizes=ALL, fit="Regular", length='32"',
         neckline="V-neck", sleeve="Three-quarter", **CAMBRIC,
         description="Berry-toned paisley on cotton cambric, gathered into a tiered skirt that moves beautifully. A V-neck finishes the look."),
    dict(slug="marigold-floral-short-kurti", n=4, src="mustard-floral-short-kurti", title="Marigold Floral Short Kurti", sku="ANR-TP-005", category="tops", collections=["the-jaipur-edit", "desk-to-dinner"],
         occasion=["Workwear", "Everyday"], style=["Ethnic", "Short Kurti"], color={"name": "Mustard", "hex": "#C99A35"}, price=1450, sizes=ALL, fit="Regular", length='32"',
         neckline="Chinese collar", sleeve="Three-quarter", **CAMBRIC,
         description="A sunlit mustard ground with dense floral print, side pockets and a Chinese collar with a short placket."),
    dict(slug="olive-lotus-square-neck-tunic", n=5, src="olive-green-square-neck-top", title="Olive Lotus Square-Neck Tunic", sku="ANR-TP-006", category="tops", collections=["desk-to-dinner", "everyday-ease"],
         occasion=["Workwear", "Casual"], style=["Tunic", "Square Neck"], color={"name": "Olive", "hex": "#6B6A2E"}, price=990, sizes=FOUR, fit="Regular", length='32"',
         neckline="Square neck", sleeve="Three-quarter", **RAYON,
         description="Ivory lotus motifs on deep olive rayon with a structured square neckline — quietly graphic, endlessly wearable."),
    dict(slug="taupe-straight-trousers", n=5, src="taupe-straight-trousers", title="Taupe Straight Trousers", sku="ANR-TR-001", category="trousers", collections=["everyday-ease", "desk-to-dinner"],
         occasion=["Workwear", "Everyday"], style=["Western", "Straight"], color={"name": "Taupe", "hex": "#C9AE9F"}, price=1290, sizes=ALL, fit="Straight", length="Full length",
         neckline="", sleeve="", fabric="Fabric details to be confirmed", composition="", care="Care details to be confirmed",
         description="Straight-leg trousers with an elasticated drawstring waist and side pockets — the foundation for every kurti in the collection."),
]


def media_path(src, i, w):
    return f"anora/seed/{src}-{i}-{w}.webp"


def build_product(d, idx):
    src = d.pop("src", d["slug"])
    n = d.pop("n")
    sizes = d.pop("sizes")
    t = d["title"]
    images = [{"path": media_path(src, i, 600), "path_lg": media_path(src, i, 1200), "alt": f"{t} — view {i + 1}"} for i in range(n)]
    return {"id": new_id(), **d, "subtitle": "", "compare_at_price": None, "group": "", "images": images,
            "sizes": [{"size": s, "stock": DEMO_STOCK} for s in sizes], "status": "published", "sales_count": 0, "is_demo": True,
            "created_at": (now() - timedelta(days=idx)).isoformat(), "updated_at": now().isoformat()}


def page(slug, title, body, meta=""):
    return {"slug": slug, "title": title, "body": body.strip(), "meta_description": meta, "reviewed": False}


DRAFT = "DRAFT — to be reviewed and approved by the business owner (and legal counsel) before launch."

PAGES = [
    page("about", "About DRESSELLA", """
## Fashion for her, made with intent
DRESSELLA is a women's label rooted in India and shaped by an international eye. We work with Jaipur's textile traditions — printed cottons, fluid rayons, considered silhouettes — and edit them for the way modern women dress today.

## The aesthetic
Quiet colour. Honest fabric. Shapes that move from a morning courtyard to an evening in the city. We believe a wardrobe should be built slowly, with pieces you return to season after season.

## Our promise
Clear prices, accurate product information and a shopping experience that respects your time and your privacy.
""", "The story and aesthetic behind DRESSELLA — women's fashion rooted in Jaipur craft."),
    page("shipping-policy", "Shipping Policy", f"""
{DRAFT}

## Where we ship
We currently ship to serviceable PIN codes within India.

## Dispatch & delivery
Orders are usually dispatched within 1–2 business days of payment confirmation. Delivery typically takes 3–7 business days depending on your location. These are estimates, not guarantees.

## Shipping charges
A flat shipping fee applies to orders below the free-shipping threshold shown in your bag. Final shipping charges are always displayed before payment.

## Tracking
Once shipped, you will be able to see your carrier and tracking number in your account or on the Track Order page.
"""),
    page("returns", "Returns & Exchanges", f"""
{DRAFT}

## Eligibility
Unworn, unwashed items with original tags may be eligible for return or exchange within the window confirmed by DRESSELLA. Final window and conditions to be set by the business owner.

## How to request
Contact our client care team with your order number. We will confirm eligibility and next steps.

## Refunds
Approved refunds are issued to the original payment method via our payment partner. Bank processing times may vary.
"""),
    page("privacy-policy", "Privacy Policy", f"""
{DRAFT}

## What we collect
Information you provide (name, email, phone, addresses) to process orders and manage your account; payment is handled by our payment partner — we never store card details.

## Cookies
Strictly necessary cookies keep the site secure and your bag working. Analytics, marketing and personalisation cookies are used only with your consent, which you can change anytime via Cookie Settings in the footer.

## Your rights
Under India's Digital Personal Data Protection Act, 2023 and other applicable laws, you may request access, correction or erasure of your personal data, and withdraw consent. Contact us to exercise these rights.

## Grievance officer
Name and contact details of the grievance officer to be added by the business owner.
"""),
    page("terms", "Terms & Conditions", f"""
{DRAFT}

## Use of this website
By using this website you agree to these terms. Content, imagery and branding belong to DRESSELLA.

## Pricing
All prices are in Indian Rupees and inclusive of applicable taxes unless stated otherwise. In the event of a pricing error we may cancel the affected order and issue a full refund.

## Orders
An order is confirmed only after payment is verified by our payment partner.

## Governing law
These terms are governed by the laws of India. Jurisdiction to be confirmed by the business owner.
"""),
    page("faq", "Frequently Asked Questions", """
## How do I choose my size?
Refer to our Size Guide. Each product page lists garment length and fit.

## Which payment methods do you accept?
Payments are processed securely by Razorpay, which supports UPI, cards, net banking and wallets once enabled for the store.

## Can I check out without an account?
Yes. Guest checkout is available. To see orders in your account, sign in before placing the order; guest orders can be tracked with the order number and email.

## How can I track my order?
Use the Track Order page with your order number and email, or view orders in your account.

## How do I change my cookie preferences?
Click Cookie Settings in the footer at any time.
"""),
]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.products.create_index("slug", unique=True)
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("id", unique=True)
    await db.products.create_index([("status", 1), ("category", 1), ("created_at", -1)])
    await db.products.create_index([("status", 1), ("collections", 1)])
    await db.products.create_index([("status", 1), ("price", 1)])
    await db.products.create_index([("status", 1), ("sales_count", -1)])
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("order_number", unique=True)
    await db.orders.create_index("idempotency_key", unique=True)
    await db.orders.create_index("razorpay_order_id", unique=True, sparse=True)
    await db.orders.create_index([("email", 1), ("created_at", -1)])
    await db.orders.create_index([("status", 1), ("created_at", -1)])
    await db.exchange_requests.create_index("request_id", unique=True)
    await db.exchange_requests.create_index([("customer_id", 1), ("created_at", -1)])
    await db.exchange_requests.create_index([("status", 1), ("created_at", -1)])
    await db.exchange_requests.create_index("active_key", unique=True, sparse=True)
    await db.auth_sessions.create_index("id", unique=True)
    await db.auth_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.coupons.create_index("code", unique=True)
    await db.webhook_events.create_index("event_id", unique=True)
    await db.newsletter.create_index("email", unique=True)
    await db.media.create_index("path", unique=True)
    await db.pages.create_index("slug", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")


async def seed_admin():
    email, pw = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    u = await db.users.find_one({"email": email})
    if not u:
        await db.users.insert_one({"id": new_id(), "email": email, "name": "DRESSELLA Admin", "password_hash": hash_password(pw), "role": "admin",
                                   "addresses": [], "wishlist": [], "created_at": now().isoformat()})
    elif u.get("role") != "admin":
        await db.users.update_one({"email": email}, {"$set": {"role": "admin"}})


async def seed_catalog():
    for c in CATEGORIES:
        await db.categories.update_one({"slug": c["slug"]}, {"$setOnInsert": {**c, "image": "", "active": True}}, upsert=True)
    for c in COLLECTIONS:
        await db.collections.update_one({"slug": c["slug"]}, {"$setOnInsert": {**c, "image": ""}}, upsert=True)
    if await db.products.count_documents({}) == 0:
        for i, d in enumerate(PRODUCTS):
            await db.products.insert_one(build_product(dict(d), i))
    for p in PAGES:
        await db.pages.update_one({"slug": p["slug"]}, {"$setOnInsert": p}, upsert=True)
    async for existing in db.pages.find({}, {"title": 1, "body": 1, "meta_description": 1}):
        updates = {}
        for field in ("title", "body", "meta_description"):
            value = existing.get(field)
            if isinstance(value, str) and "ANORA" in value:
                updates[field] = value.replace("ANORA", "DRESSELLA")
        if updates:
            await db.pages.update_one({"_id": existing["_id"]}, {"$set": updates})
    await db.settings.update_one(
        {"key": "store", "contact_email": "care@anora.in"},
        {"$set": {"contact_email": "dressella2026@gmail.com"}},
    )
    if not await db.settings.find_one({"key": "store"}):
        from core import DEFAULT_SETTINGS
        s = dict(DEFAULT_SETTINGS)
        s["hero"] = {**s["hero"], "image": media_path("rose-floral-aline-kurta", 0, 1200), "image_secondary": media_path("red-aline-kurta", 0, 1200)}
        s["editorials"] = [
            {"title": "Desk to Dinner", "text": "Short kurtis and tunics with structure — made for long days and late plans.", "image": media_path("maroon-floral-short-kurti", 0, 1200), "link": "/collections/desk-to-dinner", "cta": "Explore the edit"},
            {"title": "The Festive Edit", "text": "Berry, scarlet and saffron — colour that celebrates.", "image": media_path("magenta-paisley-tiered-kurti", 0, 1200), "link": "/collections/festive-edit", "cta": "Shop festive"},
        ]
        await db.settings.insert_one(s)
    if not await db.coupons.find_one({"code": "WELCOME10"}):
        await db.coupons.insert_one({"code": "WELCOME10", "description": "DEMO coupon — 10% off orders above ₹1,500", "type": "percent", "value": 10, "min_subtotal": 1500,
                                     "max_discount": 500, "max_uses": None, "expires_at": None, "active": True, "used_count": 0, "created_at": now().isoformat()})


def _upload_media_sync(existing):
    done = []
    for f in sorted(MEDIA_DIR.glob("*.webp")):
        path = f"anora/seed/{f.name}"
        if path in existing:
            continue
        try:
            put_object(path, f.read_bytes(), "image/webp")
            done.append(path)
        except Exception as e:
            logger.error(f"seed upload failed {path}: {e}")
    return done


async def seed_media():
    existing = {m["path"] async for m in db.media.find({"path": {"$regex": "^anora/seed/"}}, {"path": 1})}
    # Register local seed files immediately (served from disk until uploaded)
    for f in MEDIA_DIR.glob("*.webp"):
        p = f"anora/seed/{f.name}"
        if p not in existing:
            await db.media.update_one({"path": p}, {"$setOnInsert": {"id": new_id(), "path": p, "content_type": "image/webp", "is_deleted": False, "uploaded": False}}, upsert=True)
    if not os.environ.get("EMERGENT_LLM_KEY", "").strip():
        logger.info("seed media remains local; object storage is not configured")
        return
    pending = {m["path"] async for m in db.media.find({"path": {"$regex": "^anora/seed/"}, "uploaded": False}, {"path": 1})}
    done = await asyncio.to_thread(_upload_media_sync, {m for m in existing if m not in pending})
    if done:
        await db.media.update_many({"path": {"$in": done}}, {"$set": {"uploaded": True}})
    logger.info(f"seed media uploaded: {len(done)}")


async def run_seed():
    await ensure_indexes()
    await seed_admin()
    await seed_catalog()
