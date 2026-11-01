from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, new_id, get_current_user, public_user
from routes_orders import AddressIn, public_order

router = APIRouter(prefix="/api/account", tags=["account"])


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field("", max_length=16)


@router.put("/profile")
async def update_profile(body: ProfileIn, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": body.model_dump()})
    return public_user({**user, **body.model_dump()})


class AddrIn(AddressIn):
    is_default: bool = False


@router.post("/addresses")
async def add_address(body: AddrIn, user=Depends(get_current_user)):
    addrs = user.get("addresses", [])
    if len(addrs) >= 10:
        raise HTTPException(400, "You can save up to 10 addresses.")
    a = {"id": new_id(), **body.model_dump()}
    if a["is_default"] or not addrs:
        a["is_default"] = True
        addrs = [{**x, "is_default": False} for x in addrs]
    addrs.append(a)
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addrs}})
    return addrs


@router.put("/addresses/{aid}")
async def edit_address(aid: str, body: AddrIn, user=Depends(get_current_user)):
    addrs = user.get("addresses", [])
    if not any(a["id"] == aid for a in addrs):
        raise HTTPException(404, "Address not found")
    addrs = [({"id": aid, **body.model_dump()} if a["id"] == aid else ({**a, "is_default": False} if body.is_default else a)) for a in addrs]
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addrs}})
    return addrs


@router.delete("/addresses/{aid}")
async def delete_address(aid: str, user=Depends(get_current_user)):
    addrs = [a for a in user.get("addresses", []) if a["id"] != aid]
    if addrs and not any(a.get("is_default") for a in addrs):
        addrs[0]["is_default"] = True
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": addrs}})
    return addrs


@router.get("/orders")
async def my_orders(user=Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [public_order(o) for o in orders]


@router.get("/orders/{number}")
async def my_order(number: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"order_number": number[:20], "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    return {**public_order(o), "access_token": o["access_token"]}


@router.get("/wishlist")
async def get_wishlist(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wishlist": 1})
    return u.get("wishlist", [])


class WishIn(BaseModel):
    ids: List[str] = Field(max_length=100)


@router.put("/wishlist")
async def set_wishlist(body: WishIn, user=Depends(get_current_user)):
    ids = list(dict.fromkeys(i[:64] for i in body.ids))[:100]
    await db.users.update_one({"id": user["id"]}, {"$set": {"wishlist": ids}})
    return ids
