"""
Boto3 S3 client factory, configured for either AWS S3 or an S3-compatible
provider (e.g. MinIO, Xneelo Object Storage, DigitalOcean Spaces) via
S3_ENDPOINT_URL.
"""
import boto3
from botocore.client import Config as BotoConfig

from app.core.config import settings


def get_s3_client(*, for_signing: bool = False):
    """
    Build an S3 client.

    for_signing=True returns a client whose endpoint is the browser-facing
    S3_PUBLIC_ENDPOINT_URL (when set), so generated presigned URLs point at a
    host the end user's browser can actually reach — while ordinary
    read/write operations keep using the internal S3_ENDPOINT_URL.
    """
    endpoint = settings.S3_ENDPOINT_URL
    if for_signing and settings.S3_PUBLIC_ENDPOINT_URL:
        endpoint = settings.S3_PUBLIC_ENDPOINT_URL

    # S3-compatible stores addressed by host/IP need path-style addressing
    # (bucket in the path, not the hostname). Only AWS gets virtual-host style.
    addressing_style = "path" if endpoint else "auto"

    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        endpoint_url=endpoint,  # None -> defaults to AWS
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
        ),
    )
