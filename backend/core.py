import os
import time
import uuid
import logging
import threading
import ipaddress
from collections import defaultdict, deque, OrderedDict
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.uri_parser import parse_uri

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","src":"%(name)s","msg":"%(message)s"}')
logger = logging.getLogger("anora")


class DatabaseConfigurationError(ValueError):
    pass


def database_config(environ=None):
    env = os.environ if environ is None else environ
    mongo_url = (env.get("MONGO_URL") or "").strip()
    db_name = (env.get("DB_NAME") or "").strip()
    if not mongo_url or not db_name:
        raise DatabaseConfigurationError("MONGO_URL and DB_NAME must be explicitly configured.")
    if any(char in db_name for char in ("/", "\\", ".", "$", " ", "\0")):
        raise DatabaseConfigurationError("DB_NAME contains invalid characters.")
    try:
        parsed = parse_uri(mongo_url, validate=True, warn=False)
    except Exception:
        raise DatabaseConfigurationError("MONGO_URL is not a valid MongoDB URI.") from None
    if not parsed.get("nodelist"):
        raise DatabaseConfigurationError("MONGO_URL must include a MongoDB host.")
    uri_db = parsed.get("database")
    if uri_db and uri_db != db_name:
        raise DatabaseConfigurationError("The MongoDB URI database does not match DB_NAME.")
    return mongo_url, db_name


MONGO_URL, DB_NAME = database_config()
try:
    client = AsyncIOMotorClient(MONGO_URL, maxPoolSize=50, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
except Exception:
    raise DatabaseConfigurationError("MongoDB client configuration is invalid.") from None

JWT_ALGORITHM = "HS256"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"


def now():
    return datetime.now(timezone.utc)


def now_iso():
    return now().isoformat()


def new_id():
    return str(uuid.uuid4())


def clean(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


# ---------- Auth ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def _secret():
    return os.environ["JWT_SECRET"]


def create_access_token(uid, email, role, session_id):
    return jwt.encode({"sub": uid, "email": email, "role": role, "sid": session_id, "type": "access",
                       "exp": now() + timedelta(minutes=15)}, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(uid, session_id, token_id):
    return jwt.encode({"sub": uid, "sid": session_id, "jti": token_id, "type": "refresh",
                       "exp": now() + timedelta(days=7)}, _secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access, refresh=None):
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=900, path="/")
    if refresh:
        response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=604800, path="/api/auth")


def decode_token(token, expected_type):
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid session")
    if payload.get("type") != expected_type:
        raise HTTPException(401, "Invalid token type")
    return payload


def public_user(u):
    return {"id": u["id"], "email": u["email"], "name": u.get("name", ""), "phone": u.get("phone", ""),
            "role": u.get("role", "customer"), "addresses": u.get("addresses", []), "created_at": u.get("created_at")}


async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        token = h[7:] if h.startswith("Bearer ") else None
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(token, "access")
    session = await db.auth_sessions.find_one(
        {"id": payload.get("sid"), "user_id": payload["sub"], "expires_at": {"$gt": now()}}
    )
    if not session:
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("disabled"):
        raise HTTPException(401, "User not found")
    return user


async def get_optional_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") not in ("admin", "staff"):
        raise HTTPException(403, "Admin access required")
    return user


async def require_owner(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(403, "Owner access required")
    return user


# ---------- Rate limiting (per-process sliding window) ----------
_hits = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request):
    peer = request.client.host if request.client else "unknown"
    try:
        peer_ip = ipaddress.ip_address(peer)
    except ValueError:
        return peer

    trusted = [
        ipaddress.ip_network(value.strip(), strict=False)
        for value in os.environ.get("TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128").split(",")
        if value.strip()
    ]
    if not any(peer_ip in network for network in trusted):
        return str(peer_ip)

    forwarded = request.headers.get("x-forwarded-for", "")
    for value in reversed(forwarded.split(",")):
        try:
            address = ipaddress.ip_address(value.strip())
        except ValueError:
            continue
        if not any(address in network for network in trusted):
            return str(address)
    return str(peer_ip)


def rate_limit(bucket: str, limit: int, window: int):
    async def dep(request: Request):
        key = f"{bucket}:{client_ip(request)}"
        t = time.time()
        with _lock:
            q = _hits[key]
            while q and q[0] < t - window:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(429, "Too many requests. Please wait a moment and try again.")
            q.append(t)
    return dep


# ---------- Object storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = os.environ.get("APP_NAME", "anora")
_storage_key = None


def init_storage(force=False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    storage_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not storage_key:
        raise RuntimeError("Object storage requires EMERGENT_LLM_KEY.")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": storage_key}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def put_object(path, data, content_type):
    for attempt in range(2):
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(force=attempt > 0), "Content-Type": content_type}, data=data, timeout=120)
        if r.status_code == 404 and attempt == 0:
            continue
        r.raise_for_status()
        return r.json()


class _LRU(OrderedDict):
    def __init__(self, max_bytes=150 * 1024 * 1024):
        super().__init__()
        self.max_bytes, self.size = max_bytes, 0

    def put(self, k, v):
        self[k] = v
        self.size += len(v[0])
        while self.size > self.max_bytes:
            _, old = self.popitem(last=False)
            self.size -= len(old[0])


media_cache = _LRU()


def get_object(path):
    if path in media_cache:
        media_cache.move_to_end(path)
        return media_cache[path]
    for attempt in range(2):
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(force=attempt > 0)}, timeout=60)
        if r.status_code == 404 and attempt == 0:
            continue
        r.raise_for_status()
        val = (r.content, r.headers.get("Content-Type", "application/octet-stream"))
        media_cache.put(path, val)
        return val


# ---------- Settings ----------
DEFAULT_SETTINGS = {
    "key": "store",
    "announcement": "New season: The Jaipur Edit — block prints and pure cotton, now online",
    "shipping_flat": 99,
    "free_shipping_threshold": 2500,
    "delivery_estimate": "Usually dispatched within 1–2 business days. Delivery typically 3–7 business days depending on location.",
    "exchange_window_days": None,
    "contact_email": "dressella2026@gmail.com",
    "contact_phone": "",
    "hero": {"eyebrow": "The Jaipur Edit", "title": "Quiet colour, hand-printed in the Pink City", "subtitle": "Pure cottons and fluid rayons, cut for days that move from courtyard to city.", "image": "", "cta_primary": "Shop the Collection", "cta_secondary": "Discover New Arrivals"},
    "editorials": [],
}


async def get_settings():
    s = await db.settings.find_one({"key": "store"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **(s or {})}
