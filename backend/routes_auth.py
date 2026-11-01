import hashlib
import os
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument

from core import (db, now, now_iso, new_id, hash_password, verify_password, create_access_token, create_refresh_token,
                  set_auth_cookies, decode_token, public_user, get_current_user, rate_limit, client_ip)
import emails

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=128)


async def _issue(response: Response, user):
    session_id = new_id()
    token_id = secrets.token_urlsafe(32)
    expires_at = now() + timedelta(days=7)
    await db.auth_sessions.insert_one({
        "id": session_id,
        "user_id": user["id"],
        "refresh_jti": token_id,
        "expires_at": expires_at,
    })
    set_auth_cookies(
        response,
        create_access_token(user["id"], user["email"], user.get("role", "customer"), session_id),
        create_refresh_token(user["id"], session_id, token_id),
    )


@router.post("/register", dependencies=[Depends(rate_limit("register", 10, 3600))])
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists.")
    user = {"id": new_id(), "email": email, "name": body.name.strip(), "password_hash": hash_password(body.password),
            "role": "customer", "addresses": [], "wishlist": [], "created_at": now_iso()}
    await db.users.insert_one(user)
    await _issue(response, user)
    return public_user(user)


@router.post("/login", dependencies=[Depends(rate_limit("login", 20, 300))])
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident = f"{client_ip(request)}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until") and att["locked_until"] > now().isoformat():
        raise HTTPException(429, "Too many failed attempts. Please try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        cnt = (att or {}).get("count", 0) + 1
        upd = {"count": cnt, "identifier": ident}
        if cnt >= 5:
            upd["locked_until"] = (now() + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "Invalid email or password.")
    await db.login_attempts.delete_one({"identifier": ident})
    await _issue(response, user)
    return public_user(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    revoked = set()
    for cookie_name, token_type in (("access_token", "access"), ("refresh_token", "refresh")):
        token = request.cookies.get(cookie_name)
        if not token:
            continue
        try:
            payload = decode_token(token, token_type)
        except HTTPException:
            continue
        session_id = payload.get("sid")
        user_id = payload.get("sub")
        if session_id and user_id and session_id not in revoked:
            await db.auth_sessions.delete_one({"id": session_id, "user_id": user_id})
            revoked.add(session_id)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No session")
    payload = decode_token(token, "refresh")
    session_id = payload.get("sid")
    token_id = payload.get("jti")
    if not session_id or not token_id:
        raise HTTPException(401, "Invalid session")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or user.get("disabled"):
        raise HTTPException(401, "User not found")
    next_token_id = secrets.token_urlsafe(32)
    expires_at = now() + timedelta(days=7)
    session = await db.auth_sessions.find_one_and_update(
        {
            "id": session_id,
            "user_id": payload["sub"],
            "refresh_jti": token_id,
            "expires_at": {"$gt": now()},
        },
        {"$set": {"refresh_jti": next_token_id, "expires_at": expires_at}},
        return_document=ReturnDocument.AFTER,
    )
    if not session:
        raise HTTPException(401, "Session expired")
    set_auth_cookies(
        response,
        create_access_token(user["id"], user["email"], user.get("role", "customer"), session_id),
        create_refresh_token(user["id"], session_id, next_token_id),
    )
    return public_user(user)


@router.post("/forgot-password", dependencies=[Depends(rate_limit("forgot", 5, 900))])
async def forgot(body: ForgotIn, request: Request):
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({"token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user["id"],
                                                   "expires_at": now() + timedelta(hours=1), "used": False})
        link = f"{os.environ['FRONTEND_URL'].rstrip('/')}/reset-password?token={token}"
        emails.fire(emails.send_password_reset(user["email"], user.get("name", ""), link))
    return {"ok": True, "message": "If an account exists for this email, a reset link has been sent."}


@router.post("/reset-password", dependencies=[Depends(rate_limit("reset", 10, 900))])
async def reset(body: ResetIn):
    th = hashlib.sha256(body.token.encode()).hexdigest()
    rec = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": th, "used": False, "expires_at": {"$gt": now()}},
        {"$set": {"used": True}},
        return_document=ReturnDocument.AFTER,
    )
    if not rec:
        raise HTTPException(400, "This reset link is invalid or has expired.")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.auth_sessions.delete_many({"user_id": rec["user_id"]})
    return {"ok": True}
