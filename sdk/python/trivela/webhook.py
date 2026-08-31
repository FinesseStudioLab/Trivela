"""Trivela webhook signature verification helpers.

Usage::

    from trivela.webhook import construct_event

    @app.route("/webhook", methods=["POST"])
    def webhook():
        payload = request.get_data(as_text=True)
        signature = request.headers.get("X-Trivela-Signature", "")
        try:
            event = construct_event(payload, signature, TRIVELA_WEBHOOK_SECRET)
        except ValueError as exc:
            return str(exc), 400
        # handle event["type"] …
        return "", 200
"""

import hashlib
import hmac
import json


def generate_signature(secret: str, payload: str) -> str:
    """Return the HMAC-SHA256 hex digest for *payload* signed with *secret*.

    This matches the value Trivela places in the ``X-Trivela-Signature``
    request header when delivering webhook events.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_webhook_signature(signature: str, secret: str, payload: str) -> bool:
    """Return ``True`` when *signature* matches the HMAC of *payload*.

    Uses :func:`hmac.compare_digest` for a constant-time comparison so the
    function is safe to call with untrusted input.
    """
    expected = generate_signature(secret, payload)
    try:
        return hmac.compare_digest(signature, expected)
    except (TypeError, ValueError):
        return False


def construct_event(payload: str, signature: str, secret: str) -> dict:
    """Parse and verify a Trivela webhook request.

    :param payload:   Raw request body string. Do **not** parse JSON before
                      calling this function — the signature covers the raw bytes.
    :param signature: Value of the ``X-Trivela-Signature`` header.
    :param secret:    Webhook signing secret from the Trivela dashboard.
    :returns:         Parsed event dictionary.
    :raises ValueError: When the signature is invalid.
    """
    if not verify_webhook_signature(signature, secret, payload):
        raise ValueError(
            "Trivela webhook signature verification failed. "
            "Ensure you are passing the raw request body and the correct signing secret."
        )
    return json.loads(payload)
