"""
trivela — Official Python SDK for the Trivela REST API.

Usage::

    from trivela import TrivelaClient

    client = TrivelaClient(api_key="tvl_...", base_url="https://api.trivela.example.com")
    campaigns = client.campaigns.list()
    for c in campaigns:
        print(c.name, c.status)
"""

from .client import TrivelaClient
from .models import (
    Campaign,
    CampaignCreate,
    CampaignUpdate,
    CampaignListResponse,
    Pagination,
    HealthResponse,
    ConfigResponse,
    AuditLog,
    AuditLogListResponse,
    Organization,
    OrganizationMember,
    OrganizationInvitation,
    ApiKeyMetadata,
)
from .exceptions import TrivelaError, AuthError, NotFoundError, ValidationError, RateLimitError

__all__ = [
    "TrivelaClient",
    "Campaign",
    "CampaignCreate",
    "CampaignUpdate",
    "CampaignListResponse",
    "Pagination",
    "HealthResponse",
    "ConfigResponse",
    "AuditLog",
    "AuditLogListResponse",
    "Organization",
    "OrganizationMember",
    "OrganizationInvitation",
    "ApiKeyMetadata",
    "TrivelaError",
    "AuthError",
    "NotFoundError",
    "ValidationError",
    "RateLimitError",
]

__version__ = "0.1.0"
