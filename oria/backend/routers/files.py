from fastapi import APIRouter, Depends, UploadFile, File as FastAPIFile, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models.building import File
from routers.auth import get_current_user
from datetime import datetime
import uuid, os, shutil

router = APIRouter()
for _candidate in ["/app/uploads", "/tmp/uploads",
                   os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))]:
    try:
        os.makedirs(_candidate, exist_ok=True)
        UPLOAD_DIR = _candidate
        break
    except OSError:
        continue
else:
    UPLOAD_DIR = "/tmp/uploads"

def _file_dict(f):
    return {
        "id": f.id, "nom": f.nom, "taille": f.taille, "type_mime": f.type_mime,
        "uploader_nom": f.uploader_nom, "uploaded_by": f.uploaded_by,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }

@router.post("/upload/{room_id}")
async def upload_file(room_id: str, file: UploadFile = FastAPIFile(...),
                      db: Session = Depends(get_db), user=Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1]
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(path)
    db_file = File(id=file_id, room_id=room_id,
                   uploaded_by=user["id"], uploader_nom=user["nom"],
                   nom=file.filename or filename, taille=size,
                   type_mime=file.content_type or "application/octet-stream",
                   path=filename)
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return {**_file_dict(db_file), "room_id": room_id}

@router.get("/room/{room_id}")
def lister_fichiers(room_id: str, db: Session = Depends(get_db)):
    files = db.query(File).filter(File.room_id == room_id).order_by(File.created_at.desc()).all()
    return [_file_dict(f) for f in files]

@router.get("/download/{file_id}")
def telecharger(file_id: str, db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    path = os.path.join(UPLOAD_DIR, f.path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Fichier manquant")
    return FileResponse(path, filename=f.nom, media_type=f.type_mime)

@router.post("/upload/building/{building_id}")
async def upload_building(building_id: str, file: UploadFile = FastAPIFile(...),
                          db: Session = Depends(get_db), user=Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1]
    file_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(path)
    db_file = File(id=file_id, building_id=building_id,
                   uploaded_by=user["id"], uploader_nom=user["nom"],
                   nom=file.filename or f"{file_id}{ext}", taille=size,
                   type_mime=file.content_type or "application/octet-stream",
                   path=f"{file_id}{ext}")
    db.add(db_file); db.commit(); db.refresh(db_file)
    return {**_file_dict(db_file), "building_id": building_id}

@router.get("/building/{building_id}")
def lister_building(building_id: str, db: Session = Depends(get_db)):
    files = db.query(File).filter(File.building_id == building_id).order_by(File.created_at.desc()).all()
    return [_file_dict(f) for f in files]

@router.post("/upload/world/{world_id}")
async def upload_world(world_id: str, file: UploadFile = FastAPIFile(...),
                       db: Session = Depends(get_db), user=Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1]
    file_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(path)
    db_file = File(id=file_id, world_id=world_id,
                   uploaded_by=user["id"], uploader_nom=user["nom"],
                   nom=file.filename or f"{file_id}{ext}", taille=size,
                   type_mime=file.content_type or "application/octet-stream",
                   path=f"{file_id}{ext}")
    db.add(db_file); db.commit(); db.refresh(db_file)
    return {**_file_dict(db_file), "world_id": world_id}

@router.get("/world/{world_id}")
def lister_world(world_id: str, db: Session = Depends(get_db)):
    files = db.query(File).filter(File.world_id == world_id).order_by(File.created_at.desc()).all()
    return [_file_dict(f) for f in files]

@router.delete("/{file_id}")
def supprimer_fichier(file_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    f = db.query(File).filter(File.id == file_id).first()
    if f:
        p = os.path.join(UPLOAD_DIR, f.path)
        if os.path.exists(p):
            os.remove(p)
        db.delete(f)
        db.commit()
    return {"status": "ok"}
