"""
Agency routes.

An 'agent' account is an agency. It has a name, a shareable join code, and
branded assets (a background image and a price-list document). Companions
link their profile to the agency by entering the join code (see
routes/profiles.py:join_agency); the agency can then manage those profiles.

- /agency/*   : the agency's own management endpoints (agent auth).
- /agencies/* : the public, client-facing agency page.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_optional_user, require_role
from app.models.schemas import AgencyResponse, AgencyUpdate, PublicAgencyResponse, UserRole
from app.repositories import companion_profiles as profiles_repo
from app.repositories import users as users_repo
from app.routes.profiles import _owner_response, _public_response
from app.services import storage

router = APIRouter(prefix="/agency", tags=["agency"])
public_router = APIRouter(prefix="/agencies", tags=["agency"])

# Unambiguous alphabet (no 0/O/1/I) so codes are easy to read out and type.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


async def _ensure_code(db: AsyncSession, agent) -> str:
    if agent.agency_code:
        return agent.agency_code
    for _ in range(10):
        code = "AG-" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if not await users_repo.get_by_agency_code(db, code):
            await users_repo.set_agency(db, agent, code=code)
            return code
    raise HTTPException(status_code=500, detail="Could not allocate an agency code. Try again.")


async def _signed(path: str | None) -> str | None:
    if not path:
        return None
    try:
        return await storage.get_signed_url(path, expires_in=settings.PORTFOLIO_URL_TTL_SECONDS)
    except Exception:
        return None


async def _agency_response(db: AsyncSession, agent) -> AgencyResponse:
    code = await _ensure_code(db, agent)
    roster = await profiles_repo.list_managed_by_agent(db, agent.id)
    items = [await _owner_response(db, p) for p in roster]
    return AgencyResponse(
        agency_name=agent.agency_name,
        agency_code=code,
        background_url=await _signed(agent.agency_background_path),
        price_list_url=await _signed(agent.agency_price_list_path),
        roster=items,
    )


@router.get("/me", response_model=AgencyResponse)
async def get_my_agency(
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """The agency's name, share code, branded assets, and roster of linked profiles."""
    return await _agency_response(db, current_user)


@router.patch("/me", response_model=AgencyResponse)
async def update_my_agency(
    payload: AgencyUpdate,
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    await users_repo.set_agency(db, current_user, name=payload.agency_name)
    return await _agency_response(db, current_user)


async def _upload_asset(db, agent, file: UploadFile, *, previous: str | None) -> str:
    try:
        key = await storage.store_encrypted(file, prefix=f"agency-assets/{agent.id}")
    except storage.UnsupportedFileType as e:
        raise HTTPException(status_code=415, detail=str(e))
    except storage.FileTooLarge as e:
        raise HTTPException(status_code=413, detail=str(e))
    # Best-effort cleanup of the replaced object.
    if previous:
        try:
            await storage.delete_object(previous)
        except Exception:
            pass
    return key


@router.post("/me/background", response_model=AgencyResponse)
async def upload_background(
    file: UploadFile,
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """Upload the agency's page background image (jpg/png/webp)."""
    key = await _upload_asset(db, current_user, file, previous=current_user.agency_background_path)
    await users_repo.set_agency(db, current_user, background_path=key)
    return await _agency_response(db, current_user)


@router.delete("/me/background", response_model=AgencyResponse)
async def delete_background(
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    if current_user.agency_background_path:
        try:
            await storage.delete_object(current_user.agency_background_path)
        except Exception:
            pass
    await users_repo.set_agency(db, current_user, background_path=None)
    return await _agency_response(db, current_user)


@router.post("/me/price-list", response_model=AgencyResponse)
async def upload_price_list(
    file: UploadFile,
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """Upload the agency's price list (pdf or image)."""
    key = await _upload_asset(db, current_user, file, previous=current_user.agency_price_list_path)
    await users_repo.set_agency(db, current_user, price_list_path=key)
    return await _agency_response(db, current_user)


@router.delete("/me/price-list", response_model=AgencyResponse)
async def delete_price_list(
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    if current_user.agency_price_list_path:
        try:
            await storage.delete_object(current_user.agency_price_list_path)
        except Exception:
            pass
    await users_repo.set_agency(db, current_user, price_list_path=None)
    return await _agency_response(db, current_user)


@public_router.get("/{agent_id}", response_model=PublicAgencyResponse)
async def get_public_agency(
    agent_id: UUID,
    viewer=Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Public agency page: branding + roster of the agency's published profiles."""
    agent = await users_repo.get_by_id(db, agent_id)
    if not agent or agent.role != UserRole.agent.value:
        raise HTTPException(status_code=404, detail="Agency not found.")
    managed = await profiles_repo.list_managed_by_agent(db, agent.id)
    published = [p for p in managed if p.is_published]
    roster = [await _public_response(db, p, viewer) for p in published]
    return PublicAgencyResponse(
        id=agent.id,
        agency_name=agent.agency_name,
        background_url=await _signed(agent.agency_background_path),
        price_list_url=await _signed(agent.agency_price_list_path),
        roster=roster,
    )
