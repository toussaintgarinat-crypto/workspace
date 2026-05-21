"""
Storage abstraction for original documents.

Two backends:
  LocalStorage — filesystem (default, MEMPALACE_STORAGE=local)
  S3Storage    — S3-compatible: MinIO / AWS S3 / Cloudflare R2 (MEMPALACE_STORAGE=s3)

Switch via env var — zero code change to migrate between backends.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path


class StorageBackend(ABC):
    @abstractmethod
    def save(self, user_id: str, doc_id: str, filename: str, data: bytes) -> str:
        """Store file and return its storage path/key."""
        ...

    @abstractmethod
    def load(self, storage_path: str) -> bytes: ...

    @abstractmethod
    def delete(self, storage_path: str) -> None: ...


class LocalStorage(StorageBackend):
    def __init__(self, base_path: str):
        self.base = Path(base_path)

    def save(self, user_id: str, doc_id: str, filename: str, data: bytes) -> str:
        dest = self.base / user_id / "docs" / doc_id / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return str(Path(user_id) / "docs" / doc_id / filename)

    def load(self, storage_path: str) -> bytes:
        return (self.base / storage_path).read_bytes()

    def delete(self, storage_path: str) -> None:
        p = self.base / storage_path
        if p.exists():
            p.unlink()
        for parent in (p.parent, p.parent.parent):
            try:
                parent.rmdir()
            except OSError:
                break


class S3Storage(StorageBackend):
    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str):
        import boto3
        from botocore.client import Config

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
        )
        try:
            self.client.head_bucket(Bucket=bucket)
        except Exception:
            self.client.create_bucket(Bucket=bucket)

    def save(self, user_id: str, doc_id: str, filename: str, data: bytes) -> str:
        key = f"{user_id}/docs/{doc_id}/{filename}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def load(self, storage_path: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=storage_path)
        return obj["Body"].read()

    def delete(self, storage_path: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=storage_path)


class FallbackStorage(StorageBackend):
    """Tries S3/MinIO first; falls back to local filesystem on failure."""

    _FALLBACK_PREFIX = "fallback:"

    def __init__(self, s3: S3Storage, fallback_base: str):
        self._s3 = s3
        self._local = LocalStorage(fallback_base)
        self.degraded = False

    def save(self, user_id: str, doc_id: str, filename: str, data: bytes) -> str:
        try:
            path = self._s3.save(user_id, doc_id, filename, data)
            self.degraded = False
            return path
        except Exception:
            self.degraded = True
            local_path = self._local.save(user_id, doc_id, filename, data)
            return f"{self._FALLBACK_PREFIX}{local_path}"

    def load(self, storage_path: str) -> bytes:
        if storage_path.startswith(self._FALLBACK_PREFIX):
            return self._local.load(storage_path[len(self._FALLBACK_PREFIX):])
        try:
            return self._s3.load(storage_path)
        except Exception:
            return self._local.load(storage_path)

    def delete(self, storage_path: str) -> None:
        if storage_path.startswith(self._FALLBACK_PREFIX):
            return self._local.delete(storage_path[len(self._FALLBACK_PREFIX):])
        try:
            self._s3.delete(storage_path)
        except Exception:
            pass


def get_storage_backend(base_path: str) -> StorageBackend:
    if os.environ.get("MEMPALACE_STORAGE", "local") == "s3":
        s3 = S3Storage(
            endpoint=os.environ["S3_ENDPOINT"],
            access_key=os.environ["S3_ACCESS_KEY"],
            secret_key=os.environ["S3_SECRET_KEY"],
            bucket=os.environ.get("S3_BUCKET", "mempalace"),
        )
        fallback_dir = os.environ.get("MINIO_FALLBACK_DIR", f"{base_path}/_fallback")
        return FallbackStorage(s3, fallback_dir)
    return LocalStorage(base_path)
