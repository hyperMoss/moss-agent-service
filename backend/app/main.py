"""FastAPI 主入口：AgentScope 2.0 客服流式对话 + Onto 双本体/归因/多模态/Badcase/评测接口。"""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.agents.service_agent import AGENTSCOPE_AVAILABLE, orchestrator
from app.analytics.attribution_engine import (
    answer_attribution_question,
    build_attribution_dashboard,
)
from app.config import runtime_config
from app.eval.benchmark_runner import PUBLIC_DATASET_CATALOG, run_benchmark_suite
from app.models import (
    AfterSalesTicketCreate,
    AttributionAskRequest,
    BadcaseUpdate,
    ChatRequest,
    ChatResponse,
    FeedbackCreate,
    InvoiceCreate,
    ModelConfigUpdate,
    MultimodalAnalyzeRequest,
)
from app.sop.knowledge import HIGH_FREQ_SCRIPTS, SOP_TREE
from app.store import store
from app.tools.multimodal import analyze_media_evidence

app = FastAPI(
    title="AgentScope 2.0 × Onto 智能客服与经营归因系统",
    version="2.0.0",
    description="基于 AgentScope 2.0 + FastAPI，融合 Onto 双本体护栏、只读经营归因、Badcase 自进化与评测集回归",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=runtime_config.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "agentscope_installed": AGENTSCOPE_AVAILABLE,
        "effective_provider": runtime_config.effective_provider(),
    }


@app.get("/api/sop")
def get_sop() -> dict[str, Any]:
    return {"sop": SOP_TREE, "scripts": HIGH_FREQ_SCRIPTS}


@app.get("/api/orders")
def list_orders() -> dict[str, Any]:
    return {"orders": store.list_orders()}


@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: str) -> dict[str, Any]:
    return {"session_id": session_id, "messages": store.get_session_messages(session_id)}


@app.post("/api/chat", response_model=ChatResponse)
async def chat_once(req: ChatRequest) -> ChatResponse:
    meta: dict[str, Any] = {}
    final_data: dict[str, Any] = {}
    async for evt in orchestrator.chat_stream(
        session_id=req.session_id,
        message=req.message,
        order_id=req.order_id,
        stage_hint=req.stage_hint,
    ):
        if evt["event"] == "meta":
            meta = evt["data"]
        elif evt["event"] == "done":
            final_data = evt["data"]

    return ChatResponse(
        session_id=req.session_id,
        stage=final_data.get("stage", meta.get("stage", "presales")),
        intent=final_data.get("intent", meta.get("intent", "")),
        reply=final_data.get("reply", ""),
        provider=meta.get("provider", runtime_config.effective_provider()),
        tool_calls=final_data.get("tool_calls", []),
        checklist=meta.get("checklist", []),
        suggested_scripts=meta.get("suggested_scripts", []),
        decision_trace=final_data.get("decision_trace"),
    )


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    async def event_generator():
        async for evt in orchestrator.chat_stream(
            session_id=req.session_id,
            message=req.message,
            order_id=req.order_id,
            stage_hint=req.stage_hint,
        ):
            payload = json.dumps(evt["data"], ensure_ascii=False)
            yield f"event: {evt['event']}\ndata: {payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/multimodal/analyze")
def multimodal_analyze(req: MultimodalAnalyzeRequest) -> dict[str, Any]:
    return analyze_media_evidence(
        filename=req.filename,
        caption=req.caption,
        media_type=req.media_type,
    )


@app.post("/api/feedback")
def submit_feedback(req: FeedbackCreate) -> dict[str, Any]:
    saved = store.add_feedback(req.model_dump())
    return {"ok": True, "record": saved}


@app.get("/api/badcases")
def list_badcases(all_records: bool = False) -> dict[str, Any]:
    return {"badcases": store.list_badcases(only_down=not all_records)}


@app.put("/api/badcases/{badcase_id}")
def update_badcase(badcase_id: int, req: BadcaseUpdate) -> dict[str, Any]:
    ok = store.update_badcase(badcase_id, req.status, req.fix_proposal)
    if not ok:
        raise HTTPException(status_code=404, detail="Badcase 记录不存在")
    return {"ok": True}


@app.get("/api/analytics/dashboard")
def analytics_dashboard() -> dict[str, Any]:
    return build_attribution_dashboard(store)


@app.post("/api/analytics/ask")
def analytics_ask(req: AttributionAskRequest) -> dict[str, Any]:
    return answer_attribution_question(req.question, store)


@app.get("/api/benchmark/catalog")
def benchmark_catalog() -> dict[str, Any]:
    return {"catalog": PUBLIC_DATASET_CATALOG}


@app.post("/api/benchmark/run")
async def benchmark_run() -> dict[str, Any]:
    return await run_benchmark_suite(store)


@app.get("/api/tickets")
def list_tickets() -> dict[str, Any]:
    return {"tickets": store.list_after_sales_tickets()}


@app.post("/api/tickets")
def create_ticket(req: AfterSalesTicketCreate) -> dict[str, Any]:
    record = store.add_after_sales_ticket(req.model_dump())
    return {"ticket": record}


@app.get("/api/invoices")
def list_invoices() -> dict[str, Any]:
    return {"invoices": store.list_invoice_records()}


@app.post("/api/invoices")
def create_invoice(req: InvoiceCreate) -> dict[str, Any]:
    record = store.add_invoice_record(req.model_dump())
    return {"invoice": record}


@app.get("/api/notifications")
def list_notifications() -> dict[str, Any]:
    return {"notifications": store.list_notifications()}


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return {
        "model_provider": runtime_config.model_provider,
        "effective_provider": runtime_config.effective_provider(),
        "agentscope_installed": AGENTSCOPE_AVAILABLE,
        "dashscope_model": runtime_config.dashscope_model,
        "dashscope_key_configured": bool(runtime_config.dashscope_api_key),
        "openai_base_url": runtime_config.openai_base_url,
        "openai_model": runtime_config.openai_model,
        "openai_key_configured": bool(runtime_config.openai_key_configured if hasattr(runtime_config, "openai_key_configured") else runtime_config.openai_api_key),
        "presales_page_min_discount": runtime_config.presales_page_min_discount,
        "aftersales_quality_min_discount": runtime_config.aftersales_quality_min_discount,
        "aftersales_personal_min_discount": runtime_config.aftersales_personal_min_discount,
        "logistics_stall_hours_threshold": runtime_config.logistics_stall_hours_threshold,
    }


@app.put("/api/config")
def update_config(req: ModelConfigUpdate) -> dict[str, Any]:
    updates = req.model_dump(exclude_none=True)
    for field_name, value in updates.items():
        if not hasattr(runtime_config, field_name):
            raise HTTPException(status_code=400, detail=f"未知配置项: {field_name}")
        setattr(runtime_config, field_name, value)
    return {"ok": True, "config": get_config()}
