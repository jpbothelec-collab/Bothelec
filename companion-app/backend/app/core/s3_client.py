"""
Boto3 S3 client factory, configured for either AWS S3 or an S3-compatible
provider (e.g. Xneelo Object Storage, DigitalOcean Spaces) via
S3_ENDPOINT_URL.
"""
import boto3
from botocore.client import Config as BotoConfig

from app.core.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        endpoint_url=settings.S3_ENDPOINT_URL,  # None -> defaults to AWS
        config=BotoConfig(signature_version="s3v4"),
    )
