"""
Forge — ML Module
FastAPI service exposant les fonctionnalités ML au module core TypeScript.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from embeddings import router as embeddings_router
from ingestion import router as ingestion_router

load_dotenv()

app = FastAPI(
    title="Forge ML Module",
    description="Embeddings, ingestion pipeline, fine-tuning",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(embeddings_router, prefix="/embeddings", tags=["embeddings"])
app.include_router(ingestion_router, prefix="/ingestion", tags=["ingestion"])


@app.get("/health")
def health():
    return {"status": "ok", "module": "forge:ml"}
