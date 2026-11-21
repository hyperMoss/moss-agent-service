"""双本体（Service Ontology & Decision Ontology）与服务端二次校验护栏。

借鉴 Onto 的双本体与动作边界思想，针对地垫电商客服 SOP 提供确定性护栏：
1. Service Ontology：实体图谱、场景约束与歧义检测（缺订单号/缺定制方向时先澄清）。
2. Decision Ontology：允许/禁止动作边界（Allowed / Blocked Actions）与回复二次校验拦截。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.config import runtime_config
from app.models import StageType


SERVICE_ONTOLOGY: dict[str, Any] = {
    "entities": {
        "ProductCategory": ["丝圈地垫", "PVC防滑地垫", "硅藻泥软地垫", "铝合金商用门垫"],
        "OrderType": ["page_size", "custom"],
        "ProductionOwner": ["factory", "warehouse"],
        "WorkGroups": ["factory_group", "warehouse_group", "courier_group", "logo_group"],
    },
    "stage_nodes": {
        "presales": {
            "node_id": "SO-PRE-01",
            "name": "售前需求与定制确认本体",
            "required_slots_custom": ["材质", "长宽尺寸", "字体/条纹/异形方向", "3-5天发货确认"],
        },
        "insales": {
            "node_id": "SO-IN-01",
            "name": "售中履约与异常拦截本体",
            "requires_order_id": True,
        },
        "aftersales": {
            "node_id": "SO-AFTER-01",
            "name": "售后挽单与强制建表本体",
            "mandatory_ticket_registration": True,
        },
    },
}


DECISION_ONTOLOGY: dict[str, dict[str, Any]] = {
    "presales:page_size": {
        "rule_id": "DO-PRE-PAGE",
        "allowed_actions": ["推荐页面现货地垫", "提供不低于9.8折的优惠", "引导下单"],
        "blocked_actions": ["承诺低于9.8折的优惠", "未经核实承诺当日必达"],
        "min_discount": lambda: runtime_config.presales_page_min_discount,
    },
    "presales:custom_order": {
        "rule_id": "DO-PRE-CUSTOM",
        "allowed_actions": [
            "按材质面积计算定制报价",
            "确认字体横竖版/条纹纹路/异形方向",
            "手绘草图或对接LOGO群出效果图",
            "协商3-5天发货周期并备注工厂/仓库做货",
        ],
        "blocked_actions": ["未核对效果图直接承诺排产", "承诺24小时现货发出", "突破折扣权限"],
        "min_discount": lambda: runtime_config.presales_page_min_discount,
    },
    "insales:urge_shipment": {
        "rule_id": "DO-IN-SHIP",
        "allowed_actions": ["查询订单类型", "页面常规通知仓库发货", "有编号/定制通知工厂加急并防漏开料"],
        "blocked_actions": ["未查订单盲目承诺已发出"],
    },
    "insales:urge_logistics": {
        "rule_id": "DO-IN-LOGISTICS",
        "allowed_actions": ["发快递工作群跟进", "丢件交接售后补发", "停滞超48h交接售后核查"],
        "blocked_actions": ["把历史物流快照当作实时签收结论"],
    },
    "insales:change_address": {
        "rule_id": "DO-IN-ADDR",
        "allowed_actions": ["发货前直接改址", "发货后发快递群改址并提示需到原址转出"],
        "blocked_actions": ["发货后承诺改址不延长时效"],
    },
    "insales:change_product": {
        "rule_id": "DO-IN-PROD",
        "allowed_actions": ["发货前直接改单并通知仓库", "发货后页面尺寸拦截补发", "明确告知定制商品发货后不支持修改"],
        "blocked_actions": ["承诺已发货的定制订单可直接修改商品信息"],
    },
    "insales:invoice": {
        "rule_id": "DO-IN-INV",
        "allowed_actions": ["收集抬头税号邮箱", "登记线下发票表格"],
        "blocked_actions": ["跳过登记表直接口头承诺已开票"],
    },
    "aftersales:quality_issue": {
        "rule_id": "DO-AFTER-QUALITY",
        "allowed_actions": ["最高7折挽单补偿", "强制登记售后表", "按工厂/仓库归属反馈对应工作群", "办理退货退款/换货/补偿"],
        "blocked_actions": ["未经主管审批给出低于7折优惠", "未登记售后表即完结工单"],
        "min_discount": lambda: runtime_config.aftersales_quality_min_discount,
    },
    "aftersales:personal_issue": {
        "rule_id": "DO-AFTER-PERSONAL",
        "allowed_actions": ["解释色差/1-3cm误差/新料气味", "最高8折挽单补偿", "强制登记售后表", "办理退货退款/换货/补偿"],
        "blocked_actions": ["未经主管审批给出低于8折优惠", "未登记售后表即完结工单"],
        "min_discount": lambda: runtime_config.aftersales_personal_min_discount,
    },
    "aftersales:logistics_issue": {
        "rule_id": "DO-AFTER-LOGISTICS",
        "allowed_actions": ["优先挽单减少流失", "明确赔偿由快递承担并向快递追责", "强制登记售后表"],
        "blocked_actions": ["未核实快递破损责任即推诿客户"],
    },
}


@dataclass
class GuardrailVerdict:
    passed: bool
    violations: list[str] = field(default_factory=list)
    sanitized_reply: str = ""
    decision_rule_id: str = ""
    allowed_actions: list[str] = field(default_factory=list)
    blocked_actions: list[str] = field(default_factory=list)
    service_node_id: str = ""


def verify_response_and_actions(
    stage: StageType,
    intent: str,
    reply_text: str,
    order: dict[str, Any] | None = None,
) -> GuardrailVerdict:
    """服务端确定性二次校验：检查越权折扣承诺与违规业务动作，必要时拦截修正。"""
    key = f"{stage}:{intent}"
    rule = DECISION_ONTOLOGY.get(key, DECISION_ONTOLOGY["presales:page_size"])
    service_node = SERVICE_ONTOLOGY["stage_nodes"][stage]["node_id"]

    violations: list[str] = []
    min_disc_fn = rule.get("min_discount")
    if callable(min_disc_fn):
        min_disc = float(min_disc_fn())
        # 检测回复中是否出现“给您 X 折 / 申请 X 折 / 享受 X 折”且低于权限红线
        for m in re.finditer(r"(?:给您|为您|申请|享受|特批|优惠到|最低可给)[^\n。！？]{0,12}?(\d(?:\.\d)?)\s*折", reply_text):
            val = round(float(m.group(1)) / 10.0, 2)
            if val < min_disc:
                violations.append(
                    f"检测到越权折扣承诺（{m.group(1)}折 < 红线 {round(min_disc * 10, 1)}折），已触发服务端拦截。"
                )

    # 检测定制商品已发货却承诺可修改商品信息
    if (
        stage == "insales"
        and intent == "change_product"
        and order
        and order.get("status") != "unshipped"
        and order.get("order_type") == "custom"
    ):
        if "不支持修改" not in reply_text and "无法修改" not in reply_text:
            violations.append("已发货定制订单不可修改商品信息，回复缺少明确拦截说明。")

    sanitized = reply_text
    if violations:
        min_disc_val = round(float(min_disc_fn()) * 10, 1) if callable(min_disc_fn) else None
        notice = "\n\n> 【系统合规护栏提示】" + "；".join(violations)
        if min_disc_val:
            notice += f" 本场景客服最高权限为 {min_disc_val} 折，如需更低折扣请转主管审批。"
        sanitized = reply_text + notice

    return GuardrailVerdict(
        passed=len(violations) == 0,
        violations=violations,
        sanitized_reply=sanitized,
        decision_rule_id=rule["rule_id"],
        allowed_actions=rule["allowed_actions"],
        blocked_actions=rule["blocked_actions"],
        service_node_id=service_node,
    )
