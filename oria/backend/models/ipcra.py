from sqlalchemy import Column, String, Text, DateTime, Integer
from datetime import datetime
import uuid
from database import Base


class IPCRATrace(Base):
    """Trace d'une exécution agent sur une phase IPCRA (steps VoltAgent persistés)."""
    __tablename__ = "ipcra_traces"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False, index=True)
    phase      = Column(String, nullable=False)
    prompt     = Column(Text, default="")
    answer     = Column(Text, default="")
    steps      = Column(Text, default="[]")   # JSON list des steps VoltAgent
    agent_nom  = Column(String, default="")
    duree_ms   = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class IPCRASession(Base):
    """Session de travail structurée selon la méthodologie IPCRA."""
    __tablename__ = "ipcra_sessions"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id    = Column(String, nullable=False)
    world_id    = Column(String, nullable=True)
    agent_id    = Column(String, nullable=True)    # agent assigné à cette session
    titre       = Column(String, nullable=False)
    phase       = Column(String, default="identifier")  # identifier|planifier|creer|reflechir|ajuster
    # Contenu de chaque phase (JSON text)
    identifier_notes  = Column(Text, default="")   # contexte, objectifs, documents liés
    planifier_notes   = Column(Text, default="")   # plan, étapes, ressources
    creer_output      = Column(Text, default="")   # livrable produit
    reflechir_notes   = Column(Text, default="")   # retour critique, traces agent
    ajuster_notes     = Column(Text, default="")   # leçons apprises, ajustements MemPalace
    status      = Column(String, default="active") # active|completee|archivee
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
