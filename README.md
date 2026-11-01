# ANORA — Luxury Women's Fashion E-Commerce

React (CRA + Tailwind + shadcn/ui) storefront & admin · FastAPI backend · MongoDB · Emergent Object Storage · Razorpay (test-mode structure).

> **Demo content notice** — the 10 seeded products use the owner's uploaded photography and product facts read from the supplied supplier screenshots. **Retail prices and stock (8 per size) are placeholders** flagged `is_demo: true` and shown with a "Demo" badge in Admin. Confirm real prices/inventory before launch. Policy pages are seeded as **DRAFT** and must be reviewed by the owner/legal counsel.

## Architecture
```
frontend/ (React SPA)            backend/ (FastAPI, 0.0.0.0:8001, all routes /api/*)
  src/context  Auth/Cart/          server.py        app, security headers, CSRF origin guard, body limits, health
    Wishlist/Consent               core.py          db pool, JWT cookies, RBAC deps, rate limiter, object storage + LRU media cache
  src/components Header, Mega,     pricing.py       pure business logic (coupon, totals, phone/PIN, Razorpay HMAC)  ← unit tested
    Bag, Filters, Gallery,         routes_catalog   products, facets, search, media, pages, newsletter, consent log, sitemap
    CookieConsent, ...             routes_orders    cart validation, checkout (idempotent), verify, webhook, retry, tracking
  src/pages  storefront            routes_account   profile, addresses, wishlist, orders
  src/admin  dashboard               routes_admin     products, uploads, orders, refunds, coupons, customers, newsletter, settings, pages
  routes_exchanges customer exchange requests, private evidence images, admin review
                                   seed.py          idempotent indexes + admin + demo catalog + media upload
```

### Key guarantees
- **Prices & stock validated server-side** (`/api/cart/validate`, `/api/checkout`). The client never sets prices.
- **Orders are only marked paid after Razorpay HMAC verification** (checkout signature or signed webhook). `mark_paid` is an atomic, idempotent transition; duplicate callbacks/webhooks never double-decrement stock. Webhook events are de-duplicated by `X-Razorpay-Event-Id` (unique index). Checkout uses an `idempotency_key` (unique index) so double-submits return the same order.
- **Payment failure recovery** — unpaid orders can be paid later from `/order/:id?t=…` via `/api/checkout/retry`.
- **RBAC on the backend** — every `/api/admin/*` route requires role `admin`/`staff`; deleting products, refunds, customer records and CSV export require `admin` (owner).
- **Returns & exchanges** — exchange requests are limited to the authenticated customer's delivered orders and the configured post-delivery window. The window is set in Admin → Content & Pages → Store & homepage; leaving it blank disables submissions until ANORA confirms its policy. Requests do not change orders or inventory, create replacement orders, book pickup, or issue refunds. Admin approval/rejection is audited; shipping, inspection, stock recheck, and fulfilment remain manual. Optional evidence images are validated, re-encoded, and stored privately with the request.
- **Auth** — bcrypt hashes, short-lived JWT access cookie (15 min) + refresh cookie (7 days, path-scoped), server-side session revocation and atomic refresh-token rotation, httpOnly/Secure/SameSite=Lax, brute-force lockout (5 attempts → 15 min), hashed single-use reset tokens (1 h TTL).
- **CSRF** — cookie auth + SameSite=Lax + Origin allow-list check on all unsafe methods.
- **Product uploads** — admin only, ≤ 8 MB, verified with Pillow, re-encoded to WebP (600 & 1400 px), stored in object storage; served via `/api/media/*` with `Cache-Control: immutable` (CDN-friendly). Exchange evidence uses a separate private, authenticated image path.
- **Consent** — optional scripts (GA4, Meta Pixel) are injected by `src/lib/trackers.js` **only** after the matching category is granted, and only if their env IDs exist. Recently-viewed (personalisation) is stored only with consent and erased on withdrawal. Choices stored in localStorage + first-party cookie; an anonymous audit record is written to `consent_log`. "Cookie Settings" in the footer reopens preferences.

## Environment variables
backend/.env
| Key | Purpose |
|---|---|
| MONGO_URL, DB_NAME | Explicit MongoDB URI and database name; if the URI contains a database name, it must match `DB_NAME` |
| CORS_ORIGINS | Comma-separated allowed origins (also used for CSRF origin check) |
| FRONTEND_URL | Public site URL (sitemap) |
| JWT_SECRET | 64-char random secret — rotate for production |
| ADMIN_EMAIL / ADMIN_PASSWORD | Initial credentials for the seeded owner account; password resets persist across restarts |
| EMERGENT_LLM_KEY, APP_NAME | Object storage auth + path prefix |
| EMAIL_BACKEND | `mailpit` captures all email locally; `emergent` uses managed email; `log` disables delivery |
| MAILPIT_SMTP_HOST / PORT | Local Mailpit SMTP address; host must be a loopback IP |
| EMAIL_SANDBOX_RECIPIENT / EMAIL_FROM_ADDRESS | Reserved `.test` addresses used by the local Mailpit sink |
| EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME, EMAIL_REPLY_TO | Managed email credentials and sender settings; never needed for Mailpit |
| RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET | Required together. Use test credentials for development |
| RAZORPAY_WEBHOOK_SECRET | Required with the key pair; must match the configured Razorpay webhook |
| RAZORPAY_MODE | Required: `test` or `live`; key ID prefix must match. The secret itself cannot identify its mode |
| COOKIE_SECURE | `true` in any HTTPS environment |

Checkout reserves inventory and coupons in MongoDB transactions for both Cash on Delivery and online payments. Use a replica-set or sharded MongoDB deployment; standalone MongoDB instances do not support checkout transactions.

frontend/.env: `REACT_APP_BACKEND_URL` (required), optional `REACT_APP_GA_MEASUREMENT_ID`, `REACT_APP_META_PIXEL_ID` (loaded only with consent).

## Setting up payments (Razorpay)
1. Create a Razorpay account → Dashboard → *Test Mode* → Settings → API Keys → generate key.
2. Put the matching test `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `RAZORPAY_MODE=test` in backend env, restart backend. Payments stay disabled unless all are configured consistently.
3. Dashboard → Webhooks → add `https://<your-domain>/api/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`, set a secret → `RAZORPAY_WEBHOOK_SECRET`.
4. Test with Razorpay test UPI/cards. Admin → Overview shows mode (TEST/LIVE).
5. Go live: complete KYC, swap to `rzp_live_…` keys + live webhook secret.

## Local email testing (Mailpit)
Mailpit is a local-only email sandbox. Install it with `winget install --id axllent.mailpit`, then start it bound to loopback and accept only reserved test domains:
```
mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --smtp-allowed-recipients '^[^@]+@(example\.com|[^@]+\.test)$'
```
Set `EMAIL_BACKEND=mailpit`, `MAILPIT_SMTP_HOST=127.0.0.1`, `MAILPIT_SMTP_PORT=1025`, and `EMAIL_FROM_ADDRESS=no-reply@anora.test` in `backend/.env`. Mailpit does not issue a special recipient address; use a reserved test address such as `checkout-test@example.com` in test data. The application rejects non-test recipient domains in Mailpit mode, and the sandbox SMTP/UI bind to loopback with no relay enabled. View all captured messages at `http://127.0.0.1:8025`.

For production email, leave Mailpit mode disabled and configure the managed provider's `EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME`, and optional `EMAIL_REPLY_TO`. Without a provider key, messages are logged but not sent.

## Local development
```
cd backend && pip install -r requirements.txt && uvicorn server:app --reload --port 8001
cd frontend && yarn install && yarn start
cd backend && python -m pytest tests -q        # business-logic tests
```
Seeding runs automatically on startup and is idempotent.

Before accepting exchange requests, configure the exchange window (1–365 days) in **Admin → Content & Pages → Store & homepage** after the business policy has been confirmed. The default is unconfigured, so the request form remains disabled until then. The **Return & Exchange Policy** page explains the review and manual handling steps; the online flow currently supports exchanges, not automated returns or refunds.

### Safe integration tests

The API integration suite writes and cleans up database records. It will be skipped unless all `ANORA_TEST_*` settings are explicitly configured, the API and MongoDB targets are loopback-only, the application MongoDB target exactly matches the dedicated test target, the database name ends in `_test`, and `ANORA_TEST_DB_ACK` is set to `I_CONFIRM_THIS_IS_A_DISPOSABLE_TEST_DATABASE`. Use a disposable local MongoDB database only. Never point these tests at production or a shared customer database.

Provide `ANORA_TEST_MONGO_URL`, `ANORA_TEST_DB_NAME`, `ANORA_TEST_API_URL`, `ANORA_TEST_ADMIN_EMAIL`, `ANORA_TEST_ADMIN_PASSWORD`, and `ANORA_TEST_WEBHOOK_SECRET` alongside the acknowledgement before running `python -m pytest tests/test_api_integration.py -q`. Unit-only tests such as `python -m pytest tests/test_business_logic.py tests/test_email_sandbox.py tests/test_auth_sessions.py tests/test_integration_safety.py -q` do not require a running API or MongoDB.

## Deployment & operations
- Health check: `GET /api/health` (503 when DB unreachable).
- [`render.yaml`](render.yaml) prepares a free Render static frontend and Python API. To deploy: push the project to a Git provider, create a Render account, choose **New → Blueprint**, connect the repository, and set the prompted MongoDB URI, random JWT secret, unique admin email/password, and managed email provider key (`EMERGENT_EMAIL_KEY`). Replace `anora-store.onrender.com` and `anora-api.onrender.com` in the Blueprint if Render assigns different service URLs; keep CORS and `REACT_APP_BACKEND_URL` consistent.
- The API uses the managed email backend in production configuration. Add a valid provider key and verify a password-reset email reaches its inbox before launch; without the key, email delivery remains disabled. Configure Razorpay test keys and webhook secret before testing checkout; use live keys only after sandbox verification and account approval.
- Set `TRUSTED_PROXY_CIDRS` to the exact trusted reverse-proxy networks published by your host; do not trust client-supplied forwarding headers. Without proxy CIDRs, rate limiting safely uses the direct peer address, which can group requests behind a proxy.
- Set `EMERGENT_LLM_KEY` only if managed object storage is configured; without it the app serves bundled seed media locally and does not call external storage.
- Confirm all demo prices, inventory, policies, and media storage before launch. Products seeded by default are marked as demo.
- Production database setup is external: create a dedicated MongoDB database, configure a strong unique database user, and allow network access only from the hosting provider's documented egress IPs where available. Do not point automated tests at production data.
- Logs are structured single-line JSON-ish records; ship to your log platform.
- Put a CDN (e.g. Cloudflare) in front of the domain; `/api/media/*` and static assets are long-cache safe.
- Rate limiting is per-process in memory; when running multiple replicas, add edge rate-limiting (CDN/WAF).
- **Backups**: use your managed MongoDB's automated daily snapshots + point-in-time restore. Manual: `mongodump --uri "$MONGO_URL" --db $DB_NAME --out backup/` and restore with `mongorestore --uri "$MONGO_URL" --nsInclude "$DB_NAME.*" backup/`.
- No load testing has been performed; do not make capacity claims until tested (e.g. k6 against a staging copy).

## SEO
Per-route titles/descriptions/canonical/OG via `useSeo`, Product + Breadcrumb JSON-LD, `/api/sitemap.xml`, `public/robots.txt` (update the sitemap host for your domain). The storefront is a client-rendered SPA; for best crawlability add prerendering (e.g. a prerender service at the CDN) before launch.

## Launch checklist
- [ ] Confirm real prices, stock, size chart and fabric for trousers (marked "to be confirmed")
- [ ] Review & approve policy pages (Admin → Content & Pages), add grievance officer
- [ ] Add Razorpay keys + webhook secret, run test-mode orders end-to-end
- [ ] Configure email provider; set contact email/phone in Admin
- [ ] Rotate `JWT_SECRET`, change admin password, set production `CORS_ORIGINS`/`FRONTEND_URL`
- [ ] Optional analytics IDs; verify they load only after consent


## Client handoff
See [`CLIENT_HANDOFF_CHECKLIST.md`](CLIENT_HANDOFF_CHECKLIST.md) for setup steps, verification status, and launch blockers. Example environment files are provided at `backend/.env.example` and `frontend/.env.example`; copy them to `.env` and replace placeholders before running.
