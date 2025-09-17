
# =========================
# file: Dockerfile
# =========================
# Production Dockerfile: single worker to keep in-memory store authoritative.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py /app/app.py
COPY static /app/static

EXPOSE 8000

# IMPORTANT: 1 worker due to in-memory store semantics (see file header).
CMD ["gunicorn", "--workers", "1", "--bind", "0.0.0.0:8000", "app:app"]
