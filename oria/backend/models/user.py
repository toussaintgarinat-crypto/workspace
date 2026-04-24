from sqlalchemy import Column, String, DateTime, Text, Boolean
from datetime import datetime
import uuid
from database import Base

class User(Base):
    __tablename__ = "users"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email           = Column(String, unique=True, nullable=False)
    nom             = Column(String, nullable=False)
    avatar_emoji    = Column(String, default="👤")
    hashed_password      = Column(String, nullable=False)
    created_at           = Column(DateTime, default=datetime.utcnow)
    matrix_user_id       = Column(String, nullable=True)   # "@oria_<uuid>:oria.local"
    matrix_access_token  = Column(String, nullable=True)
    matrix_provisioned   = Column(String, default="false") # "true" | "false" | "error"
    totp_secret          = Column(String, nullable=True)
    totp_enabled         = Column(String, default="false")  # "true" | "false"
    # Profil public réseau social
    bio                  = Column(Text, default="")
    website              = Column(String, default="")
    is_public            = Column(Boolean, default=True)
    # Config mémoire MemPalace
    mempalace_url        = Column(String, default="http://localhost:8765")
