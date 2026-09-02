from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import IdentityDocument  # SQLAlchemy model, see app/models/orm.py


async def get(db: AsyncSession, document_id: UUID) -> IdentityDocument | None:
    result = await db.execute(select(IdentityDocument).where(IdentityDocument.id == document_id))
    return result.scalar_one_or_none()


async def list_pending(db: AsyncSession) -> list[IdentityDocument]:
    """Admin verification queue: documents awaiting review, oldest first (FIFO)."""
    result = await db.execute(
        select(IdentityDocument)
        .where(IdentityDocument.review_status == "pending_review")
        .order_by(IdentityDocument.created_at.asc())
    )
    return list(result.scalars().all())


async def create(
    db: AsyncSession, *, user_id: UUID, document_type, storage_path: str
) -> IdentityDocument:
    doc = IdentityDocument(
        user_id=user_id,
        document_type=document_type.value,
        storage_path=storage_path,
        review_status="pending_review",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def mark_reviewed(
    db: AsyncSession,
    document_id: UUID,
    *,
    admin_id: UUID,
    approved: bool,
    extracted_dob: date | None = None,
    extracted_full_name: str | None = None,
    rejection_reason: str | None = None,
) -> None:
    doc = await get(db, document_id)
    doc.review_status = "verified" if approved else "rejected"
    doc.reviewed_by = admin_id
    doc.reviewed_at = datetime.now(timezone.utc)
    if extracted_dob:
        doc.extracted_dob = extracted_dob
    if extracted_full_name:
        doc.extracted_full_name = extracted_full_name
    if rejection_reason:
        doc.rejection_reason = rejection_reason
    await db.commit()
