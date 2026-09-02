"""
Scheduled maintenance jobs wiring (APScheduler).

Registers the two standing maintenance jobs against an in-process
AsyncIOScheduler that shares the app's event loop:

  - purge_expired_documents        (POPIA retention) — daily at PURGE_JOB_HOUR
  - unpublish_expired_listings     (lapsed listing cleanup) — daily at UNPUBLISH_JOB_HOUR

Both job functions already exist as standalone scripts under app/jobs/ and
are idempotent, so they can still be run manually with
`python -m app.jobs.<name>`; this module just also runs them on a schedule.

Lifecycle is driven from app.main's lifespan handler: start() on startup,
shutdown() on shutdown. Controlled by settings.SCHEDULER_ENABLED — see the
config note about running the scheduler in only one process when scaling to
multiple workers.
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.jobs.purge_identity_documents import purge_expired_documents
from app.jobs.unpublish_expired_listings import unpublish_expired_listings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_purge_expired_documents() -> None:
    count = await purge_expired_documents()
    logger.info("purge_expired_documents: purged %d expired identity document(s).", count)


async def _run_unpublish_expired_listings() -> None:
    count = await unpublish_expired_listings()
    logger.info(
        "unpublish_expired_listings: auto-unpublished %d profile(s) with lapsed listings.", count
    )


def create_scheduler() -> AsyncIOScheduler:
    """Build a scheduler with both maintenance jobs registered (not yet started)."""
    scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)

    # coalesce=True: if the app was down over several fire times, run once on
    # catch-up rather than backlogging. misfire_grace_time gives a late
    # (e.g. startup-delayed) fire an hour to still run instead of being skipped.
    scheduler.add_job(
        _run_purge_expired_documents,
        trigger=CronTrigger(hour=settings.PURGE_JOB_HOUR, minute=0),
        id="purge_expired_documents",
        name="Purge expired identity documents (POPIA retention)",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )
    scheduler.add_job(
        _run_unpublish_expired_listings,
        trigger=CronTrigger(hour=settings.UNPUBLISH_JOB_HOUR, minute=0),
        id="unpublish_expired_listings",
        name="Unpublish profiles with lapsed listing subscriptions",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )
    return scheduler


def start() -> None:
    """Start the scheduler if enabled. Safe to call once at app startup."""
    global _scheduler
    if not settings.SCHEDULER_ENABLED:
        logger.info("Scheduler disabled (SCHEDULER_ENABLED=False); maintenance jobs not started.")
        return
    if _scheduler is not None and _scheduler.running:
        return
    _scheduler = create_scheduler()
    _scheduler.start()
    logger.info(
        "Scheduler started (tz=%s): purge@%02d:00, unpublish@%02d:00.",
        settings.SCHEDULER_TIMEZONE, settings.PURGE_JOB_HOUR, settings.UNPUBLISH_JOB_HOUR,
    )


def shutdown() -> None:
    """Stop the scheduler if running. Safe to call at app shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")
    _scheduler = None
