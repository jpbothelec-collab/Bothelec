"""
Encrypted file storage helper (S3-compatible).

Identity documents are never stored unencrypted and never made public.
Every object is written with server-side encryption, and the bucket itself
should have public access blocked entirely at the bucket-policy level —
this module only ever hands back internal storage keys or short-lived
signed URLs, never a permanent public link.

boto3 is sync, so uploads/downloads run in a thread via asyncio.to_thread
to avoid blocking the FastAPI event loop.
"""
import asyncio
import mimetypes
import uuid

from fastapi import UploadFile

from app.core.config import settings
from app.core.s3_client import get_s3_client

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


class UnsupportedFileType(Exception):
    pass


class FileTooLarge(Exception):
    pass


def _validate(file: UploadFile, contents: bytes) -> None:
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0]
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise UnsupportedFileType(f"Unsupported content type: {content_type}")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise FileTooLarge(f"File exceeds {MAX_UPLOAD_BYTES} byte limit.")


def _upload_sync(contents: bytes, key: str, content_type: str) -> None:
    client = get_s3_client()
    client.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=contents,
        ContentType=content_type,
        ServerSideEncryption="AES256",
        # Belt-and-suspenders: explicitly deny public read via ACL, even
        # though the bucket policy should already block public access.
        ACL="private",
    )


def _delete_sync(key: str) -> None:
    client = get_s3_client()
    client.delete_object(Bucket=settings.S3_BUCKET, Key=key)


def _presign_get_sync(key: str, expires_in: int) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )


async def store_encrypted(file: UploadFile, *, prefix: str) -> str:
    """
    Uploads `file` to encrypted storage under `prefix/` and returns the
    internal storage key (never a public URL). Use `get_signed_url` when
    an admin needs to actually view the document.
    """
    contents = await file.read()
    _validate(file, contents)

    extension = (file.filename or "").rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    key = f"{prefix}/{uuid.uuid4()}.{extension}"

    await asyncio.to_thread(_upload_sync, contents, key, file.content_type or "application/octet-stream")
    return key


async def get_signed_url(storage_key: str, *, expires_in: int = 300) -> str:
    """
    Returns a short-lived (default 5 min) signed URL for viewing a stored
    document. Used by admin review UI only — never expose this to the
    document owner or any other user.
    """
    return await asyncio.to_thread(_presign_get_sync, storage_key, expires_in)


def _presign_many_sync(keys: list[str], expires_in: int) -> list[str]:
    client = get_s3_client()
    return [
        client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": k},
            ExpiresIn=expires_in,
        )
        for k in keys
    ]


async def get_signed_urls(keys: list[str], *, expires_in: int = 3600) -> list[str]:
    """
    Batch variant of get_signed_url. Signing is a local (no-I/O) operation, so
    all keys are signed in one worker-thread hop rather than one per key.
    Used to attach viewable URLs to a profile's visible portfolio images.
    """
    if not keys:
        return []
    return await asyncio.to_thread(_presign_many_sync, keys, expires_in)


async def delete_object(storage_key: str) -> None:
    """Permanently deletes a stored object. Used by the retention purge job."""
    await asyncio.to_thread(_delete_sync, storage_key)
