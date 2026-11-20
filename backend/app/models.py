"""Pydantic 数据模型定义。"""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


StageType = Literal["presales", "insales", "aftersales"]


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="会话 ID")
    message: str = Field(..., min_length=1, description="客户消息内容")
    order_id: str | None = Field(default=None, description="关联订单号（可选）")
    stage_hint: StageType | None = Field(default=None, description="坐席手动指定阶段（可选）")


class ToolCallTrace(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    session_id: str
    stage: StageType
    intent: str
    reply: str
    provider: str
    tool_calls: list[ToolCallTrace] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    suggested_scripts: list[dict[str, str]] = Field(default_factory=list)


class ModelConfigUpdate(BaseModel):
    model_provider: Literal["dashscope", "openai", "demo"] | None = None
    dashscope_api_key: str | None = None
    dashscope_model: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    presales_page_min_discount: float | None = Field(default=None, ge=0.5, le=1.0)
    aftersales_quality_min_discount: float | None = Field(default=None, ge=0.5, le=1.0)
    aftersales_personal_min_discount: float | None = Field(default=None, ge=0.5, le=1.0)


class AfterSalesTicketCreate(BaseModel):
    order_id: str
    category: Literal["quality", "personal", "logistics"]
    sub_reason: str
    source_party: Literal["factory", "warehouse", "courier", "buyer"] = "buyer"
    discount_offered: float | None = None
    resolution: Literal["refund_return", "exchange", "compensation", "retention"] = "retention"
    notes: str = ""


class InvoiceCreate(BaseModel):
    order_id: str
    buyer_title: str
    tax_id: str = ""
    amount: float
    email: str = ""
    notes: str = ""
