from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import scheduler
from app.routes import admin, auth, billing, bookings, messaging, profiles, reports, reviews, verification


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the maintenance-job scheduler (retention purge + lapsed-listing
    # unpublish) on the app's event loop. Controlled by SCHEDULER_ENABLED.
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(title="Companion Platform API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(verification.router)
app.include_router(profiles.router)
app.include_router(billing.router)
app.include_router(bookings.router)
app.include_router(messaging.router)
app.include_router(reviews.router)
app.include_router(reports.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
