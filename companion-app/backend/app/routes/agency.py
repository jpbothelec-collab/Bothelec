"""
Agency routes (agent accounts).

An 'agent' account is an agency. It has a name and a shareable join code;
companions link their profile to the agency by entering that code (see
routes/profiles.py:join_agency). The agency can then manage those profiles
(fees, publish, media) via the existing can_manage checks.
"""
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_role
from app.models.schemas import AgencyResponse, AgencyUpdate, UserRole
from app.repositories import companion_profiles as profiles_repo
from app.repositories import users as users_repo
from app.routes.profiles import _owner_response

router = APIRouter(prefix="/agency", tags=["agency"])

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


async def _agency_response(db: AsyncSession, agent) -> AgencyResponse:
    code = await _ensure_code(db, agent)
    roster = await profiles_repo.list_managed_by_agent(db, agent.id)
    items = [await _owner_response(db, p) for p in roster]
    return AgencyResponse(agency_name=agent.agency_name, agency_code=code, roster=items)


@router.get("/me", response_model=AgencyResponse)
async def get_my_agency(
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """The agency's name, share code (generated on first view), and roster of linked profiles."""
    return await _agency_response(db, current_user)


@router.patch("/me", response_model=AgencyResponse)
async def update_my_agency(
    payload: AgencyUpdate,
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    await users_repo.set_agency(db, current_user, name=payload.agency_name)
    return await _agency_response(db, current_user)
