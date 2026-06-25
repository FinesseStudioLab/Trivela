"""High-level TrivelaClient with resource namespaces."""

from __future__ import annotations

import os
from typing import Any, Dict, Generator, List, Optional

from ._http import HttpClient
from ._pagination import paginate
from .models import (
    AuditLog,
    AuditLogListResponse,
    Campaign,
    CampaignCreate,
    CampaignListResponse,
    CampaignUpdate,
    ConfigResponse,
    HealthResponse,
    Organization,
    OrganizationInvitation,
    OrganizationMember,
    ApiKeyMetadata,
)

_DEFAULT_BASE_URL = "https://api.trivela.example.com"


class CampaignsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
        active: Optional[bool] = None,
        category: Optional[str] = None,
    ) -> CampaignListResponse:
        params: Dict[str, Any] = {"page": page, "limit": limit}
        if search is not None:
            params["search"] = search
        if active is not None:
            params["active"] = str(active).lower()
        if category is not None:
            params["category"] = category
        raw = self._http.get("/api/v1/campaigns", params=params)
        return CampaignListResponse.from_dict(raw)

    def iter_all(
        self,
        *,
        search: Optional[str] = None,
        active: Optional[bool] = None,
        page_size: int = 50,
    ) -> Generator[Campaign, None, None]:
        """Iterate every campaign across all pages."""
        def _fetch(page: int, limit: int) -> Dict[str, Any]:
            params: Dict[str, Any] = {"page": page, "limit": limit}
            if search is not None:
                params["search"] = search
            if active is not None:
                params["active"] = str(active).lower()
            return self._http.get("/api/v1/campaigns", params=params)

        return paginate(_fetch, parse_item=Campaign.from_dict, page_size=page_size)

    def get(self, campaign_id: str) -> Campaign:
        raw = self._http.get(f"/api/v1/campaigns/{campaign_id}")
        return Campaign.from_dict(raw)

    def get_by_slug(self, slug: str) -> Campaign:
        raw = self._http.get(f"/api/v1/campaigns/by-slug/{slug}")
        return Campaign.from_dict(raw)

    def create(self, data: CampaignCreate, *, idempotency_key: Optional[str] = None) -> Campaign:
        raw = self._http.post("/api/v1/campaigns", json=data.to_dict(), idempotency_key=idempotency_key)
        return Campaign.from_dict(raw)

    def update(self, campaign_id: str, data: CampaignUpdate) -> Campaign:
        raw = self._http.put(f"/api/v1/campaigns/{campaign_id}", json=data.to_dict())
        return Campaign.from_dict(raw)

    def delete(self, campaign_id: str) -> None:
        self._http.delete(f"/api/v1/campaigns/{campaign_id}")


class OrganizationsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, name: str, slug: Optional[str] = None) -> Organization:
        body: Dict[str, Any] = {"name": name}
        if slug is not None:
            body["slug"] = slug
        raw = self._http.post("/api/v1/organizations", json=body)
        return Organization.from_dict(raw)

    def get(self, org_id: str) -> Organization:
        raw = self._http.get(f"/api/v1/organizations/{org_id}")
        return Organization.from_dict(raw)

    def update(self, org_id: str, name: Optional[str] = None, slug: Optional[str] = None) -> Organization:
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if slug is not None:
            body["slug"] = slug
        raw = self._http.put(f"/api/v1/organizations/{org_id}", json=body)
        return Organization.from_dict(raw)

    def delete(self, org_id: str) -> None:
        self._http.delete(f"/api/v1/organizations/{org_id}")

    def list_members(self, org_id: str) -> List[OrganizationMember]:
        raw = self._http.get(f"/api/v1/organizations/{org_id}/members")
        return [OrganizationMember.from_dict(m) for m in raw.get("data", raw if isinstance(raw, list) else [])]

    def invite(self, org_id: str, email: str, role: str = "member") -> OrganizationInvitation:
        raw = self._http.post(
            f"/api/v1/organizations/{org_id}/invitations",
            json={"email": email, "role": role},
        )
        return OrganizationInvitation.from_dict(raw)

    def accept_invitation(self, token: str) -> None:
        self._http.post(f"/api/v1/organizations/invite/{token}/accept")


class AuditLogsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list(self, *, page: int = 1, limit: int = 20) -> AuditLogListResponse:
        raw = self._http.get("/api/v1/audit-logs", params={"page": page, "limit": limit})
        return AuditLogListResponse.from_dict(raw)


class AdminResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list_api_keys(self) -> List[ApiKeyMetadata]:
        raw = self._http.get("/api/v1/admin/api-keys")
        return [ApiKeyMetadata.from_dict(k) for k in raw.get("data", raw if isinstance(raw, list) else [])]

    def delete_api_key(self, key_id: str) -> None:
        self._http.delete(f"/api/v1/admin/api-keys/{key_id}")

    def rotate_api_key(self, key_id: str) -> Dict[str, Any]:
        return self._http.put(f"/api/v1/admin/api-keys/{key_id}/rotate")


class TrivelaClient:
    """Synchronous Trivela REST API client.

    Args:
        api_key:      API key (``tvl_...``). Falls back to the
                      ``TRIVELA_API_KEY`` environment variable.
        base_url:     Override the API base URL.  Defaults to the
                      production endpoint.
        bearer_token: SEP-10 bearer token (alternative to API key).
        timeout:      Per-request timeout in seconds (default 30).
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: str = _DEFAULT_BASE_URL,
        bearer_token: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        resolved_key = api_key or os.environ.get("TRIVELA_API_KEY")
        self._http = HttpClient(
            base_url,
            api_key=resolved_key,
            bearer_token=bearer_token,
            timeout=timeout,
        )
        self.campaigns = CampaignsResource(self._http)
        self.organizations = OrganizationsResource(self._http)
        self.audit_logs = AuditLogsResource(self._http)
        self.admin = AdminResource(self._http)

    def health(self) -> HealthResponse:
        raw = self._http.get("/health")
        return HealthResponse.from_dict(raw)

    def config(self) -> ConfigResponse:
        raw = self._http.get("/api/v1/config")
        return ConfigResponse.from_dict(raw)

    def set_bearer_token(self, token: str) -> None:
        """Update the bearer token (e.g. after SEP-10 auth exchange)."""
        self._http.set_bearer_token(token)
