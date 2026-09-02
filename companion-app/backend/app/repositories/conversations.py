from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Conversation


async def get_by_id(db: AsyncSession, conversation_id: UUID) -> Conversation | None:
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    return result.scalar_one_or_none()


async def get_existing(
    db: AsyncSession, *, client_id: UUID, companion_id: UUID, booking_id: UUID | None
) -> Conversation | None:
    result = await db.execute(
        select(Conversation).where(
            Conversation.client_id == client_id,
            Conversation.companion_id == companion_id,
            Conversation.booking_id == booking_id,
        )
    )
    return result.scalar_one_or_none()


async def get_or_create(
    db: AsyncSession, *, client_id: UUID, companion_id: UUID, booking_id: UUID | None
) -> Conversation:
    existing = await get_existing(
        db, client_id=client_id, companion_id=companion_id, booking_id=booking_id
    )
    if existing:
        return existing

    conversation = Conversation(client_id=client_id, companion_id=companion_id, booking_id=booking_id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def list_for_user(db: AsyncSession, user_id: UUID) -> list[Conversation]:
    """Conversations where the user is either the client or the companion side."""
    result = await db.execute(
        select(Conversation).where(
            (Conversation.client_id == user_id) | (Conversation.companion_id == user_id)
        ).order_by(Conversation.created_at.desc())
    )
    return list(result.scalars().all())


def is_participant(conversation: Conversation, user_id: UUID) -> bool:
    return user_id in (conversation.client_id, conversation.companion_id)
