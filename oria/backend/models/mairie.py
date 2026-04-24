from sqlalchemy import Column, String, DateTime, Text, Boolean, ForeignKey
from database import Base
from datetime import datetime
import uuid

def _uuid(): return str(uuid.uuid4())
def _now(): return datetime.utcnow()


class Deliberation(Base):
    __tablename__ = "deliberations"
    id          = Column(String, primary_key=True, default=_uuid)
    world_id    = Column(String, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    numero      = Column(String, nullable=False)
    titre       = Column(String, nullable=False)
    date_seance = Column(String, nullable=False)   # ISO string
    statut      = Column(String, default="en_cours")  # en_cours|adopte|rejete|reporte
    objet       = Column(Text, default="")
    confidentiel = Column(Boolean, default=False)
    workflow_statut = Column(String, default="brouillon")
    reseau_visible = Column(Boolean, default=False)
    file_path   = Column(String, nullable=True)
    created_by  = Column(String, nullable=False)
    created_at  = Column(DateTime, default=_now)


class Arrete(Base):
    __tablename__ = "arretes"
    id          = Column(String, primary_key=True, default=_uuid)
    world_id    = Column(String, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    numero      = Column(String, nullable=False)
    type_arrete = Column(String, default="municipal")  # municipal|prefectoral|delegue
    date_arrete = Column(String, nullable=False)       # ISO string
    objet       = Column(Text, nullable=False, default="")
    confidentiel = Column(Boolean, default=False)
    workflow_statut = Column(String, default="brouillon")
    reseau_visible = Column(Boolean, default=False)
    file_path   = Column(String, nullable=True)
    created_by  = Column(String, nullable=False)
    created_at  = Column(DateTime, default=_now)


class ConseilMunicipal(Base):
    __tablename__ = "conseils_municipaux"
    id            = Column(String, primary_key=True, default=_uuid)
    world_id      = Column(String, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    date_conseil  = Column(String, nullable=False)   # ISO string
    heure         = Column(String, default="18:00")
    lieu          = Column(String, default="Salle du conseil")
    statut        = Column(String, default="planifie")  # planifie|en_cours|termine|annule
    ordre_du_jour = Column(Text, default="")
    pv_path       = Column(String, nullable=True)
    created_by    = Column(String, nullable=False)
    created_at    = Column(DateTime, default=_now)


class AgentElu(Base):
    __tablename__ = "agents_elus"
    id          = Column(String, primary_key=True, default=_uuid)
    world_id    = Column(String, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(String, nullable=True)
    nom         = Column(String, nullable=False)
    prenom      = Column(String, nullable=False)
    type_poste  = Column(String, default="agent")  # agent|elu|stagiaire|externe
    service     = Column(String, default="")
    fonction    = Column(String, default="")
    telephone   = Column(String, default="")
    email_pro   = Column(String, default="")
    bureau      = Column(String, default="")
    actif       = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=_now)


class Ticket(Base):
    __tablename__ = "tickets"
    id           = Column(String, primary_key=True, default=_uuid)
    world_id     = Column(String, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    nom_citoyen  = Column(String, nullable=False)
    email_citoyen = Column(String, nullable=False)
    type_demande = Column(String, default="autre")  # travaux|permis|nuisance|info|autre
    titre        = Column(String, nullable=False)
    description  = Column(Text, default="")
    statut       = Column(String, default="nouveau")  # nouveau|en_traitement|resolu|ferme
    assigne_a    = Column(String, nullable=True)       # user_id de l'agent
    reponse      = Column(Text, nullable=True)
    lat          = Column(String, nullable=True)
    lng          = Column(String, nullable=True)
    created_at   = Column(DateTime, default=_now)
    updated_at   = Column(DateTime, default=_now, onupdate=_now)


class NotificationPublique(Base):
    __tablename__ = "notifications_publiques"
    id          = Column(String, primary_key=True, default=_uuid)
    world_id    = Column(String, ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    titre       = Column(String, nullable=False)
    contenu     = Column(Text, nullable=False)
    type_notif  = Column(String, default="info")   # info|alerte|urgence
    expire_at   = Column(String, nullable=True)    # ISO string date expiration
    active      = Column(Boolean, default=True)
    created_by  = Column(String, nullable=False)
    created_at  = Column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id          = Column(String, primary_key=True, default=_uuid)
    world_id    = Column(String, nullable=True)
    user_id     = Column(String, nullable=True)
    user_nom    = Column(String, nullable=True)
    action      = Column(String, nullable=False)   # login|create_delib|delete_arrete|etc.
    ressource   = Column(String, nullable=True)    # deliberation|arrete|ticket|etc.
    ressource_id = Column(String, nullable=True)
    details     = Column(Text, nullable=True)
    ip          = Column(String, nullable=True)
    created_at  = Column(DateTime, default=_now)
