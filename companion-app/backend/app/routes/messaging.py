"""
Conversation & messaging routes.

Every outgoing message passes through content_moderation.scan_message()
before being stored. A flagged message is still delivered normally (see
services/content_moderation.py's docstring for why this is a detection
signal rather than a hard block) but is queued for admin review via
GET /messages/flagged. Confirmed violations can trigger account
suspension — see review_flagged_message.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_role
from app.models.schemas import (
    ConversationCreate,
    ConversationResponse,
    FlaggedMessageResponse,
    MessageCreate,
    MessageResponse,
    MessageReviewDecision,
    UserRole,
    VerificationStatus,
)
from app.repositories import companion_profiles as profiles_repo
from app.repositories import conversations as conversations_repo
from app.repositories import messages as messages_repo
from app.repositories import users as users_repo
from app.services.content_moderation import scan_message

router = APIRouter(tags=["messaging"])


def _conversation_response(c) -> ConversationResponse:
    return ConversationResponse(
        id=c.id, booking_id=c.booking_id, client_id=c.client_id,
        companion_id=c.companion_id, created_at=c.created_at,
    )


def _message_response(m) -> MessageResponse:
    return MessageResponse(
        id=m.id, conversation_id=m.conversation_id, sender_id=m.sender_id,
        body=m.body, created_at=m.created_at,
    )


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def start_conversation(
    payload: ConversationCreate,
    current_user=Depends(require_role(UserRole.client)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_id(db, payload.profile_id)
    if not profile or not profile.is_published:
        raise HTTPException(status_code=404, detail="Profile not found or not currently published.")

    conversation = await conversations_repo.get_or_create(
        db, client_id=current_user.id, companion_id=profile.user_id, booking_id=payload.booking_id
    )
    return _conversation_response(conversation)


@router.get("/conversations/me", response_model=list[ConversationResponse])
async def list_my_conversations(
    current_user=Depends(require_role(UserRole.client, UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    conversations = await conversations_repo.list_for_user(db, current_user.id)
    return [_conversation_response(c) for c in conversations]


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: UUID,
    payload: MessageCreate,
    current_user=Depends(require_role(UserRole.client, UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    conversation = await conversations_repo.get_by_id(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    is_participant = conversations_repo.is_participant(conversation, current_user.id)
    is_managing_agent = False
    if not is_participant and current_user.role == UserRole.agent.value:
        profile = await profiles_repo.get_by_user_id(db, conversation.companion_id)
        is_managing_agent = profile is not None and profile.agent_id == current_user.id

    if not is_participant and not is_managing_agent:
        raise HTTPException(status_code=403, detail="You are not a participant in this conversation.")

    flagged_reason = scan_message(payload.body)
    message = await messages_repo.create(
        db,
        conversation_id=conversation.id,
        sender_id=current_user.id,
        body=payload.body,
        flagged_reason=flagged_reason,
    )
    return _message_response(message)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    conversation_id: UUID,
    current_user=Depends(require_role(UserRole.client, UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    conversation = await conversations_repo.get_by_id(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if not conversations_repo.is_participant(conversation, current_user.id):
        raise HTTPException(status_code=403, detail="You are not a participant in this conversation.")

    messages = await messages_repo.list_for_conversation(db, conversation_id)
    return [_message_response(m) for m in messages]


@router.get("/messages/flagged", response_model=list[FlaggedMessageResponse])
async def list_flagged_messages(
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Admin review queue: messages the content filter flagged that haven't been reviewed yet."""
    messages = await messages_repo.list_unreviewed_flagged(db)
    return [
        FlaggedMessageResponse(
            id=m.id, conversation_id=m.conversation_id, sender_id=m.sender_id,
            body=m.body, flagged_reason=m.flagged_reason,
            reviewed_at=m.reviewed_at, review_outcome=m.review_outcome,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.post("/messages/{message_id}/review")
async def review_flagged_message(
    message_id: UUID,
    decision: MessageReviewDecision,
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin resolves a flagged message as either a false positive
    ('dismissed') or a real ToS violation ('confirmed_violation'). On a
    confirmed violation, the admin can optionally suspend the sender's
    account (verification_status='suspended'), which immediately blocks
    them from publishing, booking, or messaging — anything gated by
    require_verified/verification_status == 'verified'.
    """
    message = await messages_repo.get_by_id(db, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found.")

    await messages_repo.mark_reviewed(db, message, admin_id=admin.id, outcome=decision.outcome)

    if decision.outcome == "confirmed_violation" and decision.suspend_sender:
        await users_repo.set_verification_status(db, message.sender_id, VerificationStatus.suspended)

    return {"id": message.id, "review_outcome": decision.outcome}
