# Amicora API (FastAPI + uvicorn)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code (see .dockerignore for what's excluded).
COPY . .

# Run as an unprivileged user.
RUN useradd --system --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Apply any pending migrations, then start the API. `alembic upgrade head`
# is idempotent, so this is safe on every start of a single-replica service.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
