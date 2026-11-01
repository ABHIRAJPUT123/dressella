# ANORA — Client Handoff & Launch Checklist

## Current audit status
- Frontend startup helper added: `frontend/start-frontend-windows.bat`.
- Frontend API URL now falls back to `http://localhost:8001` when `.env` is absent.
- Removed external Emergent/PostHog scripts from the HTML shell so they cannot block initial page loading or send telemetry from the template.
- Removed optional private Emergent overlay packages from `package.json`; the CRACO config already treats these tools as optional.
- Frontend production build: passed locally with `npm run build`.
- Backend Python syntax compilation: passed for all backend Python files.
- Isolated backend business-logic and email-sandbox tests: 15 passed.
- Live API, database, auth, admin, checkout, and payment flows: not verified end-to-end; no MongoDB service is listening locally.
- Render Blueprint leaves Razorpay credentials as manual secret inputs; payments remain disabled until valid environment-matched credentials and webhook secret are configured.

## Required setup
1. Install Python 3.11+ (use a version supported by your deployment), Node.js 20+ and MongoDB, or obtain a managed MongoDB URI.
2. Copy `backend/.env.example` to `backend/.env`; fill in all required values. Never commit `.env`. Use a unique random `JWT_SECRET` and a strong unique admin password.
3. Copy `frontend/.env.example` to `frontend/.env`; set `REACT_APP_BACKEND_URL` to the backend's reachable origin.
4. Backend: `cd backend`, create/activate a virtual environment, install `requirements.txt`, then run `uvicorn server:app --host 0.0.0.0 --port 8001`.
5. Frontend: `cd frontend`, run `npm install` (or `yarn install` if using Yarn consistently), then `npm start`.
6. Check `GET http://localhost:8001/api/health`. It should return HTTP 200 with `status: ok` and `db: ok`.
7. Check the storefront and admin login in a browser; test registration/login/logout, product search/filter/detail, cart quantity/stock validation, addresses, checkout, order tracking, and admin CRUD.
8. For production, configure real HTTPS frontend/backend URLs, `CORS_ORIGINS`, `FRONTEND_URL`, `COOKIE_SECURE=true`, a strong JWT secret, database backups, and a changed admin password.

## Client launch blockers to resolve
- **Catalog data:** seeded retail prices and stock are demo placeholders. Confirm real prices, inventory, size charts, and fabric details before taking orders.
- **Policies:** policy pages are drafts. Owner/legal counsel must review them; add required business/grievance contact details.
- **Payments:** blank Razorpay keys mean payments are disabled. Test with Razorpay test credentials and a webhook secret before live mode. Never put secret keys in frontend environment variables.
- **Email:** email delivery is not automatically ready. Configure the supported email provider and verify order/password-reset messages, or clearly disable/promote no email promises until tested.
- **Storage:** configure the object-storage key for production product/admin uploads; verify seeded and uploaded images load on the deployed domain.
- **Deployment:** ensure `/api/*` reaches FastAPI and the SPA routes have a fallback to `index.html`; use separate frontend/backend URLs correctly if not serving from one domain.
- **Integration tests:** tests now default to `http://localhost:8001`; configure test credentials and a separate test database before running them. Never run the test suite against production.
- **Verification:** do not represent this site as production-ready until a successful production build and end-to-end test on the actual deployment have been completed.

## Environment notes
The `.env.example` files contain placeholders only. Copy them to `.env` and replace placeholders; do not deploy with placeholder secrets. `COOKIE_SECURE=false` is only for local HTTP development. Use `true` behind HTTPS in production.
