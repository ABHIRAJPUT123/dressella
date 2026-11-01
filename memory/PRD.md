# ANORA — PRD

## Original problem statement
Premium luxury women's fashion e-commerce website "ANORA" for the Indian market (inspired by The Collective, Louis Vuitton, Prada principles). Full storefront (home, shop/filters, PDP, search, bag, checkout with Razorpay, accounts, wishlist), cookie consent architecture, secure admin dashboard, SEO, accessibility, security, performance, docs and tests. Use uploaded logo + product photos; never fabricate stock/bestsellers/discounts/reviews.

## User choices
- Razorpay: no credentials yet → full integration structure, placeholder keys (payments disabled until keys added)
- Images: Emergent Object Storage
- Scope: full storefront MVP + admin, seeded demo catalog, iterate later
- Admin creds: agent picked (admin@anora.in / Anora@Admin2026)
- Email: skipped, documented

## Architecture
React SPA (Tailwind/shadcn, Cormorant Garamond + Manrope, ivory/charcoal/champagne palette) · FastAPI modular routers (auth, catalog, orders, account, admin) · MongoDB with indexes · Object storage for WebP images served via /api/media with immutable cache · JWT httpOnly cookies + RBAC · in-process rate limits · CSRF origin guard · security headers.

## Implemented (2026-10-09)
- 10 DEMO products from uploaded photos (10 groups, 46 images cropped 3:4, WebP 600/1200), 4 categories, 4 collections; demo prices/stock flagged
- Homepage (announcement, mega menu, split hero, new arrivals, categories, editorials, collections, brand story, newsletter w/ consent; bestsellers only when real sales exist)
- Shop/category/collection/new-in/sale/search pages: facet filters from real data, sort, load-more, mobile drawer, empty states
- PDP: gallery w/ hover zoom + lightbox + mobile swipe, sizes w/ stock, size guide, qty limits, add/buy now, pincode format check, accordions, related, recently viewed (consent-gated), JSON-LD
- Search overlay w/ keyboard nav; bag drawer w/ server repricing
- Checkout: guest/account, Indian phone/PIN validation, server-validated coupon, idempotent order creation, Razorpay order/verify/webhook/retry, order page; pending_payment when gateway unconfigured
- Accounts: register/login/logout/refresh, brute-force lockout, password reset (link logged), profile, addresses, orders, wishlist sync
- Cookie consent (accept/reject/customise, persistent, withdrawable, script loader gated)
- Admin: metrics, products CRUD + image upload, orders status/tracking/refund, coupons, customers (owner only), newsletter + CSV, store/hero/editorial settings, policy pages editor, taxonomy, messages
- Supporting pages, 404, error boundary, degraded banner, sitemap, robots
- Tests: 6 unit + 44 API integration (all pass); iteration_1 UI issues fixed (nested coupon form, button label, fetchPriority, buy-now drawer)

## Backlog
- P0: Add Razorpay test keys + webhook secret, run real test payments; confirm real prices/stock/size chart; legal review of policies
- P1: Email provider (order confirmation, shipping, reset); prerendering for SEO; variants/colourways UI in admin; CDN + edge rate-limit
- P2: Reviews (real only), returns workflow, GST invoices, analytics IDs, load tests


## Luxury redesign — Nov 2026 (frontend only, backend untouched)
- Problem: redesign DRESSELLA (github ABHIRAJPUT123/dressella) into a premium luxury women's fashion storefront + interactive clothing rack, preserving all business logic.
- Done: new palette (ivory/cream/beige/cocoa/umber/ink) + fonts (Cormorant Garamond, Jost, Italiana); redesigned home (split hero, showroom rail, marquee, numbered sections), header, footer, product cards, shop header band, auth split-screen, wishlist, bag drawer (free-shipping progress), page heroes.
- Clothing rack (`components/ClothingRack.jsx`): CSS-3D layered photo rack using live `/api/products` data; desktop hover brings garment forward + neighbours part, click → `/product/:slug`; touch devices get swipe + numbered selectors (count = product count); error boundary fallback strip; lazy-loaded chunk.
- Security: `.env` files git-ignored; prod-only console logging gated; no secrets in bundle.
- Backlog: P1 clear checkout field errors on change; P1 COD order heading copy ("awaiting payment" vs "Confirmed"); P2 rack shows newest 24 products max.


## Nov 2026 — iteration 6
- Admin "Edit Rack" (/admin/rack, after Add Stock): add/remove/reorder rack products, upload garment-only transparent image per item. Backend `routes_rack.py`: GET /api/rack (public), GET/PUT/DELETE /api/admin/rack, POST /api/admin/rack/upload (alpha kept). Config in settings doc key "rack".
- Rack now shows garment-only cutouts (AI ghost-mannequin + background removal) for all 10 products; sources in brand_assets/rack_cutouts/.
- Rack category tabs, checkout inline error clearing, page fade, scroll reveal, single newsletter (footer), mobile layout fixes.
- Env: APP_NAME=anora (media route requires anora/ prefix), object storage enabled via EMERGENT_LLM_KEY.
- Backlog: Add Stock upload turns transparent PNG background black (pre-existing); cleanup orphan rack images; unsaved-changes warning in Edit Rack.
