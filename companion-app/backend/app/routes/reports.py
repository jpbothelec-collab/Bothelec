"""
User reporting routes.

Lets any authenticated user flag another user for admin review — distinct
from the automated message content filter (Phase 5), since this catches
things text-pattern matching can't: in-person conduct, off-platform
behavior, safety concerns, patterns across multiple conversations, etc.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user, require_admin_permission
from app.services.admin_access import AdminPermission
from app.models.schemas import ReportCreate, ReportResolution, ReportResponse, VerificationStatus
from app.repositories import audit_log as audit_repo
from app.repositories import reports as reports_repo
from app.repositories import users as users_repo

router = APIRouter(prefix="/reports", tags=["reports"])


def _to_response(report) -> ReportResponse:
    return ReportResponse(
        id=report.id, reporter_id=report.reporter_id, reported_user_id=report.reported_user_id,
        reason=report.reason, details=report.details, related_booking_id=report.related_booking_id,
        status=report.status, resolution_note=report.resolution_note, created_at=report.created_at,
    )


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.reported_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot report yourself.")

    report = await reports_repo.create(
        db,
        reporter_id=current_user.id,
        reported_user_id=payload.reported_user_id,
        reason=payload.reason.value,
        details=payload.details,
        related_booking_id=payload.related_booking_id,
    )
    return _to_response(report)


@router.get("", response_model=list[ReportResponse])
async def list_pending_reports(
    admin=Depends(require_admin_permission(AdminPermission.MODERATE_CONTENT)),
    db: AsyncSession = Depends(get_db),
):
    reports = await reports_repo.list_pending(db)
    return [_to_response(r) for r in reports]


@router.post("/{report_id}/resolve", response_model=ReportResponse)
async def resolve_report(
    report_id: UUID,
    decision: ReportResolution,
    admin=Depends(require_admin_permission(AdminPermission.MODERATE_CONTENT)),
    db: AsyncSession = Depends(get_db),
):
    report = await reports_repo.get_by_id(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    report = await reports_repo.resolve(
        db, report, admin_id=admin.id, status=decision.status,
        resolution_note=decision.resolution_note,
    )

    await audit_repo.write(
        db, actor_id=admin.id, action=f"report_{decision.status}",
        target_type="user_report", target_id=report.id,
        metadata={"reported_user_id": str(report.reported_user_id)},
    )

    if decision.status == "resolved" and decision.suspend_reported_user:
        await users_repo.set_verification_status(
            db, report.reported_user_id, VerificationStatus.suspended
        )
        await audit_repo.write(
            db, actor_id=admin.id, action="user_suspended",
            target_type="user", target_id=report.reported_user_id,
            metadata={"reason": "report_resolution", "report_id": str(report.id)},
        )

    return _to_response(report)
