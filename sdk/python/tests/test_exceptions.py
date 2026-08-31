"""Tests for exception handling in the HTTP layer."""

from unittest.mock import MagicMock, patch
import pytest

from trivela.exceptions import AuthError, NotFoundError, RateLimitError, ValidationError
from trivela._http import HttpClient, _raise_for


def _mock_response(status_code: int, body: dict):
    r = MagicMock()
    r.status_code = status_code
    r.content = b"x"
    r.json.return_value = body
    r.reason = "Error"
    return r


def test_raise_for_401():
    r = _mock_response(401, {"error": "Unauthorized", "code": "AUTH_REQUIRED"})
    with pytest.raises(AuthError) as exc:
        _raise_for(r)
    assert exc.value.status == 401
    assert exc.value.code == "AUTH_REQUIRED"


def test_raise_for_403():
    r = _mock_response(403, {"error": "Forbidden", "code": "FORBIDDEN"})
    with pytest.raises(AuthError):
        _raise_for(r)


def test_raise_for_404():
    r = _mock_response(404, {"error": "Not found", "code": "NOT_FOUND"})
    with pytest.raises(NotFoundError) as exc:
        _raise_for(r)
    assert exc.value.status == 404


def test_raise_for_422():
    r = _mock_response(422, {"error": "Validation failed", "code": "VALIDATION_ERROR", "details": ["name required"]})
    with pytest.raises(ValidationError) as exc:
        _raise_for(r)
    assert "name required" in exc.value.details


def test_raise_for_429():
    r = _mock_response(429, {})
    with pytest.raises(RateLimitError):
        _raise_for(r)


def test_raise_for_200_is_noop():
    r = _mock_response(200, {})
    _raise_for(r)  # must not raise
