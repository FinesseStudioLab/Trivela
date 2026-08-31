import hashlib
import hmac
import json
import pytest
from trivela.webhook import generate_signature, verify_webhook_signature, construct_event

SECRET = "whsec_test_trivela_2024"

PAYLOAD_DICT = {
    "id": "evt_01HXK3Z7BQMR4NTHPWG9Y2F5JD",
    "type": "campaign.created",
    "timestamp": "2024-01-15T12:00:00.000Z",
    "data": {"campaignId": "camp_abc123", "name": "Summer Rewards"},
}
PAYLOAD_JSON = json.dumps(PAYLOAD_DICT, separators=(",", ":"))

EXPECTED_SIG = hmac.new(
    SECRET.encode("utf-8"), PAYLOAD_JSON.encode("utf-8"), hashlib.sha256
).hexdigest()


class TestGenerateSignature:
    def test_returns_64_char_hex(self):
        sig = generate_signature(SECRET, PAYLOAD_JSON)
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)

    def test_matches_test_vector(self):
        assert generate_signature(SECRET, PAYLOAD_JSON) == EXPECTED_SIG

    def test_different_secrets_produce_different_sigs(self):
        assert generate_signature("secret-a", PAYLOAD_JSON) != generate_signature("secret-b", PAYLOAD_JSON)

    def test_different_payloads_produce_different_sigs(self):
        assert generate_signature(SECRET, '{"type":"a"}') != generate_signature(SECRET, '{"type":"b"}')

    def test_empty_payload(self):
        sig = generate_signature(SECRET, "")
        assert len(sig) == 64

    def test_unicode_payload(self):
        sig = generate_signature(SECRET, '{"name":"Café Récompenses"}')
        assert len(sig) == 64


class TestVerifyWebhookSignature:
    def test_valid_signature_returns_true(self):
        assert verify_webhook_signature(EXPECTED_SIG, SECRET, PAYLOAD_JSON) is True

    def test_tampered_payload_returns_false(self):
        tampered = PAYLOAD_JSON.replace("campaign.created", "campaign.deleted")
        assert verify_webhook_signature(EXPECTED_SIG, SECRET, tampered) is False

    def test_wrong_secret_returns_false(self):
        assert verify_webhook_signature(EXPECTED_SIG, "wrong-secret", PAYLOAD_JSON) is False

    def test_truncated_signature_returns_false(self):
        assert verify_webhook_signature(EXPECTED_SIG[:32], SECRET, PAYLOAD_JSON) is False

    def test_empty_signature_returns_false(self):
        assert verify_webhook_signature("", SECRET, PAYLOAD_JSON) is False

    def test_all_zeros_returns_false(self):
        assert verify_webhook_signature("0" * 64, SECRET, PAYLOAD_JSON) is False

    def test_does_not_raise_on_bad_input(self):
        assert verify_webhook_signature(None, SECRET, PAYLOAD_JSON) is False


class TestConstructEvent:
    def test_returns_parsed_event_for_valid_request(self):
        event = construct_event(PAYLOAD_JSON, EXPECTED_SIG, SECRET)
        assert event["id"] == "evt_01HXK3Z7BQMR4NTHPWG9Y2F5JD"
        assert event["type"] == "campaign.created"
        assert event["data"]["campaignId"] == "camp_abc123"

    def test_raises_on_invalid_signature(self):
        with pytest.raises(ValueError, match="signature verification failed"):
            construct_event(PAYLOAD_JSON, "bad-signature", SECRET)

    def test_raises_on_wrong_secret(self):
        with pytest.raises(ValueError):
            construct_event(PAYLOAD_JSON, EXPECTED_SIG, "wrong-secret")

    def test_raises_on_tampered_payload(self):
        tampered = PAYLOAD_JSON.replace("Summer Rewards", "Hacked")
        with pytest.raises(ValueError):
            construct_event(tampered, EXPECTED_SIG, SECRET)

    def test_returns_dict_not_string(self):
        event = construct_event(PAYLOAD_JSON, EXPECTED_SIG, SECRET)
        assert isinstance(event, dict)

    def test_round_trips_any_valid_event(self):
        body = json.dumps({"id": "x", "type": "campaign.deactivated", "timestamp": "t", "data": None}, separators=(",", ":"))
        sig = generate_signature(SECRET, body)
        event = construct_event(body, sig, SECRET)
        assert event["type"] == "campaign.deactivated"
