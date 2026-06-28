"""Auth guard: accepts a session cookie (set by the login page) OR HTTP Basic
(for API/CLI). Returns 401 *without* a WWW-Authenticate header so browsers don't
show the native Basic-auth popup — the SPA renders its own login page instead.
"""

from __future__ import annotations

import base64
import binascii
import secrets

from fastapi import HTTPException, Request, status

from .config import get_settings


def check_credentials(username: str, password: str) -> bool:
    s = get_settings()
    return secrets.compare_digest(username, s.auth_user) and secrets.compare_digest(
        password, s.auth_pass
    )


def _check_basic(header: str | None) -> bool:
    if not header or not header.lower().startswith("basic "):
        return False
    try:
        decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False
    user, _, password = decoded.partition(":")
    return check_credentials(user, password)


def require_auth(request: Request) -> None:
    s = get_settings()
    if s.auth == "none":
        return
    if request.session.get("user"):
        return
    if _check_basic(request.headers.get("Authorization")):
        return
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
