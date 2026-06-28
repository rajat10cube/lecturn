"""Admin user management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import hash_password, require_admin
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


class UserIn(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class PasswordReset(BaseModel):
    password: str


def _json(u: User) -> dict:
    return {"id": u.id, "username": u.username, "isAdmin": u.is_admin}


@router.get("")
def list_users(db: Session = Depends(get_db)) -> list[dict]:
    return [_json(u) for u in db.scalars(select(User).order_by(User.id)).all()]


@router.post("", status_code=201)
def create_user(body: UserIn, db: Session = Depends(get_db)) -> dict:
    username = body.username.strip()
    if not username or len(body.password) < 4:
        raise HTTPException(400, "Username required and password must be at least 4 characters")
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, "Username already exists")
    user = User(username=username, password_hash=hash_password(body.password), is_admin=body.is_admin)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _json(user)


@router.post("/{user_id}/password")
def reset_password(user_id: int, body: PasswordReset, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if len(body.password) < 4:
        raise HTTPException(400, "Password is too short")
    user.password_hash = hash_password(body.password)
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You can't delete your own account")
    if user.is_admin:
        admins = db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
        if admins <= 1:
            raise HTTPException(400, "Can't delete the last admin")
    db.delete(user)
    db.commit()
