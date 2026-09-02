"""
Signup / login routes.

Signup deliberately does NOT collect or trust a self-reported birthdate.
Every new account starts in verification_status='unverified' and can't
publish a profile or place a booking until identity verification passes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.schemas import LoginRequest, SignupRequest, SignupResponse, TokenResponse
from app.repositories import users as users_repo

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await users_repo.get_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = await users_repo.create_user(
        db,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    return SignupResponse(id=user.id, email=user.email, role=user.role,
                           verification_status=user.verification_status)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await users_repo.get_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token)
