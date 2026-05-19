"""
Forge — ML Module
FastAPI service exposant les fonctionnalités ML au module core TypeScript.
Service interne S2S uniquement (appelé par core via ML_MODULE_URL) — pas de CORS.
"""
from fastapi import FastAPI
from dotenv import load_dotenv

from embeddings import router as embeddings_router
from ingestion import router as ingestion_router

load_dotenv()

app = FastAPI(
    title="Forge ML Module",
    description="Embeddings, ingestion pipeline, fine-tuning",
    version="0.1.0",
)

app.include_router(embeddings_router, prefix="/embeddings", tags=["embeddings"])
app.include_router(ingestion_router, prefix="/ingestion", tags=["ingestion"])


@app.get("/health")
def health():
    return {"status": "ok", "module": "forge:ml"}
