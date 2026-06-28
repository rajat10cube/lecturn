"""HTTP Basic auth dependency (single shared credential).

A clean seam for future per-user / forward-auth: swap this dependency without
touching the routers.
"""

from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .config import get_settings

_security = HTTPBasic(auto_error=False)


def require_auth(
    credentials: HTTPBasicCredentials | None = Depends(_security),
) -> None:
    settings = get_settings()
    if settings.auth != "basic":
        return

    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Authentication required",
        headers={"WWW-Authenticate": "Basic"},
    )
    if credentials is None:
        raise unauthorized

    ok_user = secrets.compare_digest(credentials.username, settings.auth_user)
    ok_pass = secrets.compare_digest(credentials.password, settings.auth_pass)
    if not (ok_user and ok_pass):
        raise unauthorized
