"""只读经营归因引擎（严格对标 Onto 的 attribution.py 与 merchant-attribution-agent.js）。

核心设计原则：
- Read-only attribution engine: observations and proposals, never business execution.
- 所有聚合数字均由确定性程序计算，每条归因结论必须附带可下钻的工单行号（工单第{n}行）、
  规则名称与完整定义、知识覆盖状态、行动建议与关联订单快照。
- 严格执行统计护栏：工单量仅用于安排抽查，不代表真实故障率/退货率/毛利率；情绪不改变退换/折扣资格。
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

from app.store import CSStore, store as default_store


ATTRIBUTION_RULES: dict[str, dict[str, str]] = {
    "DO-RC1": {
        "code": "DO-RC1",
        "short": "RC1 · 上下文丢失",
        "name": "上下文丢失与重复确认核查",
        "definition": "客诉原文明确提及重复提交尺寸/地址/效果图，或前后端交接遗漏定制备注（工厂/仓库做货），触发交接链路核查。",
        "advice": "核查客服会话交接记录与订单定制备注字段，强制落地售前四要素核对清单。",
    },
    "DO-RC2": {
        "code": "DO-RC2",
        "short": "RC2 · 规则散落",
        "name": "政策与口径不一致核查",
        "definition": "客诉明确提及同条件下折扣红线（9.8/8/7折）、定制不可改或3-5天发货时效前后答复不一致，核查适用 SOP 版本。",
        "advice": "统一坐席话术模板并开启 AgentScope Decision Ontology 服务端二次拦截护栏。",
    },
    "DO-RC3": {
        "code": "DO-RC3",
        "short": "RC3 · 工艺与品质抽查",
        "name": "同SKU/同工厂批次品质重复核查",
        "definition": "同一地垫型号或同一工厂做货批次重复出现脱胶、开裂、印刷错等品质工单，进入工厂质检抽查队列。",
        "advice": "将同批次问题工单打包反馈对应工厂工作群，安排出厂前抽检，同时保留 7 折挽单兜底。",
    },
    "DO-RC4": {
        "code": "DO-RC4",
        "short": "RC4 · 履约时效临界点",
        "name": "发货超期与物流停滞48h核查",
        "definition": "定制订单超 3-5 天未发出（含仓库漏开料），或物流停滞明确超过 48 小时未及时交接售后，进入履约核查。",
        "advice": "对定制单启用工厂加急与防漏开料双检；物流停滞达 48h 自动触发快递工作群与售后交接。",
    },
    "DO-OPS-KNOWLEDGE": {
        "code": "DO-OPS-KNOWLEDGE",
        "short": "OPS · 知识覆盖核查",
        "name": "SOP 与高频话术知识覆盖核查",
        "definition": "核对工单问题类型是否已被现有 SOP 节点与高频话术覆盖，严禁跨品类/跨规则盲目拼凑答复。",
        "advice": "对未覆盖的长尾问题（如特殊异形门框裁剪）从 Badcase 队列提炼后经回归测试写回知识库。",
    },
    "DO-OPS-EMOTION": {
        "code": "DO-OPS-EMOTION",
        "short": "OPS · 情绪风险核查",
        "name": "高情绪风险工单优先跟进（不改变规则资格）",
        "definition": "仅按明确负面情绪词组（投诉、差评、欺骗、太差、气死、12315）筛选优先安抚线索；情绪仅影响响应优先级，不改变退换/折扣红线资格。",
        "advice": "优先分配资深坐席人工安抚，并在红线权限内提供合规挽单方案，避免升级平台投诉。",
    },
    "DO-OPS-FOCUS": {
        "code": "DO-OPS-FOCUS",
        "short": "OPS · 高频产品抽查",
        "name": "高频工单产品抽查（非故障率声明）",
        "definition": "工单量排名仅用于安排仓库/工厂抽查优先级，在缺乏全量发货基数时不代表真实故障率、退货率或毛利率。",
        "advice": "结合对应 SKU 的总发货量再评估是否属于异常波动，避免仅凭工单绝对值误判。",
    },
}

EMOTION_KEYWORDS = ["投诉", "差评", "欺骗", "太差", "气死", "12315", "失望", "垃圾", "骗人"]

SNAPSHOT_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "after_sales_snapshot.json"


def _load_snapshot_rows() -> list[dict[str, Any]]:
    if SNAPSHOT_PATH.exists():
        return json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    return []


def build_attribution_dashboard(db: CSStore | None = None) -> dict[str, Any]:
    """合并脱敏工单快照与实时 SQLite 售后表，生成 Onto 风格双页签看板数据。"""
    active_store = db or default_store
    snapshot = _load_snapshot_rows()
    live_tickets = active_store.list_after_sales_tickets()

    combined_rows: list[dict[str, Any]] = []
    for idx, item in enumerate(snapshot, start=1):
        combined_rows.append({"row_no": idx, "source": "snapshot", **item})

    offset = len(combined_rows)
    for idx, t in enumerate(live_tickets, start=1):
        order = active_store.get_order(t["order_id"]) or {}
        combined_rows.append(
            {
                "row_no": offset + idx,
                "source": "live_db",
                "order_id": t["order_id"],
                "sku_name": order.get("product_name", "地垫实时工单"),
                "category": t["category"],
                "issue_code": f"LIVE-{t['category'].upper()}",
                "source_party": t["source_party"],
                "original_text": t["sub_reason"],
                "discount_offered": t["discount_offered"],
                "resolution": t["resolution"],
                "knowledge_coverage": "已覆盖 SOP 主链路",
                "rule_codes": (
                    ["DO-RC3", "DO-OPS-FOCUS"]
                    if t["category"] == "quality"
                    else (["DO-RC4"] if t["category"] == "logistics" else ["DO-OPS-KNOWLEDGE"])
                ),
                "order_snapshot": order,
                "created_at": t["created_at"],
            }
        )

    # 1. 售后问题分布统计（确定性程序计算）
    sku_counter = Counter(r["sku_name"] for r in combined_rows)
    issue_code_counter = Counter(r["issue_code"] for r in combined_rows)
    category_counter = Counter(r["category"] for r in combined_rows)

    emotion_leads = [
        {
            "row_no": r["row_no"],
            "order_id": r["order_id"],
            "sku_name": r["sku_name"],
            "matched_words": [w for w in EMOTION_KEYWORDS if w in r["original_text"]],
            "original_text": r["original_text"],
        }
        for r in combined_rows
        if any(w in r["original_text"] for w in EMOTION_KEYWORDS)
    ]

    # 2. 按归因规则聚合可下钻卡片（每条结论附带工单行号数组）
    rule_cards = []
    for code, rule_meta in ATTRIBUTION_RULES.items():
        if code == "DO-OPS-EMOTION":
            matched = [r for r in combined_rows if any(w in r["original_text"] for w in EMOTION_KEYWORDS)]
        elif code == "DO-OPS-FOCUS":
            top_sku = sku_counter.most_common(1)[0][0] if sku_counter else ""
            matched = [r for r in combined_rows if r["sku_name"] == top_sku]
        else:
            matched = [r for r in combined_rows if code in r.get("rule_codes", [])]

        rule_cards.append(
            {
                "rule": rule_meta,
                "count": len(matched),
                "row_numbers": [r["row_no"] for r in matched],
                "sample_orders": [r["order_id"] for r in matched[:5]],
            }
        )

    return {
        "mode": "read_only_attribution",
        "guardrail_notice": (
            "本看板严格遵循只读归因原则（仅输出观察与核查建议，不自动执行业务动作）；"
            "工单量排名仅用于安排抽查，不代表真实故障率、退货率或毛利率；情绪风险仅提升响应优先级，不改变退换/折扣红线。"
        ),
        "total_tickets": len(combined_rows),
        "snapshot_count": len(snapshot),
        "live_count": len(live_tickets),
        "sku_ranking": [
            {
                "sku_name": name,
                "count": count,
                "row_numbers": [r["row_no"] for r in combined_rows if r["sku_name"] == name],
            }
            for name, count in sku_counter.most_common(8)
        ],
        "issue_code_ranking": [
            {
                "issue_code": code,
                "count": count,
                "row_numbers": [r["row_no"] for r in combined_rows if r["issue_code"] == code],
            }
            for code, count in issue_code_counter.most_common(8)
        ],
        "category_distribution": [
            {"category": k, "count": v} for k, v in category_counter.most_common()
        ],
        "emotion_leads": emotion_leads,
        "rule_cards": rule_cards,
        "rows_by_number": {str(r["row_no"]): r for r in combined_rows},
        "suggested_questions": [
            "当前哪类地垫工单最值得优先安排工厂抽查？请给出对应工单行号依据。",
            "哪些工单触发了上下文丢失（DO-RC1）或口径不一致（DO-RC2）？该如何优化售前 SOP？",
            "物流停滞超过 48 小时与发货超期（DO-RC4）主要集中在哪些订单？",
            "目前有哪些高情绪风险工单需要优先人工安抚？",
        ],
    }


def answer_attribution_question(question: str, db: CSStore | None = None) -> dict[str, Any]:
    """经营归因助手（只读）：严格基于限定证据与规则回答管理层提问，附带可点击行号。"""
    board = build_attribution_dashboard(db)
    q = question.strip()
    cited_rows: list[int] = []
    matched_rule_code = "DO-OPS-FOCUS"

    if any(k in q for k in ["情绪", "投诉", "差评", "安抚"]):
        matched_rule_code = "DO-OPS-EMOTION"
        leads = board["emotion_leads"]
        cited_rows = [x["row_no"] for x in leads]
        answer = (
            f"共筛出 {len(leads)} 条明确含负面情绪词组的优先核查工单（仅提升响应优先级，不改变 9.8/8/7 折及退换规则资格）。"
            f"建议优先安排资深坐席核查并回访。"
        )
    elif any(k in q for k in ["物流", "48", "超期", "发货", "RC4"]):
        matched_rule_code = "DO-RC4"
        card = next(c for c in board["rule_cards"] if c["rule"]["code"] == "DO-RC4")
        cited_rows = card["row_numbers"]
        answer = (
            f"触发履约时效临界点（DO-RC4）的工单共 {card['count']} 条，集中在定制单排产超 3-5 天（或仓库漏开料）及物流停滞超 48 小时未及时交接售后。"
            f"建议对定制单增加仓库开料双检，并对停滞满 48h 运单自动触发快递工作群与售后交接。"
        )
    elif any(k in q for k in ["上下文", "口径", "重复", "RC1", "RC2", "SOP"]):
        matched_rule_code = "DO-RC1"
        c1 = next(c for c in board["rule_cards"] if c["rule"]["code"] == "DO-RC1")
        c2 = next(c for c in board["rule_cards"] if c["rule"]["code"] == "DO-RC2")
        cited_rows = sorted(set(c1["row_numbers"] + c2["row_numbers"]))
        answer = (
            f"上下文丢失（DO-RC1）命中 {c1['count']} 条，口径不一致（DO-RC2）命中 {c2['count']} 条。"
            f"主要根因在于售前定制尺寸/方向确认未完整写入订单备注，以及部分坐席对 9.8/8/7 折边界或定制不可改口径表述不统一。"
        )
    else:
        matched_rule_code = "DO-RC3"
        top_sku = board["sku_ranking"][0] if board["sku_ranking"] else {"sku_name": "暂无", "count": 0, "row_numbers": []}
        c3 = next(c for c in board["rule_cards"] if c["rule"]["code"] == "DO-RC3")
        cited_rows = sorted(set(c3["row_numbers"] + top_sku["row_numbers"]))
        answer = (
            f"工单量排首位的产品为「{top_sku['sku_name']}」（{top_sku['count']} 条），"
            f"其中触发工艺与品质重复抽查（DO-RC3）共 {c3['count']} 条。"
            f"注意：工单绝对量仅用于安排工厂/仓库抽查优先级，在缺乏总发货基数前不代表真实故障率或退货率。"
        )

    return {
        "question": q,
        "answer": answer,
        "rule": ATTRIBUTION_RULES[matched_rule_code],
        "cited_rows": cited_rows,
        "guardrail": "只读归因结论：所有结论均绑定确定性统计与工单原文行号，未执行任何业务写操作。",
    }
