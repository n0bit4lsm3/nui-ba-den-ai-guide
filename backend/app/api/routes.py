from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse

from app.api.deps import QR_CODES, ChatRequest, QRScanRequest, safe_save_chat
from app.core.config import OPENAI_BASE_URL, OPENAI_MODEL
from app.db import postgres
from app.rag.retriever import status as rag_status
from app.rag.vector_store import rebuild_collection, rebuild_status
from app.services import chat_service, llm, web_search
from app.services.query_understanding import understand_query

router = APIRouter()

@router.get("/")
def root():
    return {
        "message": "AI Ecotourism Assistant backend is running",
        "postgres_enabled": postgres.enabled(),
    }

@router.get("/api/status")
async def api_status():
    return {
        "data": postgres.data_stats(),
        "postgres_enabled": postgres.enabled(),
        "ai": {
            "configured": llm.configured(),
            "model": OPENAI_MODEL,
            "provider_host": urlsplit(OPENAI_BASE_URL).hostname or "",
        },
        "web_search": {
            "configured": web_search.configured(),
        },
        "web_knowledge": await postgres.web_knowledge_stats(),
    }


@router.post("/api/qr/scan")
def scan_qr(payload: QRScanRequest):
    qr = QR_CODES.get(payload.qr_code.strip())

    if not qr:
        return {"status": "invalid", "message": "QR không thuộc hệ thống."}

    if qr["expired"]:
        return {"status": "expired", "message": "QR đã hết hạn."}

    return {
        "status": "valid",
        "message": "Quét QR thành công.",
        "destination": postgres.destinations().get(qr["destination_id"], {}),
    }

@router.get("/api/destinations")
def list_destinations():
    values = list(postgres.destinations().values())
    return {"total": len(values), "destinations": values}


@router.get("/api/destinations/{destination_id}")
def get_destination(destination_id: int):
    return postgres.destinations().get(destination_id, {})


_SEQ_STEP_RE = re.compile(r"^(?:\((?P<note>[^)]*)\)\s*)?(?P<code>TN\d+)?\s*(?:\((?P<tail>[^)]*)\))?$")


@router.get("/api/itineraries")
def list_itineraries():
    """Itineraries from the Excel sheet, with dest_sequence resolved to destination cards."""
    by_code = {
        str(item.get("dest_code") or ""): item
        for item in postgres.destinations().values()
    }
    rows = postgres.load_rows().get("itineraries", [])
    items = []
    for row in rows:
        steps = []
        for raw in str(row.get("dest_sequence") or "").split(">"):
            raw = raw.strip()
            if not raw:
                continue
            match = _SEQ_STEP_RE.match(raw)
            note = ""
            dest = None
            if match:
                note = (match.group("note") or match.group("tail") or "").strip()
                dest = by_code.get(match.group("code") or "")
            else:
                note = raw.strip("() ")
            steps.append(
                {
                    "note": note,
                    "destination_id": dest.get("id") if dest else None,
                    "name": dest.get("name") if dest else "",
                    "location": dest.get("location") if dest else "",
                    "image_url": dest.get("image_url") if dest else "",
                }
            )
        items.append(
            {
                "id": row.get("itinerary_id", ""),
                "title": row.get("title", ""),
                "duration": row.get("duration", ""),
                "suitable_for": row.get("suitable_for", ""),
                "description": row.get("description", ""),
                "best_time": row.get("best_time", ""),
                "estimated_cost_note": row.get("estimated_cost_note", ""),
                "difficulty_level": row.get("difficulty_level", ""),
                "source_url": row.get("source_url", ""),
                "steps": steps,
            }
        )
    return {"total": len(items), "itineraries": items}


@router.get("/api/support")
def support_contacts():
    return {
        "title": "Hotline & hỗ trợ Núi Bà Đen",
        "lost_guidance": [
            "Dừng di chuyển và không tự đi sâu thêm.",
            "Giữ liên lạc, bật định vị và chia sẻ vị trí hiện tại.",
            "Mô tả mốc gần nhất, tình trạng sức khỏe và số người trong nhóm.",
        ],
        "contacts": [
            {
                "kind": "emergency",
                "name": "Tổng đài khẩn cấp quốc gia",
                "phone": "112",
                "display_phone": "112",
                "description": "Cứu nạn khẩn cấp 24/7, miễn phí cuộc gọi.",
                "source_url": "https://xaydungchinhsach.chinhphu.vn/tong-dai-so-112-tiep-nhan-24-7-cac-thong-tin-ve-su-co-thien-tai-tham-hoa-119250902150528929.htm",
            },
            {
                "kind": "management",
                "name": "Ban quản lý KDL Quốc gia Núi Bà Đen",
                "phone": "02763823378",
                "display_phone": "0276 3823 378",
                "description": "Hỗ trợ tại khu du lịch và thông tin điểm đến.",
                "source_url": "https://khudulichnuibaden.tayninh.gov.vn/",
            },
            {
                "kind": "visitor_support",
                "name": "Sun World Ba Den Mountain",
                "phone": "0327222227",
                "display_phone": "0327 222 227",
                "description": "Hỗ trợ dịch vụ và vấn đề phát sinh khi tham quan.",
                "source_url": "https://sunworld.vn/ba-den/di-chuyen",
            },
        ],
    }


@router.post("/api/chat")
async def chat(payload: ChatRequest):
    result = await chat_service.answer(
        payload.message,
        payload.destination_id,
        payload.session_id,
        [item.model_dump() for item in payload.history],
    )

    await safe_save_chat(
        payload.session_id,
        result["retrieval"].get("destination_id"),
        payload.message,
        result["answer"],
        result.get("metadata") or result["retrieval"],
    )

    return {"answer": result["answer"], "retrieval": result["retrieval"]}


async def _fixed_answer_events(
    payload: ChatRequest,
    reply: dict[str, Any],
) -> AsyncGenerator[bytes, None]:
    """Stream a ready answer word by word so the UI keeps its typing effect."""
    yield b"event: start\ndata: {}\n\n"
    for token in re.findall(r"\S+\s*|\s+", reply["answer"]):
        body = json.dumps({"token": token}, ensure_ascii=False)
        yield f"event: token\ndata: {body}\n\n".encode("utf-8")

    metadata = reply["metadata"]
    await safe_save_chat(
        payload.session_id,
        metadata.get("destination_id"),
        payload.message,
        reply["answer"],
        metadata,
    )
    body = json.dumps({"answer": reply["answer"], "retrieval": reply["retrieval"]}, ensure_ascii=False)
    yield f"event: done\ndata: {body}\n\n".encode("utf-8")


@router.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest):
    destination_id, destination = chat_service.resolve_destination(
        payload.message,
        payload.destination_id,
        [item.model_dump() for item in payload.history],
    )
    engine_reply = await chat_service.rule_engine_reply(
        payload.message,
        destination_id,
        payload.destination_id,
        destination,
        payload.session_id,
    )
    if engine_reply:
        return StreamingResponse(
            _fixed_answer_events(payload, engine_reply),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    destination_name = destination.get("name") if destination else None
    query_info = understand_query(payload.message, destination_name)
    contexts = []

    if not query_info.should_clarify:
        contexts = await chat_service.contexts_for_question(
            payload.message,
            destination_id,
            query_info.intent,
            destination_name,
        )

    async def events() -> AsyncGenerator[bytes, None]:
        answer = ""

        yield b"event: start\ndata: {}\n\n"

        if query_info.should_clarify:
            response_text = query_info.clarify_question or "Bạn hỏi rõ hơn một chút nhé?"
            for token in response_text:
                answer += token
                body = json.dumps({"token": token}, ensure_ascii=False)
                yield f"event: token\ndata: {body}\n\n".encode("utf-8")
        else:
            async for token in llm.stream(
                payload.message,
                contexts,
                destination,
                [item.model_dump() for item in payload.history],
            ):
                answer += token
                body = json.dumps({"token": token}, ensure_ascii=False)
                yield f"event: token\ndata: {body}\n\n".encode("utf-8")

        answer = llm.polish_answer(answer)

        metadata = {
            "top_k": len(contexts),
            "contexts": contexts,
            "used_llm": (not query_info.should_clarify) and llm.configured(),
            "llm_error": None,
            "model": OPENAI_MODEL,
            "destination_id": destination_id,
            "requested_destination_id": payload.destination_id,
            "destination": destination,
            "session_id": payload.session_id,
            "intent": query_info.intent,
            "clarified": query_info.should_clarify,
            "media": chat_service.related_media(destination, contexts, intent=query_info.intent),
            "sources": chat_service.live_sources(contexts),
        }

        await safe_save_chat(
            payload.session_id,
            destination_id,
            payload.message,
            answer,
            metadata,
        )

        public_retrieval = chat_service.public_retrieval(metadata)
        body = json.dumps(
            {"answer": answer, "retrieval": public_retrieval},
            ensure_ascii=False,
        )
        yield f"event: done\ndata: {body}\n\n".encode("utf-8")

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/rag/status")
def get_rag_status():
    return rag_status()


@router.post("/api/rag/rebuild")
def rebuild_rag(background_tasks: BackgroundTasks):
    current = rebuild_status()
    
    if current.get("status") == "running":
        return current
    
    postgres.refresh_data_if_stale(force=True)
    background_tasks.add_task(rebuild_collection)
    return {"status": "queued", "message": "Chroma rebuild started in background."}

@router.get("/api/rag/rebuild/status")
def get_rebuild_status():
    try:
        return rebuild_status()
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@router.post("/api/rag/chat")
async def rag_chat(payload: ChatRequest):
    return await chat(payload)
