# ANORA — quick start on Windows

## First: view the storefront in Chrome

1. Extract the entire ZIP to a normal folder, for example `C:\ANORA` (do not open `index.html` by double-clicking it).
2. Install Node.js LTS from https://nodejs.org/ if it is not already installed. Reopen Command Prompt after installation.
3. Open the extracted folder, then open `frontend`.
4. Double-click `start-frontend-windows.bat`. The first run installs packages and can take a few minutes; allow it to finish. Keep the terminal open.
5. When the terminal says the development server is ready, open **http://localhost:3000** in Chrome.

If port 3000 is already in use, the terminal may offer another port (such as 3001). Open the exact URL printed in that terminal.

## Important distinction

The frontend is a React application; opening `frontend/public/index.html` directly in Chrome will show a blank page because the React bundles are created by the development server/build. Use the URL printed by `npm start` instead.

The UI can start without the API, but products, login, admin, cart validation, and checkout need the backend. The backend requires a reachable MongoDB instance and configured `backend/.env`.

## Start the backend (only after MongoDB and backend environment are configured)

1. Install Python 3.11+.
2. Checkout requires MongoDB transactions for both Cash on Delivery and online payment. Configure local MongoDB as a single-node replica set: in `mongod.cfg`, add `replication:` with an indented `replSetName: rs0`, then restart the MongoDB service. Run `mongosh --eval "rs.initiate()"` once. Keep your existing database path and data unchanged. If MongoDB is already a replica set, do not initialize it again.
3. Copy `backend/.env.example` to `backend/.env` and set `MONGO_URL` (for local replica set use `mongodb://localhost:27017/?replicaSet=rs0`), `DB_NAME`, `CORS_ORIGINS=http://localhost:3000`, `FRONTEND_URL=http://localhost:3000`, a strong `JWT_SECRET`, and a strong `ADMIN_PASSWORD`. With managed MongoDB, use the provider's replica-set connection string.
4. In Command Prompt, run:

   ```bat
   cd backend
   py -m venv .venv
   .venv\Scripts\activate
   python -m pip install -r requirements.txt
   python -m uvicorn server:app --host 127.0.0.1 --port 8001
   ```

5. Open `http://localhost:8001/api/health`. A healthy configured database should return `{"status":"ok","db":"ok"}`. If it reports 503 or cannot connect, fix MongoDB/environment configuration before testing checkout or admin.
6. After signing in as an admin, open **Content & Pages → Store & homepage** and set the exchange window only after ANORA's policy is confirmed. Leave it blank to keep exchange submissions disabled. Requests are manually reviewed; pickup, shipping, replacement fulfilment, and any return/refund processing are not automated.

## If Chrome still cannot open it

- Copy the full terminal output from the frontend start window.
- Confirm the terminal reports the server is ready and share the exact local URL it prints.
- In Chrome, press `Ctrl+Shift+R` after the server is ready.
- Do not share passwords, JWT secrets, MongoDB credentials, or Razorpay secret keys in screenshots/logs.

## Online hosting

Localhost links work only on your own computer. For a client link, deploy the frontend and backend separately (or configure a reverse proxy), provision managed MongoDB, set the production environment variables and HTTPS origins, and test the deployed site's routes and checkout. Do not use the demo prices/stock or accept live payments until the launch checklist has been completed.
