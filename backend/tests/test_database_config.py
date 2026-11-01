import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/anora_unit_test")
os.environ.setdefault("DB_NAME", "anora_unit_test")

from core import DatabaseConfigurationError, database_config  # noqa: E402


@pytest.mark.parametrize(
    "config",
    [
        {},
        {"MONGO_URL": "mongodb://127.0.0.1:27017"},
        {"DB_NAME": "anora_test"},
        {"MONGO_URL": "not-a-mongodb-uri", "DB_NAME": "anora_test"},
        {"MONGO_URL": "mongodb://127.0.0.1:27017/other", "DB_NAME": "anora_test"},
        {"MONGO_URL": "mongodb://127.0.0.1:27017/anora_test", "DB_NAME": "bad/name"},
    ],
)
def test_missing_or_invalid_database_configuration_is_rejected(config):
    with pytest.raises(DatabaseConfigurationError):
        database_config(config)


def test_valid_explicit_database_configuration_is_returned_without_connecting():
    config = {
        "MONGO_URL": "mongodb://127.0.0.1:27017/anora_unit_test",
        "DB_NAME": "anora_unit_test",
    }
    assert database_config(config) == (config["MONGO_URL"], config["DB_NAME"])


def test_configuration_error_does_not_echo_connection_details():
    secret_uri = "mongodb://user:private-password@127.0.0.1:27017/another_database"
    with pytest.raises(DatabaseConfigurationError) as error:
        database_config({"MONGO_URL": secret_uri, "DB_NAME": "anora_test"})
    assert "private-password" not in str(error.value)
