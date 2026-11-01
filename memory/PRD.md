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
