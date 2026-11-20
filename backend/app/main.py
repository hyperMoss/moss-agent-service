"""FastAPI 主入口：提供 AgentScope 2.0 客服流式对话、SOP 知识库、台账管理与模型热配置接口。"""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.agents.service_agent import AGENTSCOPE_AVAILABLE, orchestrator
from app.config import runtime_config
from app.models import (
    AfterSalesTicketCreate,
    ChatRequest,
    ChatResponse,
    InvoiceCreate,
    ModelConfigUpdate,
)
from app.sop.knowledge import HIGH_FREQ_SCRIPTS, SOP_TREE
from app.store import store

app = FastAPI(
    title="AgentScope 2.0 智能客服系统",
    version="1.0.0",
    description="基于 AgentScope 2.0 + FastAPI 的电商地垫全链路（售前/售中/售后）客服系统后端",
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
        "openai_key_configured": bool(runtime_config.openai_api_key),
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
