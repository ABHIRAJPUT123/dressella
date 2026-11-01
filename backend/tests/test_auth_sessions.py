import asyncio
import hashlib
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from pathlib import Path

import jwt
import pytest
from fastapi import HTTPException, Response

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/anora_unit_test")
os.environ.setdefault("DB_NAME", "anora_unit_test")
os.environ.setdefault("JWT_SECRET", "unit-test-secret-not-for-production")

import core  # noqa: E402
import emails  # noqa: E402
import routes_auth  # noqa: E402
import seed  # noqa: E402


class FakeCollection:
    def __init__(self, records=None):
        self.records = records or []

    async def find_one(self, query, *_args, **_kwargs):
        return next((r.copy() for r in self.records if self._matches(r, query)), None)

    async def insert_one(self, record):
        stored = record.copy()
        stored.setdefault("_id", f"fake-{len(self.records)}")
        self.records.append(stored)
        return stored

    async def find_one_and_update(self, query, update, return_document=None):
        for record in self.records:
            if self._matches(record, query):
                record.update(update.get("$set", {}))
                return record.copy()
        return None

    async def update_one(self, query, update, **_kwargs):
        for record in self.records:
            if self._matches(record, query):
                record.update(update.get("$set", {}))
                return type("Result", (), {"matched_count": 1})()
        return type("Result", (), {"matched_count": 0})()

    async def update_many(self, *_args, **_kwargs):
        query, update = _args
        matched = 0
        for record in self.records:
            if self._matches(record, query):
                record.update(update.get("$set", {}))
                matched += 1
        return type("Result", (), {"matched_count": matched, "modified_count": matched})()

    async def delete_one(self, query):
        for i, record in enumerate(self.records):
            if self._matches(record, query):
                del self.records[i]
                return type("Result", (), {"deleted_count": 1})()
        return type("Result", (), {"deleted_count": 0})()

    async def delete_many(self, query):
        retained = [record for record in self.records if not self._matches(record, query)]
        deleted_count = len(self.records) - len(retained)
        self.records[:] = retained
        return type("Result", (), {"deleted_count": deleted_count})()

    @staticmethod
    def _matches(record, query):
        for key, value in query.items():
            actual = record.get(key)
            if isinstance(value, dict) and "$gt" in value:
                if actual is None or not actual > value["$gt"]:
                    return False
            elif actual != value:
                return False
        return True


class FakeDatabase:
    def __init__(self, user=None):
        self.users = FakeCollection([user] if user else [])
        self.login_attempts = FakeCollection()
        self.auth_sessions = FakeCollection()
        self.password_reset_tokens = FakeCollection()
        self.orders = FakeCollection()


def _request(cookies=None):
    cookie_header = "; ".join(f"{key}={value}" for key, value in (cookies or {}).items())
    return routes_auth.Request({
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/auth",
        "raw_path": b"/api/auth",
        "query_string": b"",
        "headers": [(b"cookie", cookie_header.encode())] if cookie_header else [],
        "server": ("test", 80),
        "client": ("127.0.0.1", 12345),
    })


def _cookies(response):
    parsed = SimpleCookie()
    for key, value in response.raw_headers:
        if key.lower() == b"set-cookie":
            parsed.load(value.decode())
    return {name: item.value for name, item in parsed.items()}


def _install_fake_db(monkeypatch):
    user = {
        "id": "user-1",
        "email": "customer@example.com",
        "name": "Test Customer",
        "password_hash": core.hash_password("valid-password"),
        "role": "customer",
        "addresses": [],
        "wishlist": [],
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    fake_db = FakeDatabase(user)
    monkeypatch.setattr(core, "db", fake_db)
    monkeypatch.setattr(routes_auth, "db", fake_db)
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret-not-for-production")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    return fake_db, user


def test_login_creates_cookie_and_server_session(monkeypatch):
    fake_db, _ = _install_fake_db(monkeypatch)
    response = Response()

    result = asyncio.run(
        routes_auth.login(
            routes_auth.LoginIn(email="customer@example.com", password="valid-password"),
            _request(),
            response,
        )
    )

    cookies = _cookies(response)
    assert result["id"] == "user-1"
    assert set(cookies) == {"access_token", "refresh_token"}
    assert len(fake_db.auth_sessions.records) == 1
    assert core.decode_token(cookies["access_token"], "access")["sid"] == fake_db.auth_sessions.records[0]["id"]
    assert core.decode_token(cookies["refresh_token"], "refresh")["jti"] == fake_db.auth_sessions.records[0]["refresh_jti"]
    assert "httponly" in response.headers.get("set-cookie", "").lower()


def test_registration_does_not_claim_guest_orders_by_email(monkeypatch):
    fake_db, _ = _install_fake_db(monkeypatch)
    guest_order = {"id": "guest-order-1", "email": "new-customer@example.com", "user_id": None}
    fake_db.orders.records.append(guest_order)

    asyncio.run(routes_auth.register(
        routes_auth.RegisterIn(
            name="New Customer",
            email="new-customer@example.com",
            password="new-valid-password",
        ),
        Response(),
    ))

    assert guest_order["user_id"] is None


def test_refresh_rotates_token_and_rejects_replay(monkeypatch):
    _install_fake_db(monkeypatch)
    initial_response = Response()
    asyncio.run(
        routes_auth.login(
            routes_auth.LoginIn(email="customer@example.com", password="valid-password"),
            _request(),
            initial_response,
        )
    )
    old_refresh = _cookies(initial_response)["refresh_token"]

    refreshed_response = Response()
    result = asyncio.run(routes_auth.refresh(_request({"refresh_token": old_refresh}), refreshed_response))
    new_cookies = _cookies(refreshed_response)
    assert result["id"] == "user-1"
    assert new_cookies["refresh_token"] != old_refresh

    with pytest.raises(HTTPException) as replay:
        asyncio.run(routes_auth.refresh(_request({"refresh_token": old_refresh}), Response()))
    assert replay.value.status_code == 401


def test_concurrent_refresh_allows_only_one_rotation(monkeypatch):
    _install_fake_db(monkeypatch)
    login_response = Response()
    asyncio.run(
        routes_auth.login(
            routes_auth.LoginIn(email="customer@example.com", password="valid-password"),
            _request(),
            login_response,
        )
    )
    refresh_token = _cookies(login_response)["refresh_token"]

    async def refresh_twice():
        async def attempt():
            try:
                await routes_auth.refresh(_request({"refresh_token": refresh_token}), Response())
                return "success"
            except HTTPException:
                return "rejected"

        return await asyncio.gather(attempt(), attempt())

    assert sorted(asyncio.run(refresh_twice())) == ["rejected", "success"]


def test_logout_revokes_session_and_rejects_refresh_and_access_replay(monkeypatch):
    fake_db, _ = _install_fake_db(monkeypatch)
    login_response = Response()
    asyncio.run(
        routes_auth.login(
            routes_auth.LoginIn(email="customer@example.com", password="valid-password"),
            _request(),
            login_response,
        )
    )
    cookies = _cookies(login_response)
    logout_response = Response()

    assert asyncio.run(routes_auth.logout(_request(cookies), logout_response)) == {"ok": True}
    assert fake_db.auth_sessions.records == []
    assert "max-age=0" in logout_response.headers.get("set-cookie", "").lower()

    with pytest.raises(HTTPException) as refresh_replay:
        asyncio.run(routes_auth.refresh(_request({"refresh_token": cookies["refresh_token"]}), Response()))
    assert refresh_replay.value.status_code == 401
    with pytest.raises(HTTPException) as access_replay:
        asyncio.run(core.get_current_user(_request({"access_token": cookies["access_token"]})))
    assert access_replay.value.status_code == 401


@pytest.mark.parametrize("token_kind", ["invalid", "expired"])
def test_refresh_rejects_invalid_and_expired_tokens(monkeypatch, token_kind):
    _install_fake_db(monkeypatch)
    if token_kind == "invalid":
        token = "not-a-valid-jwt"
    else:
        token = jwt.encode(
            {
                "sub": "user-1",
                "sid": "session-1",
                "jti": "token-1",
                "type": "refresh",
                "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            },
            "unit-test-secret-not-for-production",
            algorithm=core.JWT_ALGORITHM,
        )

    with pytest.raises(HTTPException) as rejected:
        asyncio.run(routes_auth.refresh(_request({"refresh_token": token}), Response()))
    assert rejected.value.status_code == 401


def test_password_reset_token_and_url_never_appear_in_logs(monkeypatch, caplog):
    fake_db, user = _install_fake_db(monkeypatch)
    links = []

    def capture_email(_email, _name, link):
        links.append(link)

        async def delivery():
            return None

        return delivery()

    monkeypatch.setenv("FRONTEND_URL", "https://store.example.test")
    monkeypatch.setattr(routes_auth.emails, "email_configured", lambda: False)
    monkeypatch.setattr(routes_auth.emails, "send_password_reset", capture_email)
    monkeypatch.setattr(routes_auth.emails, "fire", lambda coro: coro.close())
    caplog.set_level(logging.INFO, logger="anora")

    response = asyncio.run(routes_auth.forgot(
        routes_auth.ForgotIn(email=user["email"]),
        _request(),
    ))

    reset_record = fake_db.password_reset_tokens.records[0]
    token = links[0].split("token=", 1)[1]
    assert response == {
        "ok": True,
        "message": "If an account exists for this email, a reset link has been sent.",
    }
    assert reset_record["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert timedelta(0) < reset_record["expires_at"] - core.now() <= timedelta(hours=1)
    assert token not in caplog.text
    assert links[0] not in caplog.text
    assert "/reset-password?token=" not in caplog.text


def test_unconfigured_email_backend_never_logs_reset_link(monkeypatch, caplog):
    fake_db, _ = _install_fake_db(monkeypatch)
    fake_db.email_log = FakeCollection()
    monkeypatch.setattr(emails, "db", fake_db)
    monkeypatch.setenv("EMAIL_BACKEND", "log")
    monkeypatch.delenv("EMERGENT_EMAIL_KEY", raising=False)
    token = "reset-token-must-not-be-logged"
    link = f"https://store.example.test/reset-password?token={token}"
    caplog.set_level(logging.INFO, logger="anora")

    asyncio.run(emails.send_password_reset("customer@example.com", "Test Customer", link))

    assert fake_db.email_log.records[0]["kind"] == "password_reset"
    assert token not in caplog.text
    assert link not in caplog.text
    assert "/reset-password?token=" not in caplog.text


def test_password_reset_response_is_generic_for_unknown_account(monkeypatch):
    fake_db, _ = _install_fake_db(monkeypatch)
    sent = []
    monkeypatch.setattr(routes_auth.emails, "fire", lambda coro: coro.close())

    def record_send(*_args):
        sent.append(True)

        async def delivery():
            return None

        return delivery()

    monkeypatch.setattr(routes_auth.emails, "send_password_reset", record_send)

    existing = asyncio.run(routes_auth.forgot(
        routes_auth.ForgotIn(email="customer@example.com"),
        _request(),
    ))
    unknown = asyncio.run(routes_auth.forgot(
        routes_auth.ForgotIn(email="missing@example.com"),
        _request(),
    ))

    assert existing == unknown
    assert len(fake_db.password_reset_tokens.records) == 1
    assert sent == [True]


def test_password_reset_token_is_single_use(monkeypatch):
    fake_db, user = _install_fake_db(monkeypatch)
    old_password_hash = user["password_hash"]
    session_values = []
    for session_id, token_id in (("session-1", "refresh-1"), ("session-2", "refresh-2")):
        asyncio.run(fake_db.auth_sessions.insert_one({
            "id": session_id,
            "user_id": user["id"],
            "refresh_jti": token_id,
            "expires_at": core.now() + timedelta(days=1),
        }))
        session_values.append((
            core.create_access_token(user["id"], user["email"], user["role"], session_id),
            core.create_refresh_token(user["id"], session_id, token_id),
        ))
    token = "one-time-reset-token-for-unit-test"
    asyncio.run(fake_db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["id"],
        "expires_at": core.now() + timedelta(hours=1),
        "used": False,
    }))

    result = asyncio.run(routes_auth.reset(
        routes_auth.ResetIn(token=token, password="new-valid-password"),
    ))

    assert result == {"ok": True}
    assert fake_db.password_reset_tokens.records[0]["used"] is True
    assert fake_db.users.records[0]["password_hash"] != old_password_hash
    assert core.verify_password("new-valid-password", fake_db.users.records[0]["password_hash"])
    assert fake_db.auth_sessions.records == []
    for access_token, refresh_token in session_values:
        with pytest.raises(HTTPException) as access_replay:
            asyncio.run(core.get_current_user(_request({"access_token": access_token})))
        assert access_replay.value.status_code == 401
        with pytest.raises(HTTPException) as refresh_replay:
            asyncio.run(routes_auth.refresh(_request({"refresh_token": refresh_token}), Response()))
        assert refresh_replay.value.status_code == 401
    with pytest.raises(HTTPException) as replay:
        asyncio.run(routes_auth.reset(
            routes_auth.ResetIn(token=token, password="another-valid-password"),
        ))
    assert replay.value.status_code == 400


def test_admin_password_reset_persists_after_seed(monkeypatch):
    fake_db, user = _install_fake_db(monkeypatch)
    user["email"] = "admin@example.com"
    user["role"] = "admin"
    monkeypatch.setattr(seed, "db", fake_db)
    monkeypatch.setenv("ADMIN_EMAIL", user["email"])
    monkeypatch.setenv("ADMIN_PASSWORD", "original-admin-password")
    token = "one-time-admin-reset-token-for-unit-test"
    asyncio.run(fake_db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["id"],
        "expires_at": core.now() + timedelta(hours=1),
        "used": False,
    }))

    asyncio.run(routes_auth.reset(
        routes_auth.ResetIn(token=token, password="new-admin-password"),
    ))
    asyncio.run(seed.seed_admin())

    assert core.verify_password("new-admin-password", user["password_hash"])
    assert not core.verify_password("original-admin-password", user["password_hash"])
