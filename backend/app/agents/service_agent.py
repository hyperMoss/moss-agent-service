"""基于 AgentScope 2.0 + 双本体决策护栏（Onto 架构融合）的多阶段智能客服引擎。"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import AsyncGenerator
from typing import Any

from app.config import runtime_config
from app.models import StageType
from app.ontology.dual_ontology import verify_response_and_actions
from app.sop.knowledge import HIGH_FREQ_SCRIPTS, SOP_TREE
from app.sop.router import RouteResult, route_intent
from app.store import CSStore, store as default_store
from app.tools.cs_tools import build_cs_tools

try:
    from agentscope.agent import Agent as ASAgent
    from agentscope.credential import DashScopeCredential, OpenAICredential
    from agentscope.event import EventType
    from agentscope.message import UserMsg
    from agentscope.model import DashScopeChatModel, OpenAIChatModel
    from agentscope.tool import Toolkit

    AGENTSCOPE_AVAILABLE = True
except ImportError:
    AGENTSCOPE_AVAILABLE = False


def build_system_prompt(stage: StageType, route: RouteResult, order_id: str | None) -> str:
    stage_meta = SOP_TREE[stage]
    sop_json = json.dumps(stage_meta, ensure_ascii=False, indent=2)
    order_hint = (
        f"\n当前会话已关联订单号：{order_id}，涉及订单状态、物流、改址、改品或售后登记时请主动调用工具查询或登记。"
        if order_id
        else ""
    )
    return (
        f"你是一名专业、温暖且严格遵守公司 SOP 与双本体动作边界的电商地垫智能客服专家。\n"
        f"当前识别阶段：【{stage_meta['title']}】，细分意图：【{route.intent}】。\n"
        f"请严格遵守以下 SOP 业务规范（严禁突破折扣红线，严禁编造订单状态）：\n{sop_json}\n"
        f"本次接待必检项：\n- " + "\n- ".join(route.checklist) + order_hint + "\n"
        f"回复要求：语气亲切自然（称呼“亲”），条理清晰，优先调用 Toolkit 工具核查订单、计算报价、校验折扣权限或登记售后/发票表格。"
    )


class CustomerServiceOrchestrator:
    """管理每个会话的 AgentScope 2.0 Agent 实例、双本体决策校验与流式推理。"""

    def __init__(self, db: CSStore | None = None) -> None:
        self.store = db or default_store

    def _create_agentscope_agent(self, system_prompt: str) -> Any:
        provider = runtime_config.effective_provider()
        if not AGENTSCOPE_AVAILABLE or provider == "demo":
            return None

        if provider == "dashscope":
            model = DashScopeChatModel(
                credential=DashScopeCredential(api_key=runtime_config.dashscope_api_key),
                model=runtime_config.dashscope_model,
            )
        else:
            model = OpenAIChatModel(
                credential=OpenAICredential(
                    api_key=runtime_config.openai_api_key,
                    base_url=runtime_config.openai_base_url,
                ),
                model=runtime_config.openai_model,
            )

        toolkit = Toolkit(tools=build_cs_tools(self.store))
        return ASAgent(
            name="MatCustomerServiceAgent",
            system_prompt=system_prompt,
            model=model,
            toolkit=toolkit,
        )

    def _extract_order_id(self, message: str, explicit_order_id: str | None) -> str | None:
        if explicit_order_id:
            return explicit_order_id.strip()
        match = re.search(r"DD\d{11}", message.upper())
        return match.group(0) if match else None

    def _match_scripts(self, stage: StageType) -> list[dict[str, str]]:
        return [s for s in HIGH_FREQ_SCRIPTS if s["stage"] == stage]

    def _run_demo_sop_engine(
        self,
        message: str,
        route: RouteResult,
        order_id: str | None,
    ) -> tuple[str, list[dict[str, Any]]]:
        tools = {fn.__name__: fn for fn in build_cs_tools(self.store)}
        traces: list[dict[str, Any]] = []

        def invoke(name: str, **kwargs: Any) -> dict[str, Any]:
            res = tools[name](**kwargs)
            traces.append({"tool_name": name, "arguments": kwargs, "result": res})
            return res

        if route.stage == "presales" and route.intent == "custom_order":
            dims = re.findall(r"(\d{2,3})\s*[*xX×]\s*(\d{2,3})", message)
            length_cm, width_cm = (float(dims[0][0]), float(dims[0][1])) if dims else (150.0, 200.0)
            has_logo = any(k in message.lower() for k in ["logo", "图案", "印字"])
            is_irregular = any(k in message for k in ["异形", "切角", "裁剪"])
            material = "铝合金商用门垫" if "铝" in message else ("硅藻泥软地垫" if "硅藻" in message else "丝圈地垫")
            quote = invoke(
                "quote_custom_mat",
                material=material,
                length_cm=length_cm,
                width_cm=width_cm,
                has_logo=has_logo,
                is_irregular_shape=is_irregular,
            )
            owner_cn = "工厂做货" if quote["production_owner"] == "factory" else "仓库做货"
            design_tip = (
                "因为包含图案/LOGO，我们会对接 **LOGO 群** 为您设计效果图，届时请重点核对 **字体、尺寸、方向** 三要素。"
                if has_logo
                else "卷材裁剪我们可以先手绘草图给您确认尺寸与方向。"
            )
            logo_part = f" + LOGO 制版费 ¥{quote['logo_fee']}" if has_logo else ""
            shape_part = f" + 异形裁剪费 ¥{quote['irregular_shape_fee']}" if is_irregular else ""
            reply = (
                f"亲您好～为您核算了一下定制方案参考报价：\n"
                f"- **推荐材质**：{quote['material']}（{quote['size_cm']}，面积 {quote['area_sqm']}㎡）\n"
                f"- **预估总价**：¥{quote['total_price']}（含单价 ¥{quote['unit_price_per_sqm']}/㎡{logo_part}{shape_part}）\n\n"
                f"为了确保成品准确无误，下单前需要和您确认以下 3 点：\n"
                f"1. **尺寸与方向**：请确认字体横版/竖版、条纹纹路方向及异形裁剪方向；{design_tip}\n"
                f"2. **协商发货时间**：每一单定制发货周期为 **3-5 天**，需要您线上确认（未确认我们会电话联系核实，避免超时）；\n"
                f"3. **排产备注**：确认后我们会为您在订单中备注定制信息并安排 **【{owner_cn}】**。"
            )
            return reply, traces

        if route.stage == "presales":
            disc_match = re.search(r"(\d(?:\.\d)?)\s*折", message)
            if disc_match:
                req_disc = round(float(disc_match.group(1)) / 10.0, 2)
                check = invoke(
                    "check_discount_authority",
                    scenario="presales_page_size",
                    requested_discount=req_disc,
                )
                reply = (
                    f"亲您好～页面常规尺寸地垫这边已经为您核查了优惠权限：\n"
                    f"- {check['advice']}\n"
                    f"您可以告诉我具体使用场景（入户门/厨房/商用大厅）和所需页面尺寸，我帮您挑最划算的现货款式哦！"
                )
                return reply, traces

            return SOP_TREE["presales"]["welcome"] + "\n\n（温馨提示：页面现货尺寸目前最高可为您申请 **9.8 折** 专属优惠哦～）", traces

        if route.stage == "insales":
            if route.intent == "invoice":
                oid = order_id or "DD20261119001"
                inv = invoke(
                    "register_invoice",
                    order_id=oid,
                    buyer_title="待核对客户抬头",
                    amount=188.0,
                    notes=f"客户留言：{message[:80]}",
                )
                return (
                    f"亲您好～线下开票需求已为您登记到【线下发票登记表】（记录编号 #{inv['invoice']['id']}，关联订单 `{oid}`）。\n"
                    f"麻烦再发我一下准确的 **开票抬头、税号和接收邮箱**，财务核对后会尽快为您开具发送哦！"
                ), traces

            if not order_id:
                return (
                    "亲您好～为了帮您准确核查订单发货/物流状态并按流程处理，麻烦先发一下您的 **订单号**（例如 `DD20261119001` 或 `DD20261116003`）哦！"
                ), traces

            order_res = invoke("query_order", order_id=order_id)
            if not order_res.get("found"):
                return f"亲，系统暂未查到订单 `{order_id}`，麻烦核对一下订单号是否正确哦～", traces

            if route.intent == "urge_shipment":
                res = invoke("handle_urge_shipment", order_id=order_id)
                return f"亲久等啦！已为您核查订单 `{order_id}` 并立即跟进：\n- {res.get('sop_action') or res.get('message')}\n有最新打包进度我第一时间同步您！", traces

            if route.intent == "urge_logistics":
                is_lost = "丢件" in message or "丢了" in message
                res = invoke("check_logistics_status", order_id=order_id, is_lost=is_lost)
                if res.get("need_aftersales_handover"):
                    return (
                        f"非常抱歉让您久等了亲！查询到订单 `{order_id}` 存在异常：**{res['reason']}**。\n"
                        f"我已把运单同步到对应快递工作群催查，并为您 **交接售后专员** 优先确认物流/安排补发，请您放心！"
                    ), traces
                return f"亲，已把订单 `{order_id}` 发至对应快递工作群催促派送，物流更新后马上通知您哦～", traces

            if route.intent == "change_address":
                res = invoke("request_address_change", order_id=order_id, new_address=message)
                return f"亲，关于订单 `{order_id}` 修改收货地址已处理：\n- {res['message']}", traces

            if route.intent == "change_product":
                res = invoke("request_product_change", order_id=order_id, new_product_info=message)
                return f"亲，关于订单 `{order_id}` 修改产品信息已核查：\n- {res.get('message') or res['notification']['summary']}", traces

        oid = order_id or "DD20261114004"
        order_res = invoke("query_order", order_id=oid)
        order = order_res.get("order") or {}
        owner = order.get("production_owner", "factory")

        if route.intent == "quality_issue":
            check = invoke("check_discount_authority", scenario="aftersales_quality", requested_discount=0.70)
            ticket = invoke(
                "register_after_sales_ticket",
                order_id=oid,
                category="quality",
                sub_reason=message[:60],
                source_party=owner,
                discount_offered=0.70,
                resolution="retention",
                notes="系统自动登记品质售后表并同步责任群",
            )
            party_cn = "工厂工作群" if owner == "factory" else "对应仓库"
            return (
                f"非常抱歉给您带来不好的体验亲！关于订单 `{oid}` 反馈的品质问题：\n"
                f"1. **优先挽单方案**：这边为您申请品质问题最高权限 **7 折优惠留用补偿**（{check['rule']}）；\n"
                f"2. **售后保障**：无论您选择补偿留用、换货还是退货退款，均已为您登记【售后登记表】（单号 `#{ticket['ticket']['id']}`），并已将产品问题与处理方案同步反馈至 **{party_cn}**。\n"
                f"请问您更倾向于 7 折补偿留用，还是安排换货/退货退款呢？"
            ), traces

        if route.intent == "logistics_issue":
            ticket = invoke(
                "register_after_sales_ticket",
                order_id=oid,
                category="logistics",
                sub_reason=message[:60],
                source_party="courier",
                resolution="retention",
                notes="物流问题：优先挽单，赔偿由快递承担，已登记售后表",
            )
            return (
                f"太抱歉了亲！快递途中导致包裹异常实在不好意思，我已为您登记【售后登记表】（单号 `#{ticket['ticket']['id']}`）并向快递工作群发起理赔追责（**赔偿部分由快递承担**，不会让您受损失）。\n"
                f"为了尽量节省您的时间，您看是为您申请 **补偿留用**，还是安排 **免费换货 / 退货退款** 呢？"
            ), traces

        check = invoke("check_discount_authority", scenario="aftersales_personal", requested_discount=0.80)
        ticket = invoke(
            "register_after_sales_ticket",
            order_id=oid,
            category="personal",
            sub_reason=message[:60],
            source_party="buyer",
            discount_offered=0.80,
            resolution="retention",
            notes="个人问题（色差/1-3cm误差/气味/厚度等），最高8折挽单并登记售后表",
        )
        return (
            f"亲非常理解您的感受～地垫属于手工裁剪与新品卷材，**1-3cm 正常误差、轻微光线色差或刚拆封的新料气味**（通风 2-3 天即可散去）都属于正常范围哦。\n"
            f"- 为表诚意，这边为您特批个人问题最高权限 **8 折优惠补偿留用**（{check['rule']}）；\n"
            f"- 同时已按流程为您登记【售后登记表】（单号 `#{ticket['ticket']['id']}`）。\n"
            f"您看留下来享受 8 折补贴可以吗？如果仍需 **换货或退货退款**，我马上为您跟进办理！"
        ), traces

    async def chat_stream(
        self,
        session_id: str,
        message: str,
        order_id: str | None = None,
        stage_hint: StageType | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        resolved_order_id = self._extract_order_id(message, order_id)
        route = route_intent(message, stage_hint=stage_hint)
        provider = runtime_config.effective_provider()
        scripts = self._match_scripts(route.stage)

        self.store.save_message(
            session_id=session_id,
            role="user",
            content=message,
            stage=route.stage,
            intent=route.intent,
        )

        yield {
            "event": "meta",
            "data": {
                "session_id": session_id,
                "stage": route.stage,
                "intent": route.intent,
                "order_id": resolved_order_id,
                "provider": provider,
                "checklist": route.checklist,
                "suggested_scripts": scripts,
            },
        }

        full_reply = ""
        tool_traces: list[dict[str, Any]] = []

        if provider != "demo" and AGENTSCOPE_AVAILABLE:
            try:
                system_prompt = build_system_prompt(route.stage, route, resolved_order_id)
                agent = self._create_agentscope_agent(system_prompt)
                user_msg = UserMsg(name="buyer", content=message)
                async for event in agent.reply_stream(user_msg):
                    if event.type == EventType.TEXT_BLOCK_DELTA:
                        delta = getattr(event, "delta", "") or getattr(event, "text", "")
                        if delta:
                            full_reply += delta
                            yield {"event": "delta", "data": {"text": delta}}
                    elif event.type == EventType.TOOL_CALL_START:
                        tool_info = {
                            "tool_name": getattr(event, "tool_name", "tool"),
                            "arguments": getattr(event, "arguments", {}),
                            "result": {},
                        }
                        tool_traces.append(tool_info)
                        yield {"event": "tool_call", "data": tool_info}
            except Exception as exc:  # noqa: BLE001
                fallback_reply, fallback_traces = self._run_demo_sop_engine(
                    message, route, resolved_order_id
                )
                tool_traces.extend(fallback_traces)
                for trace in fallback_traces:
                    yield {"event": "tool_call", "data": trace}
                full_reply = f"（已从 {provider} 降级至 SOP 兜底引擎：{exc}）\n\n{fallback_reply}"
                yield {"event": "delta", "data": {"text": full_reply}}
        else:
            demo_reply, demo_traces = self._run_demo_sop_engine(
                message, route, resolved_order_id
            )
            tool_traces = demo_traces
            for trace in demo_traces:
                yield {"event": "tool_call", "data": trace}
            chunk_size = 24
            for idx in range(0, len(demo_reply), chunk_size):
                chunk = demo_reply[idx : idx + chunk_size]
                full_reply += chunk
                yield {"event": "delta", "data": {"text": chunk}}
                await asyncio.sleep(0.01)

        # Onto 双本体动作边界与服务端确定性二次校验
        order_obj = self.store.get_order(resolved_order_id) if resolved_order_id else None
        verdict = verify_response_and_actions(route.stage, route.intent, full_reply, order=order_obj)
        if not verdict.passed:
            extra = verdict.sanitized_reply[len(full_reply) :]
            full_reply = verdict.sanitized_reply
            if extra:
                yield {"event": "delta", "data": {"text": extra}}

        decision_trace = {
            "service_node_id": verdict.service_node_id,
            "decision_rule_id": verdict.decision_rule_id,
            "allowed_actions": verdict.allowed_actions,
            "blocked_actions": verdict.blocked_actions,
            "guardrail_passed": verdict.passed,
            "violations": verdict.violations,
        }
        yield {"event": "decision_trace", "data": decision_trace}

        self.store.save_message(
            session_id=session_id,
            role="assistant",
            content=full_reply,
            stage=route.stage,
            intent=route.intent,
            tool_calls=tool_traces,
        )

        yield {
            "event": "done",
            "data": {
                "reply": full_reply,
                "stage": route.stage,
                "intent": route.intent,
                "tool_calls": tool_traces,
                "decision_trace": decision_trace,
            },
        }


orchestrator = CustomerServiceOrchestrator()
