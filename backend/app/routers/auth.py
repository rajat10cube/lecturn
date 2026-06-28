"""Login / logout / session info (cookie-based)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from ..auth import check_credentials
from ..config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginIn, request: Request) -> dict:
    if get_settings().auth == "none":
        return {"username": "guest", "authDisabled": True}
    if not check_credentials(body.username, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    request.session["user"] = body.username
    return {"username": body.username, "authDisabled": False}


@router.post("/logout")
def logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(request: Request) -> dict:
    if get_settings().auth == "none":
        return {"username": "guest", "authDisabled": True}
    user = request.session.get("user")
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return {"username": user, "authDisabled": False}
