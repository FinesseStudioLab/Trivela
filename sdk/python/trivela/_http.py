"""Low-level HTTP transport with retries and idempotency-key support."""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, Optional

try:
    import requests
    from requests import Response, Session
    HAS_REQUESTS = True
except ImportError:  # pragma: no cover
    HAS_REQUESTS = False

from .exceptions import AuthError, NotFoundError, RateLimitError, ServerError, TrivelaError, ValidationError

_RETRY_STATUSES = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
_BACKOFF_BASE = 0.5  # seconds


def _raise_for(resp: "Response") -> None:
    if resp.status_code < 400:
        return
    try:
        body: Dict[str, Any] = resp.json()
    except Exception:
        body = {}
    msg = body.get("error") or resp.reason or "Unknown error"
    code = body.get("code")
    if resp.status_code in (401, 403):
        raise AuthError(msg, code=code, status=resp.status_code)
    if resp.status_code == 404:
        raise NotFoundError(msg, code=code, status=404)
    if resp.status_code == 422:
        raise ValidationError(msg, code=code, details=body.get("details", []))
    if resp.status_code == 429:
        raise RateLimitError()
    if resp.status_code >= 500:
        raise ServerError(msg, code=code, status=resp.status_code)
    raise TrivelaError(msg, code=code, status=resp.status_code)


class HttpClient:
    """Thin HTTP client around :mod:`requests` with retry logic."""

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        bearer_token: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        if not HAS_REQUESTS:
            raise ImportError("Install the 'requests' package: pip install requests")
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._session = Session()
        if api_key:
            self._session.headers["X-API-Key"] = api_key
        if bearer_token:
            self._session.headers["Authorization"] = f"Bearer {bearer_token}"
        self._session.headers["Content-Type"] = "application/json"
        self._session.headers["Accept"] = "application/json"

    def set_bearer_token(self, token: str) -> None:
        self._session.headers["Authorization"] = f"Bearer {token}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        headers: Dict[str, str] = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        for attempt in range(_MAX_RETRIES):
            resp = self._session.request(
                method,
                url,
                params=params,
                json=json,
                headers=headers,
                timeout=self._timeout,
            )
            if resp.status_code in _RETRY_STATUSES and attempt < _MAX_RETRIES - 1:
                time.sleep(_BACKOFF_BASE * (2 ** attempt))
                continue
            _raise_for(resp)
            if resp.status_code == 204 or not resp.content:
                return None
            return resp.json()
        _raise_for(resp)  # type: ignore[reportPossiblyUnbound]

    def get(self, path: str, *, params: Optional[Dict[str, Any]] = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, *, json: Any = None, idempotency_key: Optional[str] = None) -> Any:
        key = idempotency_key or str(uuid.uuid4())
        return self._request("POST", path, json=json, idempotency_key=key)

    def put(self, path: str, *, json: Any = None) -> Any:
        return self._request("PUT", path, json=json)

    def delete(self, path: str) -> Any:
        return self._request("DELETE", path)
