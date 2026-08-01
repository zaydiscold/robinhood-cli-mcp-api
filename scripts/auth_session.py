"""Token-safe access-token session metadata."""
import base64
import json
from datetime import datetime, timezone
from time import time
from typing import Optional


def describe_session_token(token: str, *, now: Optional[float] = None) -> dict[str, object]:
    """Return expiry and lifetime metadata without returning the token or claims."""
    if token.count(".") != 2:
        return {}
    try:
        payload = token.split(".")[1]
        payload += "=" * ((4 - len(payload) % 4) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        expires = int(claims["exp"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return {}
    return {
        "session_remaining_days": round((expires - (time() if now is None else now)) / 86400, 2),
        "token_expires_utc": datetime.fromtimestamp(
            expires, timezone.utc
        ).isoformat(),
    }
