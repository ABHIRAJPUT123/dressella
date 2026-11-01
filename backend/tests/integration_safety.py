import ipaddress
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values
from pymongo.uri_parser import parse_uri


ACKNOWLEDGEMENT = "I_CONFIRM_THIS_IS_A_DISPOSABLE_TEST_DATABASE"
_DB_NAME = re.compile(r"^[A-Za-z0-9_-]+_test$")


class UnsafeIntegrationTarget(ValueError):
    pass


def _is_loopback(host):
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _validate_local_url(value, label, schemes):
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        _ = parsed.port
    except ValueError:
        raise UnsafeIntegrationTarget(f"{label} is invalid.") from None
    if (
        parsed.scheme not in schemes
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not _is_loopback(host)
    ):
        raise UnsafeIntegrationTarget(f"{label} must use a local, credential-free target.")
    return parsed


def validate_integration_config(environ=None, app_env_file=None):
    env = os.environ if environ is None else environ
    required = (
        "ANORA_TEST_MONGO_URL",
        "ANORA_TEST_DB_NAME",
        "ANORA_TEST_API_URL",
        "ANORA_TEST_ADMIN_EMAIL",
        "ANORA_TEST_ADMIN_PASSWORD",
        "ANORA_TEST_WEBHOOK_SECRET",
        "ANORA_TEST_DB_ACK",
    )
    if any(not env.get(key) for key in required):
        raise UnsafeIntegrationTarget("Explicit ANORA_TEST_* integration configuration is required.")
    if env["ANORA_TEST_DB_ACK"] != ACKNOWLEDGEMENT:
        raise UnsafeIntegrationTarget("The disposable test database acknowledgement is missing.")

    db_name = env["ANORA_TEST_DB_NAME"]
    if not _DB_NAME.fullmatch(db_name):
        raise UnsafeIntegrationTarget("The test database name must end in _test.")

    mongo_url = env["ANORA_TEST_MONGO_URL"]
    if not mongo_url.startswith("mongodb://"):
        raise UnsafeIntegrationTarget("The integration test MongoDB target must use a local mongodb:// URI.")
    try:
        parsed_mongo = parse_uri(mongo_url, validate=True, warn=False)
    except Exception:
        raise UnsafeIntegrationTarget("The integration test MongoDB target is invalid.") from None
    if not parsed_mongo.get("nodelist") or any(not _is_loopback(host) for host, _ in parsed_mongo["nodelist"]):
        raise UnsafeIntegrationTarget("The integration test MongoDB target must be loopback-only.")
    if parsed_mongo.get("database") and parsed_mongo["database"] != db_name:
        raise UnsafeIntegrationTarget("The MongoDB URI database and configured test database do not match.")

    api_url = env["ANORA_TEST_API_URL"].rstrip("/")
    parsed_api = _validate_local_url(api_url, "ANORA_TEST_API_URL", {"http", "https"})
    if parsed_api.path not in ("", "/"):
        raise UnsafeIntegrationTarget("ANORA_TEST_API_URL must be the local API origin without a path.")

    origin = env.get("ANORA_TEST_ALLOWED_ORIGIN", api_url).rstrip("/")
    parsed_origin = _validate_local_url(origin, "ANORA_TEST_ALLOWED_ORIGIN", {"http", "https"})
    if parsed_origin.path not in ("", "/"):
        raise UnsafeIntegrationTarget("ANORA_TEST_ALLOWED_ORIGIN must be a local origin without a path.")

    config_path = Path(app_env_file) if app_env_file else Path(__file__).resolve().parents[1] / ".env"
    file_config = dotenv_values(config_path) if config_path.is_file() else {}
    app_mongo_url = env.get("MONGO_URL") or file_config.get("MONGO_URL")
    app_db_name = env.get("DB_NAME") or file_config.get("DB_NAME")
    if not app_mongo_url or not app_db_name:
        raise UnsafeIntegrationTarget("The local application MongoDB target must be explicitly configured.")
    if app_mongo_url != mongo_url or app_db_name != db_name:
        raise UnsafeIntegrationTarget("The integration target must exactly match the configured local test database.")

    return {
        "mongo_url": mongo_url,
        "db_name": db_name,
        "api_url": api_url,
        "allowed_origin": origin,
        "admin_email": env["ANORA_TEST_ADMIN_EMAIL"],
        "admin_password": env["ANORA_TEST_ADMIN_PASSWORD"],
        "webhook_secret": env["ANORA_TEST_WEBHOOK_SECRET"],
    }
