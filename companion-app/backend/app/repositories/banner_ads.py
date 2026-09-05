from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import BannerAd


async def list_active(db: AsyncSession, placement: str) -> list[BannerAd]:
    result = await db.execute(
        select(BannerAd)
        .where(BannerAd.placement == placement, BannerAd.is_active.is_(True))
        .order_by(BannerAd.sort_order, BannerAd.created_at)
    )
    return list(result.scalars().all())


async def list_all(db: AsyncSession) -> list[BannerAd]:
    result = await db.execute(
        select(BannerAd).order_by(BannerAd.placement, BannerAd.sort_order, BannerAd.created_at)
    )
    return list(result.scalars().all())


async def get(db: AsyncSession, ad_id: UUID) -> BannerAd | None:
    result = await db.execute(select(BannerAd).where(BannerAd.id == ad_id))
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession, *, title: str, image_path: str, link_url: str | None,
    placement: str, sort_order: int,
) -> BannerAd:
    ad = BannerAd(
        title=title, image_path=image_path, link_url=link_url,
        placement=placement, sort_order=sort_order, is_active=True,
    )
    db.add(ad)
    await db.commit()
    await db.refresh(ad)
    return ad


async def set_active(db: AsyncSession, ad: BannerAd, *, is_active: bool) -> None:
    ad.is_active = is_active
    await db.commit()


async def delete(db: AsyncSession, ad: BannerAd) -> None:
    await db.delete(ad)
    await db.commit()
