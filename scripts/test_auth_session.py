import base64
import json
import unittest
from datetime import datetime, timezone

from auth_session import describe_session_token


def segment(value: dict) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


class SessionMetadataTest(unittest.TestCase):
    def test_reports_expiry_and_thirty_days_remaining_without_token(self) -> None:
        now = 1_800_000_000
        token = f"{segment({'alg': 'none'})}.{segment({'exp': now + 30 * 86400})}.x"
        metadata = describe_session_token(token, now=now)
        self.assertEqual(metadata["session_remaining_days"], 30)
        self.assertEqual(
            metadata["token_expires_utc"],
            datetime.fromtimestamp(now + 30 * 86400, timezone.utc).isoformat(),
        )
        self.assertNotIn(token, json.dumps(metadata))

    def test_returns_unknown_for_opaque_refresh_token(self) -> None:
        self.assertEqual(describe_session_token("opaque-token"), {})


if __name__ == "__main__":
    unittest.main()
