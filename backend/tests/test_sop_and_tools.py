"""自动化单元测试：验证 SOP 意图路由、折扣权限红线、工具调用与台账写入。"""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

from app.agents.service_agent import CustomerServiceOrchestrator
from app.sop.router import route_intent
from app.store import CSStore
from app.tools.cs_tools import build_cs_tools


def _make_store() -> CSStore:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    return CSStore(db_path=tmp.name)


def test_intent_routing_three_stages() -> None:
    r_pre = route_intent("我想定制一块 200x300 印LOGO的铝合金地垫，多少钱？")
    assert r_pre.stage == "presales" and r_pre.intent == "custom_order"

    r_in = route_intent("我的快递已经停滞3天不动了，订单号 DD20261116003")
    assert r_in.stage == "insales" and r_in.intent == "urge_logistics"

    r_after = route_intent("地垫收到有脱胶和质量问题，我要退货")
    assert r_after.stage == "aftersales" and r_after.intent == "quality_issue"

    r_personal = route_intent("收到的地垫有色差，而且味道有点重")
    assert r_personal.stage == "aftersales" and r_personal.intent == "personal_issue"


def test_discount_authority_guardrails() -> None:
    db = _make_store()
    tools = {fn.__name__: fn for fn in build_cs_tools(db)}

    # 售前页面尺寸：9.8折通过，9.5折拒绝
    assert tools["check_discount_authority"]("presales_page_size", 0.98)["approved"] is True
    assert tools["check_discount_authority"]("presales_page_size", 0.95)["approved"] is False

    # 售后品质问题：7折通过，6.5折拒绝
    assert tools["check_discount_authority"]("aftersales_quality", 0.70)["approved"] is True
    assert tools["check_discount_authority"]("aftersales_quality", 0.65)["approved"] is False

    # 售后个人问题：8折通过，7.5折拒绝
    assert tools["check_discount_authority"]("aftersales_personal", 0.80)["approved"] is True
    assert tools["check_discount_authority"]("aftersales_personal", 0.75)["approved"] is False


def test_insales_and_aftersales_workflows() -> None:
    db = _make_store()
    tools = {fn.__name__: fn for fn in build_cs_tools(db)}

    # 1. 物流停滞超 48 小时自动交接售后
    log_res = tools["check_logistics_status"]("DD20261116003")
    assert log_res["need_aftersales_handover"] is True

    # 2. 发货后定制订单不允许修改商品信息
    prod_res = tools["request_product_change"]("DD20261114004", "改为深灰色")
    assert prod_res["allowed"] is False

    # 3. 发货前页面尺寸允许直接改地址
    addr_res = tools["request_address_change"]("DD20261119001", "上海市徐汇区漕河泾99号")
    assert addr_res["phase"] == "before_shipment"
    assert db.get_order("DD20261119001")["shipping_address"] == "上海市徐汇区漕河泾99号"

    # 4. 售后品质问题登记表格 + 通知工厂群
    t_res = tools["register_after_sales_ticket"](
        order_id="DD20261114004",
        category="quality",
        sub_reason="边缘脱胶",
        source_party="factory",
        discount_offered=0.70,
        resolution="retention",
    )
    assert t_res["ok"] is True
    assert len(db.list_after_sales_tickets()) == 1
    assert any(n["group_type"] == "factory_group" for n in db.list_notifications())


def test_orchestrator_demo_stream() -> None:
    db = _make_store()
    orch = CustomerServiceOrchestrator(db=db)

    async def _run() -> list[dict]:
        events = []
        async for evt in orch.chat_stream(
            session_id="test-sess-1",
            message="定制 180x240 带LOGO的异形丝圈地垫怎么报价？",
        ):
            events.append(evt)
        return events

    events = asyncio.run(_run())
    event_types = [e["event"] for e in events]
    assert "meta" in event_types
    assert "tool_call" in event_types
    assert "delta" in event_types
    assert "done" in event_types
    done_evt = [e for e in events if e["event"] == "done"][0]
    assert "3-5 天" in done_evt["data"]["reply"]
    assert len(db.get_session_messages("test-sess-1")) == 2


if __name__ == "__main__":
    test_intent_routing_three_stages()
    test_discount_authority_guardrails()
    test_insales_and_aftersales_workflows()
    test_orchestrator_demo_stream()
    print("ALL BACKEND TESTS PASSED")
