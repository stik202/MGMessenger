import asyncio
import json
from typing import Any

from pywebpush import WebPushException, webpush

from app.core.config import settings


def is_push_enabled() -> bool:
    return bool(settings.vapid_public_key.strip() and settings.vapid_private_key.strip())


def build_vapid_claims() -> dict[str, str]:
    return {"sub": settings.vapid_subject}


def _send_one(subscription_info: dict[str, Any], payload_json: str) -> int | None:
    try:
        webpush(
            subscription_info=subscription_info,
            data=payload_json,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=build_vapid_claims(),
        )
        return None
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            return status_code
        return None
    except Exception:
        # Do not break core chat/call flow if push delivery fails for any reason.
        return None


async def send_web_push(subscription_info: dict[str, Any], payload: dict[str, Any]) -> int | None:
    if not is_push_enabled():
        return None
    payload_json = json.dumps(payload, ensure_ascii=False)
    return await asyncio.to_thread(_send_one, subscription_info, payload_json)
