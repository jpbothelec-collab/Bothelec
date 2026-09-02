from fastapi import FastAPI

from app.routes import admin, auth, billing, bookings, messaging, profiles, reports, reviews, verification

app = FastAPI(title="Companion Platform API")

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
