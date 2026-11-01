import builtins
import runpy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from integration_safety import (  # noqa: E402
    ACKNOWLEDGEMENT,
    UnsafeIntegrationTarget,
    validate_integration_config,
)


def _config(**overrides):
    env = {
        "ANORA_TEST_MONGO_URL": "mongodb://127.0.0.1:27017/anora_audit_test",
        "ANORA_TEST_DB_NAME": "anora_audit_test",
        "ANORA_TEST_API_URL": "http://127.0.0.1:8001",
        "ANORA_TEST_ADMIN_EMAIL": "admin@example.test",
        "ANORA_TEST_ADMIN_PASSWORD": "local-only-test-password",
        "ANORA_TEST_WEBHOOK_SECRET": "local-only-webhook-secret",
        "ANORA_TEST_DB_ACK": ACKNOWLEDGEMENT,
        "MONGO_URL": "mongodb://127.0.0.1:27017/anora_audit_test",
        "DB_NAME": "anora_audit_test",
    }
    env.update(overrides)
    return env


def test_explicit_local_test_target_is_accepted(tmp_path):
    env = _config()
    app_env = tmp_path / ".env"
    app_env.write_text(
        "MONGO_URL=mongodb://127.0.0.1:27017/anora_audit_test\n"
        "DB_NAME=anora_audit_test\n",
        encoding="utf-8",
    )

    config = validate_integration_config(env, app_env)

    assert config["db_name"] == "anora_audit_test"
    assert config["api_url"] == "http://127.0.0.1:8001"


@pytest.mark.parametrize(
    "overrides",
    [
        {"ANORA_TEST_DB_ACK": ""},
        {"ANORA_TEST_DB_NAME": "anora"},
        {"ANORA_TEST_MONGO_URL": "mongodb+srv://cluster.example.invalid/test"},
        {"ANORA_TEST_MONGO_URL": "mongodb://db.example.invalid:27017/anora_audit_test"},
        {"ANORA_TEST_API_URL": "https://api.example.invalid"},
        {"ANORA_TEST_DB_NAME": "anora_other_test"},
        {"MONGO_URL": "mongodb://127.0.0.1:27017/anora"},
    ],
)
def test_unsafe_or_ambiguous_target_is_rejected(tmp_path, overrides):
    env = _config(**overrides)
    app_env = tmp_path / ".env"
    app_env.write_text(
        "MONGO_URL=mongodb://127.0.0.1:27017/anora_audit_test\n"
        "DB_NAME=anora_audit_test\n",
        encoding="utf-8",
    )

    with pytest.raises(UnsafeIntegrationTarget):
        validate_integration_config(env, app_env)


def test_integration_module_refuses_missing_configuration_before_client_or_http_imports(monkeypatch):
    for key in list(__import__("os").environ):
        if key.startswith("ANORA_TEST_"):
            monkeypatch.delenv(key, raising=False)

    imported = []
    original_import = builtins.__import__

    def guard_import(name, *args, **kwargs):
        imported.append(name)
        if name == "requests" or name == "pymongo" or name.startswith("motor"):
            raise AssertionError("Network/database client imported before test target validation.")
        return original_import(name, *args, **kwargs)

    module_path = str(Path(__file__).resolve().with_name("test_api_integration.py"))
    monkeypatch.setattr(builtins, "__import__", guard_import)
    with pytest.raises(pytest.skip.Exception):
        runpy.run_path(module_path)

    assert not any(name == "requests" or name == "pymongo" or name.startswith("motor") for name in imported)
