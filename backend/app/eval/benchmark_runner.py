"""可追溯评测与回归测试执行器（支持内置地垫 SOP 评测集与 Hugging Face 公开客服数据集）。"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.agents.service_agent import CustomerServiceOrchestrator
from app.ontology.dual_ontology import verify_response_and_actions
from app.sop.router import route_intent
from app.store import CSStore

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
BUILTIN_DATASET_PATH = DATA_DIR / "mat_cs_eval_dataset.jsonl"

PUBLIC_DATASET_CATALOG = [
    {
        "id": "builtin-mat-sop-v1",
        "name": "地垫电商全链路 SOP 与越权护栏评测集（内置）",
        "source_url": "local://backend/data/mat_cs_eval_dataset.jsonl",
        "language": "zh-CN",
        "size": 20,
        "description": "覆盖售前定制报价/9.8折红线、售中催发/48h物流停滞/改址/定制不可改、售后品质7折/个人8折/物流破损与高情绪场景。",
    },
    {
        "id": "hf-sea-ecommerce-sample",
        "name": "SEA Multilingual E-commerce Customer Support Sample",
        "source_url": "https://huggingface.co/datasets/dinesshxryu/sea-ecommerce-customer-support-sample",
        "language": "zh / en / ms / id",
        "size": 1000,
        "description": "Hugging Face 公开多语言电商客服对话样本（含中文 CSV/JSONL），可通过 backend/scripts/download_dataset.py 一键拉取并转换。",
    },
    {
        "id": "hf-alibaba-ecombench",
        "name": "Alibaba-NLP/EcomBench",
        "source_url": "https://huggingface.co/datasets/Alibaba-NLP/EcomBench",
        "language": "zh-CN",
        "size": 100,
        "description": "阿里通义实验室开源的中文电商综合评测基准（涵盖政策咨询、智能选品、成本与定价等维度）。",
    },
]


def load_eval_cases(dataset_path: Path | None = None) -> list[dict[str, Any]]:
    path = dataset_path or BUILTIN_DATASET_PATH
    if not path.exists():
        return []
    cases = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            cases.append(json.loads(line))
    return cases


async def run_benchmark_suite(db: CSStore | None = None) -> dict[str, Any]:
    """执行全量自动化回归测试，返回路由准确率、边界护栏通过率与逐条用例轨迹。"""
    cases = load_eval_cases()
    orch = CustomerServiceOrchestrator(db=db)
    results: list[dict[str, Any]] = []
    stage_hits = 0
    intent_hits = 0
    guardrail_passes = 0
    keyword_hits = 0

    for case in cases:
        t0 = time.perf_counter()
        route = route_intent(case["query"])
        reply_text = ""
        tool_names: list[str] = []

        async for evt in orch.chat_stream(
            session_id=f"eval-{case['id']}",
            message=case["query"],
            order_id=case.get("order_id"),
        ):
            if evt["event"] == "tool_call":
                tool_names.append(evt["data"].get("tool_name", ""))
            elif evt["event"] == "done":
                reply_text = evt["data"].get("reply", "")

        order = orch.store.get_order(case["order_id"]) if case.get("order_id") else None
        verdict = verify_response_and_actions(route.stage, route.intent, reply_text, order=order)

        stage_ok = route.stage == case["expected_stage"]
        intent_ok = route.intent == case["expected_intent"]
        must_contain = case.get("must_contain", [])
        kw_ok = all(kw in reply_text for kw in must_contain)

        stage_hits += int(stage_ok)
        intent_hits += int(intent_ok)
        guardrail_passes += int(verdict.passed)
        keyword_hits += int(kw_ok)

        results.append(
            {
                "id": case["id"],
                "category": case["category"],
                "query": case["query"],
                "expected_stage": case["expected_stage"],
                "actual_stage": route.stage,
                "expected_intent": case["expected_intent"],
                "actual_intent": route.intent,
                "stage_ok": stage_ok,
                "intent_ok": intent_ok,
                "keyword_ok": kw_ok,
                "guardrail_ok": verdict.passed,
                "decision_rule_id": verdict.decision_rule_id,
                "tools_invoked": tool_names,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                "reply_preview": reply_text[:140],
            }
        )

    total = max(len(cases), 1)
    return {
        "total_cases": len(cases),
        "stage_accuracy": round(stage_hits / total * 100, 1),
        "intent_accuracy": round(intent_hits / total * 100, 1),
        "keyword_pass_rate": round(keyword_hits / total * 100, 1),
        "guardrail_pass_rate": round(guardrail_passes / total * 100, 1),
        "catalog": PUBLIC_DATASET_CATALOG,
        "cases": results,
    }
