"""Typed exception hierarchy for the Trivela SDK."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class TrivelaError(Exception):
    """Base error for all Trivela SDK errors."""

    def __init__(self, message: str, code: Optional[str] = None, status: Optional[int] = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status

    def __repr__(self) -> str:  # pragma: no cover
        return f"{type(self).__name__}({self!s}, code={self.code!r}, status={self.status!r})"


class AuthError(TrivelaError):
    """Raised when the API returns 401 or 403."""


class NotFoundError(TrivelaError):
    """Raised when the API returns 404."""


class ValidationError(TrivelaError):
    """Raised when the API returns 422 (validation failure)."""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[List[str]] = None) -> None:
        super().__init__(message, code=code, status=422)
        self.details: List[str] = details or []


class RateLimitError(TrivelaError):
    """Raised when the API returns 429 (rate limited)."""

    def __init__(self, message: str = "Rate limit exceeded — retry after a moment") -> None:
        super().__init__(message, code="RATE_LIMITED", status=429)


class ServerError(TrivelaError):
    """Raised when the API returns 5xx."""
