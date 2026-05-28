FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir setuptools

# Shared utilities (Redis, Keycloak, FastAPI helpers)
COPY shared /shared
RUN pip install --no-cache-dir -e /shared

COPY toolhub/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY toolhub/backend/ ./

RUN mkdir -p /data && \
    useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8500

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8500/health >/dev/null 2>&1 || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8500"]
