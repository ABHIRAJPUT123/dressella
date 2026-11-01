import asyncio
import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/anora_unit_test")
os.environ.setdefault("DB_NAME", "anora_unit_test")

import routes_account  # noqa: E402


class Cursor:
    def sort(self, *_args):
        return self

    async def to_list(self, _length):
        return []


class Orders:
    def find(self, query, *_args):
        self.list_query = query
        return Cursor()

    async def find_one(self, query, *_args):
        self.detail_query = query
        return None


def _install_orders(monkeypatch):
    orders = Orders()
    monkeypatch.setattr(routes_account, "db", type("FakeDB", (), {"orders": orders})())
    return orders


def test_account_order_list_is_scoped_to_user_id(monkeypatch):
    orders = _install_orders(monkeypatch)
    user = {"id": "customer-1", "email": "customer@example.test"}

    assert asyncio.run(routes_account.my_orders(user)) == []
    assert orders.list_query == {"user_id": "customer-1"}


def test_account_order_detail_is_scoped_to_user_id(monkeypatch):
    orders = _install_orders(monkeypatch)
    user = {"id": "customer-1", "email": "customer@example.test"}

    with pytest.raises(HTTPException) as error:
        asyncio.run(routes_account.my_order("ANR2601000001", user))

    assert error.value.status_code == 404
    assert orders.detail_query == {"order_number": "ANR2601000001", "user_id": "customer-1"}
