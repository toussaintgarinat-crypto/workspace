FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Build context = repo root (cf. mempalace/docker-compose.yml).
# ── Shared utilities (Redis, Keycloak, FastAPI helpers) ──────────────
COPY shared /shared
RUN pip install --no-cache-dir -e /shared

COPY mempalace/requirements.txt .
RUN pip install --no-cache-dir setuptools && pip install --no-cache-dir -r requirements.txt

COPY mempalace/ ./
RUN pip install -e . --no-deps --no-build-isolation

EXPOSE 8100
CMD ["uvicorn", "mempalace.api:app", "--host", "0.0.0.0", "--port", "8100"]
