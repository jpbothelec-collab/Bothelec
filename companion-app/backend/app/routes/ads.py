"""
Banner advertising.

- /ads          : public — active banners for a placement (client-facing).
- /admin/ads/*  : admin management (MANAGE_BILLING) — create/list/toggle/delete.

Banner images are stored via the same encrypted storage as other assets and
served as short-lived signed URLs. Self-serve advertiser accounts are a
future phase; for now admins upload and manage the banners.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import require_admin_permission
from app.models.schemas import BannerAdResponse
from app.repositories import banner_ads as ads_repo
from app.services import storage
from app.services.admin_access import AdminPermission

router = APIRouter(prefix="/ads", tags=["ads"])
admin_router = APIRouter(prefix="/admin/ads", tags=["ads"])


async def _signed(path: str | None) -> str | None:
    if not path:
        return None
    try:
        return await storage.get_signed_url(path, expires_in=settings.PORTFOLIO_URL_TTL_SECONDS)
    except Exception:
        return None


async def _to_response(ad) -> BannerAdResponse:
    return BannerAdResponse(
        id=ad.id, title=ad.title, image_url=await _signed(ad.image_path),
        link_url=ad.link_url, placement=ad.placement, is_active=ad.is_active,
        sort_order=ad.sort_order,
    )


@router.get("", response_model=list[BannerAdResponse])
async def list_ads(
    placement: str = Query(default="browse"),
    db: AsyncSession = Depends(get_db),
):
    """Active banners for a placement (public)."""
    ads = await ads_repo.list_active(db, placement)
    return [await _to_response(a) for a in ads]


@admin_router.get("", response_model=list[BannerAdResponse])
async def admin_list_ads(
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    return [await _to_response(a) for a in await ads_repo.list_all(db)]


@admin_router.post("", response_model=BannerAdResponse, status_code=201)
async def admin_create_ad(
    file: UploadFile,
    title: str = Form(...),
    link_url: str = Form(default=""),
    placement: str = Form(default="browse"),
    sort_order: int = Form(default=0),
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    try:
        key = await storage.store_encrypted(file, prefix="banner-ads")
    except storage.UnsupportedFileType as e:
        raise HTTPException(status_code=415, detail=str(e))
    except storage.FileTooLarge as e:
        raise HTTPException(status_code=413, detail=str(e))
    ad = await ads_repo.create(
        db, title=title, image_path=key, link_url=link_url.strip() or None,
        placement=placement.strip() or "browse", sort_order=sort_order,
    )
    return await _to_response(ad)


@admin_router.post("/{ad_id}/toggle", response_model=BannerAdResponse)
async def admin_toggle_ad(
    ad_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    ad = await ads_repo.get(db, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found.")
    await ads_repo.set_active(db, ad, is_active=not ad.is_active)
    return await _to_response(ad)


@admin_router.delete("/{ad_id}", status_code=204)
async def admin_delete_ad(
    ad_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    ad = await ads_repo.get(db, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found.")
    try:
        await storage.delete_object(ad.image_path)
    except Exception:
        pass
    await ads_repo.delete(db, ad)
