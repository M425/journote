
# =========================
# file: Dockerfile
# =========================
# Production Dockerfile: single worker to keep in-memory store authoritative.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    JOURNOTE_DATA_DIR=/data

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt "gunicorn>=20,<22"

COPY app.py /app/app.py
COPY store.py /app/store.py
COPY static /app/static

EXPOSE 8000
VOLUME ["/data"]

# SQLite is the persistent store; keep one worker for the local deployment.
CMD ["gunicorn", "--workers", "1", "--bind", "0.0.0.0:8000", "app:app"]
