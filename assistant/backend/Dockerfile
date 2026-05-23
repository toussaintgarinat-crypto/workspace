FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget tesseract-ocr tesseract-ocr-fra poppler-utils \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir setuptools

# ── Shared utilities (Redis, Keycloak, FastAPI helpers) ──────────────
# Build context = repo root (cf. docker-compose.yml). On installe `shared/` AVANT
# le code service pour bénéficier du cache Docker tant que les utilitaires partagés
# ne changent pas.
COPY shared /shared
RUN pip install --no-cache-dir -e /shared

ARG LOCAL_VOICE_ENABLED=false
COPY assistant/backend/requirements.txt assistant/backend/requirements-voice.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$LOCAL_VOICE_ENABLED" = "true" ]; then pip install --no-cache-dir -r requirements-voice.txt; fi

COPY assistant/backend/ ./

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8200

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8200/health >/dev/null 2>&1 || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8200"]
