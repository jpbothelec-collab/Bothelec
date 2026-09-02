"""
Identity verification routes.

Flow:
1. User uploads an ID document (POST /verification/documents) -> stored
   encrypted, status = 'pending_review'. No age claim is trusted yet.
2. Admin reviews it (POST /verification/documents/{id}/review) and either:
   - approves with an extracted_dob -> enforce_minimum_age() runs here.
     If the applicant is under 21, verification is REJECTED automatically
     regardless of what the admin clicked, and the reason is recorded.
   - rejects with a reason (bad doc, mismatch, etc.)
3. Only once verification_status='verified' can a companion profile be
   published or a client place a booking (enforced in those routers too —
   this is defense in depth, not the only check).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user, require_admin_permission
from app.services.admin_access import AdminPermission
from app.models.schemas import (
    IdConsentNoticeResponse,
    IdentityDocumentSubmitResponse,
    IdentityDocumentType,
    IdentityReviewDecision,
    IdentityReviewResult,
    VerificationStatus,
)
from app.repositories import identity_documents as docs_repo
from app.repositories import users as users_repo
from app.services import id_consent, storage
from app.services.age_verification import AgeVerificationError, enforce_minimum_age

router = APIRouter(prefix="/verification", tags=["verification"])


@router.get("/id-consent-notice", response_model=IdConsentNoticeResponse)
async def id_consent_notice():
    """
    The current POPIA ID-processing consent notice and its version.

    The document-upload UI reads this to show the user exactly what they are
    consenting to before they submit an ID document. Submission itself must
    then set consent_to_id_processing=true (see POST /verification/documents).
    """
    return IdConsentNoticeResponse(
        version=id_consent.current_version(),
        notice=id_consent.CONSENT_NOTICE,
    )


@router.post("/documents", response_model=IdentityDocumentSubmitResponse,
             status_code=status.HTTP_201_CREATED)
async def submit_identity_document(
    document_type: IdentityDocumentType,
    file: UploadFile,
    # POPIA special-PI consent — required, and separate from ToS/Privacy
    # acceptance. The client must show the notice from GET
    # /verification/id-consent-notice and pass true here. Enforced server-side.
    consent_to_id_processing: bool,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.verification_status == VerificationStatus.verified:
        raise HTTPException(status_code=400, detail="This account is already verified.")

    # Gate BEFORE any storage/processing of the document — no consent, no upload.
    try:
        consent_version = id_consent.require_consent(consent_to_id_processing)
    except id_consent.ConsentNotProvidedError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Store encrypted in S3-compatible storage; never keep raw ID scans in the DB.
    storage_path = await storage.store_encrypted(
        file, prefix=f"identity-docs/{current_user.id}"
    )

    doc = await docs_repo.create(
        db,
        user_id=current_user.id,
        document_type=document_type,
        storage_path=storage_path,
        consent_version=consent_version,
    )
    await users_repo.set_verification_status(db, current_user.id, VerificationStatus.pending_review)

    return IdentityDocumentSubmitResponse(id=doc.id, review_status=doc.review_status,
                                           consent_version=doc.consent_version)


@router.post("/documents/{document_id}/review", response_model=IdentityReviewResult)
async def review_identity_document(
    document_id: UUID,
    decision: IdentityReviewDecision,
    admin=Depends(require_admin_permission(AdminPermission.REVIEW_VERIFICATION)),
    db: AsyncSession = Depends(get_db),
):
    doc = await docs_repo.get(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    if decision.approve:
        if decision.extracted_dob is None:
            raise HTTPException(
                status_code=422, detail="extracted_dob is required to approve a document."
            )

        try:
            enforce_minimum_age(decision.extracted_dob)
        except AgeVerificationError as e:
            # Hard stop: even an admin approval can't override the age floor.
            # The document is rejected and the account stays unverified.
            await docs_repo.mark_reviewed(
                db, document_id, admin_id=admin.id, approved=False,
                extracted_dob=decision.extracted_dob,
                rejection_reason=f"Applicant age {e.computed_age} is below platform minimum "
                                  f"of {e.minimum_age}.",
            )
            await users_repo.set_verification_status(
                db, doc.user_id, VerificationStatus.rejected
            )
            return IdentityReviewResult(
                user_id=doc.user_id,
                verification_status=VerificationStatus.rejected,
                reviewed_at=doc.reviewed_at,
                detail=str(e),
            )

        await docs_repo.mark_reviewed(
            db, document_id, admin_id=admin.id, approved=True,
            extracted_dob=decision.extracted_dob,
            extracted_full_name=decision.extracted_full_name,
        )
        await users_repo.set_verified(
            db, doc.user_id, date_of_birth=decision.extracted_dob
        )
        return IdentityReviewResult(
            user_id=doc.user_id,
            verification_status=VerificationStatus.verified,
            reviewed_at=doc.reviewed_at,
            detail="Identity verified.",
        )

    # Explicit rejection path (bad document, name mismatch, suspected fraud, etc.)
    if not decision.rejection_reason:
        raise HTTPException(
            status_code=422, detail="rejection_reason is required when approve=False."
        )
    await docs_repo.mark_reviewed(
        db, document_id, admin_id=admin.id, approved=False,
        rejection_reason=decision.rejection_reason,
    )
    await users_repo.set_verification_status(db, doc.user_id, VerificationStatus.rejected)
    return IdentityReviewResult(
        user_id=doc.user_id,
        verification_status=VerificationStatus.rejected,
        reviewed_at=doc.reviewed_at,
        detail=decision.rejection_reason,
    )
