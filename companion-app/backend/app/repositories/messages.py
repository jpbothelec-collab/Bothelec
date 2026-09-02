from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Message


async def create(
    db: AsyncSession, *, conversation_id: UUID, sender_id: UUID, body: str, flagged_reason: str | None
) -> Message:
    message = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        body=body,
        flagged_reason=flagged_reason,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def list_for_conversation(db: AsyncSession, conversation_id: UUID) -> list[Message]:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, message_id: UUID) -> Message | None:
    result = await db.execute(select(Message).where(Message.id == message_id))
    return result.scalar_one_or_none()


async def list_unreviewed_flagged(db: AsyncSession) -> list[Message]:
    result = await db.execute(
        select(Message)
        .where(Message.flagged_reason.is_not(None), Message.reviewed_at.is_(None))
        .order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def mark_reviewed(
    db: AsyncSession, message: Message, *, admin_id: UUID, outcome: str
) -> None:
    message.reviewed_at = datetime.now(timezone.utc)
    message.reviewed_by = admin_id
    message.review_outcome = outcome
    await db.commit()
