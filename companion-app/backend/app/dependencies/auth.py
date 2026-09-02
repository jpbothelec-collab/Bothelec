from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.schemas import UserRole
from app.repositories import users as users_repo

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
_optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
):
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user = await users_repo.get_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or inactive account.")
    return user


async def get_optional_user(
    token: str | None = Depends(_optional_oauth2_scheme), db: AsyncSession = Depends(get_db)
):
    """
    Like get_current_user, but returns None instead of raising when no
    token is present or the token is invalid. Used by public endpoints
    (e.g. viewing a companion profile) that behave differently for
    anonymous vs. authenticated viewers without requiring login.
    """
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except JWTError:
        return None

    user = await users_repo.get_by_id(db, user_id)
    if not user or not user.is_active:
        return None
    return user


def require_role(*allowed_roles: UserRole):
    async def checker(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {[r.value for r in allowed_roles]}",
            )
        return current_user

    return checker


def require_verified(current_user=Depends(get_current_user)):
    """Guard for actions that require a completed, passed identity/age check
    (publishing a profile, placing a booking, etc.)."""
    if current_user.verification_status != "verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Identity verification (21+) must be completed before this action.",
        )
    return current_user
