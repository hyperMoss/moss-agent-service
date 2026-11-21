"""全量自动化单元测试：SOP 路由、双本体护栏、多模态、只读归因引擎、Badcase 闭环与 20 条评测集回归。"""

from __future__ import annotations

import asyncio
import tempfile

from app.agents.service_agent import CustomerServiceOrchestrator
from app.analytics.attribution_engine import (
    answer_attribution_question,
    build_attribution_dashboard,
)
from app.eval.benchmark_runner import run_benchmark_suite
from app.ontology.dual_ontology import verify_response_and_actions
from app.sop.router import route_intent
from app.store import CSStore
from app.tools.cs_tools import build_cs_tools
from app.tools.multimodal import analyze_media_evidence


def _make_store() -> CSStore:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    return CSStore(db_path=tmp.name)


def test_intent_routing_and_discounts() -> None:
    assert route_intent("定制 200x300 LOGO铝合金门垫").intent == "custom_order"
    assert route_intent("订单 DD20261116003 物流停滞不动").intent == "urge_logistics"
    assert route_intent("地垫边缘脱胶质量问题").intent == "quality_issue"
    assert route_intent("地垫色差和味道重").intent == "personal_issue"

    db = _make_store()
    tools = {fn.__name__: fn for fn in build_cs_tools(db)}
    assert tools["check_discount_authority"]("presales_page_size", 0.98)["approved"] is True
    assert tools["check_discount_authority"]("presales_page_size", 0.90)["approved"] is False
    assert tools["check_discount_authority"]("aftersales_quality", 0.70)["approved"] is True
    assert tools["check_discount_authority"]("aftersales_quality", 0.60)["approved"] is False
    assert tools["check_discount_authority"]("aftersales_personal", 0.80)["approved"] is True
    assert tools["check_discount_authority"]("aftersales_personal", 0.70)["approved"] is False


def test_dual_ontology_guardrail() -> None:
    # 模拟越权承诺（售前页面尺寸给 8.5 折 < 9.8 折红线）
    v = verify_response_and_actions(
        stage="presales",
        intent="page_size",
        reply_text="亲，页面尺寸我特批给您8.5折优惠！",
    )
    assert v.passed is False
    assert len(v.violations) == 1
    assert "9.8 折" in v.sanitized_reply

    # 模拟合规承诺
    v_ok = verify_response_and_actions(
        stage="aftersales",
        intent="quality_issue",
        reply_text="亲，品质问题这边为您申请7折优惠留用补偿。",
    )
    assert v_ok.passed is True


def test_multimodal_and_badcase_loop() -> None:
    media = analyze_media_evidence("快递外包装破损面单.jpg", "边角磨破")
    assert media["suggested_intent"] == "logistics_issue"
    assert len(media["uncertainties"]) >= 1

    db = _make_store()
    saved = db.add_feedback(
        {
            "session_id": "s1",
            "message_id": "m1",
            "rating": "down",
            "tag": "SOP漏检",
            "user_query": "测试提问",
            "assistant_reply": "测试回复",
            "stage": "presales",
            "intent": "custom_order",
            "decision_trace": {"decision_rule_id": "DO-PRE-CUSTOM"},
        }
    )
    assert len(db.list_badcases()) == 1
    assert db.update_badcase(saved["id"], "resolved", "已补充异形方向确认规则") is True
    assert db.list_badcases()[0]["status"] == "resolved"


def test_attribution_engine() -> None:
    db = _make_store()
    board = build_attribution_dashboard(db)
    assert board["mode"] == "read_only_attribution"
    assert board["total_tickets"] >= 12
    assert len(board["sku_ranking"]) > 0
    assert len(board["emotion_leads"]) > 0
    assert any(c["rule"]["code"] == "DO-RC3" and c["count"] > 0 for c in board["rule_cards"])

    ans = answer_attribution_question("物流停滞超过48小时主要集中在哪些订单？", db)
    assert ans["rule"]["code"] == "DO-RC4"
    assert len(ans["cited_rows"]) > 0


def test_benchmark_20_cases() -> None:
    db = _make_store()
    res = asyncio.run(run_benchmark_suite(db))
    assert res["total_cases"] == 20
    assert res["stage_accuracy"] == 100.0, f"Stage accuracy {res['stage_accuracy']}%"
    assert res["intent_accuracy"] == 100.0, f"Intent accuracy {res['intent_accuracy']}%"
    assert res["keyword_pass_rate"] == 100.0, f"Keyword pass {res['keyword_pass_rate']}%"
    assert res["guardrail_pass_rate"] == 100.0, f"Guardrail pass {res['guardrail_pass_rate']}%"


if __name__ == "__main__":
    test_intent_routing_and_discounts()
    test_dual_ontology_guardrail()
    test_multimodal_and_badcase_loop()
    test_attribution_engine()
    test_benchmark_20_cases()
    print("ALL UPGRADED TESTS & 20-CASE BENCHMARK PASSED (100%)")
