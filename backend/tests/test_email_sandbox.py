import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "anora_email_test")
os.environ.setdefault("JWT_SECRET", "local-email-test-secret-not-for-production")

import emails  # noqa: E402
import core  # noqa: E402
import seed  # noqa: E402
from starlette.requests import Request  # noqa: E402


class FakeEmailLog:
    def __init__(self):
        self.records = []

    async def insert_one(self, record):
        self.records.append(record)


class FakeDatabase:
    def __init__(self):
        self.email_log = FakeEmailLog()


def test_mailpit_mode_captures_reserved_test_recipient(monkeypatch):
    monkeypatch.setenv("EMAIL_BACKEND", "mailpit")
    monkeypatch.setenv("MAILPIT_SMTP_HOST", "127.0.0.1")
    monkeypatch.setenv("MAILPIT_SMTP_PORT", "1025")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "no-reply@anora.test")
    monkeypatch.delenv("EMERGENT_EMAIL_KEY", raising=False)
    monkeypatch.setattr(emails, "db", FakeDatabase())
    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            assert host == "127.0.0.1"
            assert port == 1025
            assert timeout == 10

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr(emails.smtplib, "SMTP", FakeSMTP)

    asyncio.run(emails.send_email(
        to="checkout-test@example.com",
        subject="ANORA sandbox test",
        html="<p>Captured locally.</p>",
        kind="sandbox_test",
    ))

    assert emails.email_configured()
    assert sent[0]["To"] == "checkout-test@example.com"
    assert sent[0]["From"].endswith("no-reply@anora.test>")
    assert emails.db.email_log.records[0]["to"] == "checkout-test@example.com"
    assert emails.db.email_log.records[0]["status"] == "sent"


def test_mailpit_rejects_external_smtp_hosts(monkeypatch):
    monkeypatch.setenv("EMAIL_BACKEND", "mailpit")
    monkeypatch.setenv("MAILPIT_SMTP_HOST", "mail.example.com")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "no-reply@anora.test")
    monkeypatch.setattr(emails, "db", FakeDatabase())
    smtp = AsyncMock()
    monkeypatch.setattr(emails.smtplib, "SMTP", smtp)

    asyncio.run(emails.send_email(
        to="real-customer@example.com",
        subject="ANORA sandbox test",
        html="<p>Must not leave the machine.</p>",
        kind="sandbox_test",
    ))

    smtp.assert_not_called()
    assert emails.db.email_log.records[0]["status"] == "failed"
    assert "loopback" in emails.db.email_log.records[0]["error"]


@pytest.mark.parametrize("recipient", ["qa@gmail.com", "qa@anora.test.evil"])
def test_mailpit_rejects_non_reserved_recipient_domains(monkeypatch, recipient):
    monkeypatch.setenv("MAILPIT_SMTP_HOST", "127.0.0.1")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "no-reply@anora.test")

    with pytest.raises(ValueError, match="reserved example.com or .test"):
        emails._mailpit_recipient(recipient)


def test_mailpit_does_not_capture_non_test_addresses(monkeypatch):
    monkeypatch.setenv("EMAIL_BACKEND", "mailpit")
    monkeypatch.setenv("MAILPIT_SMTP_HOST", "127.0.0.1")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "no-reply@anora.test")
    monkeypatch.setattr(emails, "db", FakeDatabase())
    smtp = AsyncMock()
    monkeypatch.setattr(emails.smtplib, "SMTP", smtp)

    asyncio.run(emails.send_email(
        to="person@gmail.com",
        subject="ANORA sandbox test",
        html="<p>Must not be captured.</p>",
        kind="sandbox_test",
    ))

    smtp.assert_not_called()
    assert emails.db.email_log.records[0]["status"] == "failed"


def _request(peer, forwarded=""):
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": headers,
        "server": ("test", 80),
        "client": (peer, 12345),
    })


def test_rate_limit_ip_ignores_forwarded_headers_from_untrusted_peers(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128,10.0.0.0/8")

    assert core.client_ip(_request("198.51.100.9", "203.0.113.7")) == "198.51.100.9"


def test_rate_limit_ip_uses_client_from_trusted_proxy_chain(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128,10.0.0.0/8")

    assert core.client_ip(_request("10.0.0.3", "203.0.113.7, 10.0.0.2")) == "203.0.113.7"


def test_storage_initialization_fails_closed_without_credentials(monkeypatch):
    monkeypatch.setattr(core, "_storage_key", None)
    monkeypatch.delenv("EMERGENT_LLM_KEY", raising=False)
    post = AsyncMock()
    monkeypatch.setattr(core.requests, "post", post)

    with pytest.raises(RuntimeError, match="requires EMERGENT_LLM_KEY"):
        core.init_storage()

    post.assert_not_called()


class EmptyCursor:
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class LocalMediaCollection:
    def __init__(self):
        self.inserted = []

    def find(self, *_args, **_kwargs):
        return EmptyCursor()

    async def update_one(self, query, *_args, **_kwargs):
        self.inserted.append(query["path"])

    async def update_many(self, *_args, **_kwargs):
        raise AssertionError("Local-only seed must not mark remote media uploaded.")


class LocalMediaDatabase:
    def __init__(self):
        self.media = LocalMediaCollection()


def test_seed_media_stays_local_without_storage_credentials(monkeypatch):
    monkeypatch.delenv("EMERGENT_LLM_KEY", raising=False)
    database = LocalMediaDatabase()
    monkeypatch.setattr(seed, "db", database)
    upload = AsyncMock()
    monkeypatch.setattr(seed, "_upload_media_sync", upload)

    asyncio.run(seed.seed_media())

    assert database.media.inserted
    assert all(path.startswith("anora/seed/") for path in database.media.inserted)
    upload.assert_not_awaited()
