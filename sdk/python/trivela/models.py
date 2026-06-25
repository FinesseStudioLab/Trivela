"""Typed data models mirroring backend/openapi.yaml schemas."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Pagination:
    total: int
    count: int
    page: int
    limit: int
    offset: int
    totalPages: int
    hasPreviousPage: bool
    hasNextPage: bool
    previousPage: Optional[int] = None
    nextPage: Optional[int] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Pagination":
        return cls(
            total=d["total"],
            count=d["count"],
            page=d["page"],
            limit=d["limit"],
            offset=d["offset"],
            totalPages=d["totalPages"],
            hasPreviousPage=d["hasPreviousPage"],
            hasNextPage=d["hasNextPage"],
            previousPage=d.get("previousPage"),
            nextPage=d.get("nextPage"),
        )


@dataclass
class Campaign:
    id: str
    name: str
    slug: str
    description: str
    active: bool
    featured: bool
    rewardPerAction: float
    status: str  # 'active' | 'upcoming' | 'ended'
    createdAt: str
    updatedAt: str
    hidden: bool = False
    hiddenReason: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    imageUrl: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    category: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Campaign":
        return cls(
            id=d["id"],
            name=d["name"],
            slug=d["slug"],
            description=d["description"],
            active=d["active"],
            featured=d["featured"],
            rewardPerAction=d["rewardPerAction"],
            status=d["status"],
            createdAt=d["createdAt"],
            updatedAt=d["updatedAt"],
            hidden=d.get("hidden", False),
            hiddenReason=d.get("hiddenReason"),
            startDate=d.get("startDate"),
            endDate=d.get("endDate"),
            imageUrl=d.get("imageUrl"),
            tags=d.get("tags", []),
            category=d.get("category"),
        )


@dataclass
class CampaignCreate:
    name: str
    rewardPerAction: float
    slug: Optional[str] = None
    description: Optional[str] = None
    active: bool = True
    featured: bool = False
    hidden: bool = False
    hiddenReason: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    imageUrl: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    category: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"name": self.name, "rewardPerAction": self.rewardPerAction}
        if self.slug is not None:
            d["slug"] = self.slug
        if self.description is not None:
            d["description"] = self.description
        d["active"] = self.active
        d["featured"] = self.featured
        d["hidden"] = self.hidden
        if self.hiddenReason is not None:
            d["hiddenReason"] = self.hiddenReason
        if self.startDate is not None:
            d["startDate"] = self.startDate
        if self.endDate is not None:
            d["endDate"] = self.endDate
        if self.imageUrl is not None:
            d["imageUrl"] = self.imageUrl
        if self.tags:
            d["tags"] = self.tags
        if self.category is not None:
            d["category"] = self.category
        return d


@dataclass
class CampaignUpdate:
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    rewardPerAction: Optional[float] = None
    active: Optional[bool] = None
    featured: Optional[bool] = None
    hidden: Optional[bool] = None
    hiddenReason: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {}
        for key in ("name", "slug", "description", "rewardPerAction", "active",
                    "featured", "hidden", "hiddenReason", "startDate", "endDate"):
            v = getattr(self, key)
            if v is not None:
                d[key] = v
        return d


@dataclass
class CampaignListResponse:
    data: List[Campaign]
    pagination: Pagination

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CampaignListResponse":
        return cls(
            data=[Campaign.from_dict(c) for c in d["data"]],
            pagination=Pagination.from_dict(d["pagination"]),
        )


@dataclass
class RpcHealthResponse:
    status: str  # 'ok' | 'error'
    latency_ms: Optional[float] = None
    error: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "RpcHealthResponse":
        return cls(
            status=d["status"],
            latency_ms=d.get("latency_ms"),
            error=d.get("error"),
        )


@dataclass
class HealthResponse:
    status: str  # 'ok' | 'degraded'
    service: str
    timestamp: str
    rpc: RpcHealthResponse

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "HealthResponse":
        return cls(
            status=d["status"],
            service=d["service"],
            timestamp=d["timestamp"],
            rpc=RpcHealthResponse.from_dict(d["rpc"]),
        )


@dataclass
class ConfigResponse:
    stellar: Dict[str, Any]
    contracts: Dict[str, Any]

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ConfigResponse":
        return cls(stellar=d["stellar"], contracts=d["contracts"])


@dataclass
class AuditLog:
    id: str
    actor: str
    action: str
    entity: str
    entityId: str
    timestamp: str
    diff: Optional[Dict[str, Any]] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "AuditLog":
        return cls(
            id=d["id"],
            actor=d["actor"],
            action=d["action"],
            entity=d["entity"],
            entityId=d["entityId"],
            timestamp=d["timestamp"],
            diff=d.get("diff"),
        )


@dataclass
class AuditLogListResponse:
    data: List[AuditLog]
    pagination: Pagination

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "AuditLogListResponse":
        return cls(
            data=[AuditLog.from_dict(a) for a in d["data"]],
            pagination=Pagination.from_dict(d["pagination"]),
        )


@dataclass
class Organization:
    id: str
    name: str
    slug: str
    createdAt: str
    updatedAt: str

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Organization":
        return cls(
            id=d["id"],
            name=d["name"],
            slug=d["slug"],
            createdAt=d["createdAt"],
            updatedAt=d["updatedAt"],
        )


@dataclass
class OrganizationMember:
    id: str
    organizationId: str
    userEmail: str
    role: str  # 'owner' | 'admin' | 'member'
    joinedAt: str

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "OrganizationMember":
        return cls(
            id=d["id"],
            organizationId=d["organizationId"],
            userEmail=d["userEmail"],
            role=d["role"],
            joinedAt=d["joinedAt"],
        )


@dataclass
class OrganizationInvitation:
    id: str
    organizationId: str
    email: str
    role: str
    token: str
    invitedBy: str
    invitedAt: str
    expiresAt: str
    status: str  # 'pending' | 'accepted' | 'revoked' | 'expired'
    acceptedAt: Optional[str] = None
    revokedAt: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "OrganizationInvitation":
        return cls(
            id=d["id"],
            organizationId=d["organizationId"],
            email=d["email"],
            role=d["role"],
            token=d["token"],
            invitedBy=d["invitedBy"],
            invitedAt=d["invitedAt"],
            expiresAt=d["expiresAt"],
            status=d["status"],
            acceptedAt=d.get("acceptedAt"),
            revokedAt=d.get("revokedAt"),
        )


@dataclass
class ApiKeyMetadata:
    id: Optional[str] = None
    label: Optional[str] = None
    createdAt: Optional[str] = None
    expiresAt: Optional[str] = None
    lastUsedAt: Optional[str] = None
    active: Optional[bool] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ApiKeyMetadata":
        return cls(
            id=d.get("id"),
            label=d.get("label"),
            createdAt=d.get("createdAt"),
            expiresAt=d.get("expiresAt"),
            lastUsedAt=d.get("lastUsedAt"),
            active=d.get("active"),
        )
