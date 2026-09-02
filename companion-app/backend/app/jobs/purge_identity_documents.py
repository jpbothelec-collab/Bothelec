"""
Retention purge job for identity documents.

POPIA requires data minimization for special personal information like ID
numbers. This job deletes the underlying stored file (and clears sensitive
fields on the DB row) N days after a review decision was made — configured
via settings.ID_DOCUMENT_RETENTION_DAYS.

Run this on a schedule (cron, or an async task scheduler like APScheduler /
Celery beat) — e.g. daily at 02:00.

    python -m app.jobs.purge_identity_documents
"""
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.orm import IdentityDocument
from app.services.storage import delete_object


async def purge_expired_documents() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.ID_DOCUMENT_RETENTION_DAYS)
    purged_count = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(IdentityDocument).where(
                IdentityDocument.reviewed_at.is_not(None),
                IdentityDocument.reviewed_at < cutoff,
                IdentityDocument.storage_path.is_not(None),
            )
        )
        documents = result.scalars().all()

        for doc in documents:
            await delete_object(doc.storage_path)
            # Clear the sensitive pointers/fields rather than deleting the
            # row outright — keep the audit trail (who reviewed, when,
            # what the decision was) without retaining the document itself.
            doc.storage_path = None
            doc.extracted_full_name = None
            purged_count += 1

        await db.commit()

    return purged_count


if __name__ == "__main__":
    count = asyncio.run(purge_expired_documents())
    print(f"Purged {count} expired identity document(s).")
