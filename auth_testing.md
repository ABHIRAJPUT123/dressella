# Auth testing playbook (ANORA)

Run these checks only against a local or explicitly approved staging deployment. Do not run integration tests against a live client store.

1. Set `REACT_APP_BACKEND_URL` to the intended test backend origin (defaults to `http://localhost:8001`), `MONGO_URL` and `DB_NAME` to a non-production test database, and `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` to the local seeded admin credentials. Set `RAZORPAY_WEBHOOK_SECRET` to the matching test webhook secret if testing webhooks.
2. Mongo: inspect the non-production test database to confirm the seeded admin exists and the password is hashed.
3. API: log in through `/api/auth/login` and check `/api/auth/me`; cookies should be `httpOnly`, `SameSite=Lax`, and `Secure` when HTTPS is used.
4. Brute force: repeated failed logins should trigger a temporary 429 lockout.
5. Reset: request `/api/auth/forgot-password`; until an email provider is configured, the reset link may only be written to backend logs.
6. Unsafe requests with a foreign `Origin` header should be rejected with 403.

Never place real passwords, API keys, or production endpoints in this file.
