"""Bridge to the tuned rule/retrieval engine (app/engine/engine.js).

The engine answers structured questions deterministically: ticket prices filtered
by validity date, price calculations per group, hours by day type, food, events,
FAQ and destinations. It runs in a long-lived Node process; one bot instance per
chat session keeps the follow-up context ("còn trẻ em thì sao?").
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
from datetime import date
from pathlib import Path
from typing import Any

from app.core.config import NODE_BIN, RULE_ENGINE_ENABLED
from app.db import postgres

logger = logging.getLogger(__name__)

ENGINE_DIR = Path(__file__).resolve().parents[1] / "engine"

# Same sheets as the tuning export; pricing_archive is intentionally excluded.
ENGINE_SHEETS = [
    "destinations",
    "media_assets",
    "services_pricing",
    "operation_hours",
    "activities",
    "faq",
    "knowledge_base",
    "itineraries",
    "maps_navigation",
    "travel_tips",
    "weather_info",
    "transportation",
    "photo_spots",
    "food_stay",
    "contact_info",
    "events_culture",
    "safety_emergency",
    "chatbot_intents",
    "chatbot_rules",
]

# Engine answer used when nothing matched; the LLM pipeline may do better.
NO_INFO_MARKER = "chưa có thông tin** chính thức"

# "ở đây" refers to the destination the visitor opened the chat from.
_LOCAL_REF_RE = re.compile(r"\b(ở đây|tại đây|chỗ này|địa điểm này|nơi này)\b", re.IGNORECASE)

_DATETIME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})T00:00:00$")
_TIME_RE = re.compile(r"^(\d{2}:\d{2}):\d{2}$")
_INT_RE = re.compile(r"^-?\d+(?:\.0+)?$")
_FLOAT_RE = re.compile(r"^-?\d+\.\d+$")


def _convert(value: str) -> Any:
    """Turn the backend's cleaned strings back into the types the engine expects."""
    if match := _DATETIME_RE.match(value):
        return match.group(1)
    if match := _TIME_RE.match(value):
        return match.group(1)
    if _INT_RE.match(value):
        return int(float(value))
    if _FLOAT_RE.match(value):
        return float(value)
    return value


def engine_data() -> dict[str, Any]:
    sheets = postgres.load_rows()
    data: dict[str, Any] = {}
    for sheet in ENGINE_SHEETS:
        rows = []
        for record in sheets.get(sheet, []):
            if not record:
                continue
            rows.append({key: _convert(value) for key, value in record.items()})
        data[sheet] = rows
    data["_meta"] = {"source": postgres.data_revision()}
    return data


class _EngineProcess:
    def __init__(self) -> None:
        self._proc: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()
        self._next_id = 0
        self._revision = ""

    async def _call(self, payload: dict[str, Any]) -> Any:
        assert self._proc and self._proc.stdin and self._proc.stdout
        self._next_id += 1
        payload = {**payload, "id": self._next_id}
        self._proc.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
        await self._proc.stdin.drain()
        line = await asyncio.wait_for(self._proc.stdout.readline(), timeout=10)
        if not line:
            raise RuntimeError("rule engine exited")
        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(response.get("error") or "rule engine error")
        return response.get("result")

    async def _ensure(self) -> None:
        revision = postgres.data_revision()
        if self._proc and self._proc.returncode is None and revision == self._revision:
            return

        if not self._proc or self._proc.returncode is not None:
            self._proc = await asyncio.create_subprocess_exec(
                NODE_BIN,
                str(ENGINE_DIR / "server.js"),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                limit=8 * 1024 * 1024,
            )
        await self._call({"op": "init", "data": engine_data()})
        self._revision = revision
        logger.info("Rule engine ready (revision %s)", revision)

    async def ask(self, session: str, question: str, today: date) -> dict[str, Any]:
        async with self._lock:
            try:
                await self._ensure()
                return await self._call(
                    {"op": "ask", "session": session, "q": question, "today": today.isoformat()}
                )
            except Exception:
                if self._proc and self._proc.returncode is None:
                    self._proc.kill()
                self._proc = None
                raise

    async def close(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._proc.kill()
            await self._proc.wait()
        self._proc = None


_engine = _EngineProcess()


def available() -> bool:
    return RULE_ENGINE_ENABLED and shutil.which(NODE_BIN) is not None


def scoped_question(question: str, destination: dict[str, Any] | None) -> str:
    name = str((destination or {}).get("name") or "").strip()
    return _LOCAL_REF_RE.sub(f"ở {name}", question) if name else question


def has_answer(result: dict[str, Any] | None) -> bool:
    return bool(result and result.get("text")) and NO_INFO_MARKER not in result["text"]


async def ask(
    session: str,
    question: str,
    destination: dict[str, Any] | None = None,
    today: date | None = None,
) -> dict[str, Any] | None:
    if not available():
        return None
    try:
        return await _engine.ask(session, scoped_question(question, destination), today or date.today())
    except Exception as exc:
        logger.warning("Rule engine unavailable: %s", exc)
        return None


async def close() -> None:
    await _engine.close()
