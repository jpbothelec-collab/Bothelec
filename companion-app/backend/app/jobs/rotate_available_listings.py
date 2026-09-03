"""
Availability rotation job.

"Available now" profiles sort to the top of search, most-recently-bumped
first. To keep that fair, this job re-bumps the single least-recently-bumped
available+published profile on each run, so the top slot rotates through all
available listers over time (with an N-minute interval and N available
listers, each takes a turn at the top).

Runs on a schedule (see app/scheduler.py, every AVAILABILITY_ROTATE_MINUTES).

    python -m app.jobs.rotate_available_listings
"""
import asyncio

from app.db.session import AsyncSessionLocal
from app.repositories import companion_profiles as profiles_repo


async def rotate_available_listings() -> int:
    async with AsyncSessionLocal() as db:
        return await profiles_repo.rotate_oldest_available(db)


if __name__ == "__main__":
    n = asyncio.run(rotate_available_listings())
    print(f"Rotated {n} available listing(s) to the top.")
