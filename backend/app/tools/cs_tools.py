"""AgentScope 2.0 业务工具集：将客服 SOP 规则沉淀为可执行、可审计的 Tool 函数。"""

from __future__ import annotations

from typing import Any
from app.config import runtime_config
from app.store import CSStore, store as default_store


MATERIAL_UNIT_PRICE_PER_SQM = {
    "丝圈地垫": 68.0,
    "PVC防滑地垫": 78.0,
    "硅藻泥软地垫": 85.0,
    "铝合金商用门垫": 158.0,
}


def build_cs_tools(db: CSStore | None = None) -> list[Any]:
    """返回可注册到 AgentScope Toolkit(tools=...) 的业务函数列表。"""
    active_store = db or default_store

    def quote_custom_mat(
        material: str,
        length_cm: float,
        width_cm: float,
        has_logo: bool = False,
        is_irregular_shape: bool = False,
    ) -> dict[str, Any]:
        """根据地垫材质、尺寸、是否含LOGO及是否异形裁剪计算定制报价，并返回必须向客户确认的要点。"""
        unit_price = MATERIAL_UNIT_PRICE_PER_SQM.get(material, 78.0)
        area_sqm = max(round((length_cm / 100.0) * (width_cm / 100.0), 2), 0.3)
        logo_fee = 35.0 if has_logo else 0.0
        shape_fee = 25.0 if is_irregular_shape else 0.0
        total_price = round(area_sqm * unit_price + logo_fee + shape_fee, 2)

        confirm_steps = [
            "确认尺寸与方向：字体横版/竖版、条纹纹路方向、异形裁剪方向",
            "对接 LOGO 群设计出效果图给客户核对（字体、尺寸、方向三要素）"
            if has_logo
            else "卷材裁剪可手绘草图给客户确认尺寸与方向",
            "必须协商发货时间 3-5 天（线上确认，未确认须电联确认防超时赔付）",
            "订单备注定制商品信息并标注【工厂做货】或【仓库做货】",
        ]
        return {
            "material": material,
            "size_cm": f"{length_cm}x{width_cm}cm",
            "area_sqm": area_sqm,
            "unit_price_per_sqm": unit_price,
            "logo_fee": logo_fee,
            "irregular_shape_fee": shape_fee,
            "total_price": total_price,
            "production_owner": "factory" if (has_logo or is_irregular_shape) else "warehouse",
            "required_confirmations": confirm_steps,
        }

    def check_discount_authority(
        scenario: str,
        requested_discount: float,
    ) -> dict[str, Any]:
        """校验客服优惠权限红线。

        scenario 可选值：
        - presales_page_size: 售前页面尺寸（最低 0.98 即 9.8 折）
        - aftersales_quality: 售后品质问题挽单（最低 0.70 即 7 折）
        - aftersales_personal: 售后个人问题挽单（最低 0.80 即 8 折）
        """
        limits = {
            "presales_page_size": (
                runtime_config.presales_page_min_discount,
                "页面尺寸客服最高优惠权限为 9.8 折",
            ),
            "aftersales_quality": (
                runtime_config.aftersales_quality_min_discount,
                "售后品质问题挽单最低权限为 7 折，且必须登记售后表格",
            ),
            "aftersales_personal": (
                runtime_config.aftersales_personal_min_discount,
                "售后个人问题挽单最低权限为 8 折，且必须登记售后表格",
            ),
        }
        min_allowed, rule_desc = limits.get(
            scenario, (runtime_config.presales_page_min_discount, "默认最高 9.8 折")
        )
        approved = requested_discount >= min_allowed
        return {
            "scenario": scenario,
            "requested_discount": requested_discount,
            "min_allowed_discount": min_allowed,
            "approved": approved,
            "rule": rule_desc,
            "advice": (
                f"在权限内，可提供 {round(requested_discount * 10, 1)} 折优惠。"
                if approved
                else f"超出客服权限！最低仅可给到 {round(min_allowed * 10, 1)} 折，如需更低折扣请升级主管审批。"
            ),
        }

    def query_order(order_id: str) -> dict[str, Any]:
        """查询订单详情（订单类型、是否定制、发货状态、物流停滞时长、做货归属等）。"""
        order = active_store.get_order(order_id)
        if not order:
            return {"found": False, "order_id": order_id, "message": "未找到该订单号，请核对后重试。"}
        return {"found": True, "order": order}

    def handle_urge_shipment(order_id: str) -> dict[str, Any]:
        """处理售中催发货：根据页面尺寸/有编号/定制订单自动派发对应工作群通知。"""
        order = active_store.get_order(order_id)
        if not order:
            return {"ok": False, "message": f"未找到订单 {order_id}"}

        if order["status"] != "unshipped":
            return {
                "ok": True,
                "action": "already_shipped",
                "message": f"订单 {order_id} 已发货（{order['courier']} {order['tracking_no']}），已转为物流跟进。",
            }

        if order["order_type"] == "custom":
            group = "factory_group"
            summary = f"【定制催发】订单 {order_id} 通知工厂加急做货，请同步核查避免仓库漏开料。"
        elif order["has_code"]:
            group = "factory_group"
            summary = f"【页面有编号催发】订单 {order_id} 通知工厂加急生产。"
        else:
            group = "warehouse_group"
            summary = f"【页面常规尺寸催发】订单 {order_id} 通知仓库尽快安排发货。"

        notice = active_store.add_notification(group, order_id, summary)
        return {"ok": True, "notification": notice, "sop_action": summary}

    def check_logistics_status(order_id: str, is_lost: bool = False) -> dict[str, Any]:
        """核查售中物流状态：识别丢件或停滞超 48 小时并自动派发快递工作群/交接售后。"""
        order = active_store.get_order(order_id)
        if not order:
            return {"ok": False, "message": f"未找到订单 {order_id}"}

        stalled_hours = order["logistics_stalled_hours"]
        threshold = runtime_config.logistics_stall_hours_threshold

        if is_lost:
            notice = active_store.add_notification(
                "courier_group",
                order_id,
                f"【物流丢件】{order['courier']} {order['tracking_no']} 确认丢件，已交接售后补发。",
            )
            return {
                "ok": True,
                "need_aftersales_handover": True,
                "reason": "丢件需交接售后补发",
                "notification": notice,
            }

        if stalled_hours >= threshold:
            notice = active_store.add_notification(
                "courier_group",
                order_id,
                f"【物流停滞超{threshold}h】{order['courier']} {order['tracking_no']} 已停滞 {stalled_hours} 小时，已发快递群并交接售后确认物流是否正常。",
            )
            return {
                "ok": True,
                "stalled_hours": stalled_hours,
                "need_aftersales_handover": True,
                "reason": f"物流停滞超过 {threshold} 小时，已交接售后核实",
                "notification": notice,
            }

        notice = active_store.add_notification(
            "courier_group",
            order_id,
            f"【常规催物流】{order['courier']} {order['tracking_no']} 已发对应快递工作群跟进派送。",
        )
        return {
            "ok": True,
            "stalled_hours": stalled_hours,
            "need_aftersales_handover": False,
            "notification": notice,
        }

    def request_address_change(order_id: str, new_address: str) -> dict[str, Any]:
        """处理修改收货地址：区分发货前（直接更新）与发货后（发快递群改址并提示时效变长）。"""
        order = active_store.get_order(order_id)
        if not order:
            return {"ok": False, "message": f"未找到订单 {order_id}"}

        if order["status"] == "unshipped":
            active_store.update_order_address(order_id, new_address)
            return {
                "ok": True,
                "phase": "before_shipment",
                "message": "订单尚未发货，已直接为您更新收货地址，请买家确认无误后完结。",
                "new_address": new_address,
            }

        notice = active_store.add_notification(
            "courier_group",
            order_id,
            f"【发货后改址】{order['courier']} {order['tracking_no']} 最终收货地址变更为：{new_address}",
        )
        return {
            "ok": True,
            "phase": "after_shipment",
            "message": "已将最终收货地址发至对应快递工作群通知修改；须告知买家需到达原地址后才能转出，时效会较长。",
            "notification": notice,
        }

    def request_product_change(order_id: str, new_product_info: str) -> dict[str, Any]:
        """处理修改产品信息：发货前直接修改通知仓库；发货后页面尺寸拦截补发，定制订单不支持修改。"""
        order = active_store.get_order(order_id)
        if not order:
            return {"ok": False, "message": f"未找到订单 {order_id}"}

        if order["status"] == "unshipped":
            active_store.update_order_product(order_id, new_product_info)
            notice = active_store.add_notification(
                "warehouse_group",
                order_id,
                f"【发货前改商品】订单 {order_id} 已修改为：{new_product_info}，请仓库按新信息发货。",
            )
            return {"ok": True, "allowed": True, "phase": "before_shipment", "notification": notice}

        if order["order_type"] == "custom":
            return {
                "ok": True,
                "allowed": False,
                "phase": "after_shipment_custom",
                "message": "定制商品已发出，按 SOP 规定定制商品不支持修改商品信息。",
            }

        notice = active_store.add_notification(
            "courier_group",
            order_id,
            f"【页面尺寸发货后改品】拦截运单号 {order['tracking_no']}，交接售后按新商品（{new_product_info}）重新补发。",
        )
        return {
            "ok": True,
            "allowed": True,
            "phase": "after_shipment_page_size",
            "message": "已申请拦截已发货运单号，并交接售后重新补发，请告知买家处理流程。",
            "notification": notice,
        }

    def register_after_sales_ticket(
        order_id: str,
        category: str,
        sub_reason: str,
        source_party: str = "buyer",
        discount_offered: float | None = None,
        resolution: str = "retention",
        notes: str = "",
    ) -> dict[str, Any]:
        """登记售后表格（品质/个人/物流问题无论是否处理完毕均须登记），并在品质问题时同步反馈工厂/仓库工作群。"""
        record = active_store.add_after_sales_ticket(
            {
                "order_id": order_id,
                "category": category,
                "sub_reason": sub_reason,
                "source_party": source_party,
                "discount_offered": discount_offered,
                "resolution": resolution,
                "notes": notes,
            }
        )
        notification = None
        if category == "quality":
            group = "factory_group" if source_party == "factory" else "warehouse_group"
            notification = active_store.add_notification(
                group,
                order_id,
                f"【品质售后反馈】订单 {order_id} 反馈：{sub_reason}，处理方案：{resolution}（挽单折扣：{discount_offered or '无'}）。",
            )
        elif category == "logistics":
            notification = active_store.add_notification(
                "courier_group",
                order_id,
                f"【物流售后追责】订单 {order_id} 反馈：{sub_reason}，赔偿由快递承担，处理方案：{resolution}。",
            )
        return {"ok": True, "ticket": record, "notification": notification}

    def register_invoice(
        order_id: str,
        buyer_title: str,
        amount: float,
        tax_id: str = "",
        email: str = "",
        notes: str = "",
    ) -> dict[str, Any]:
        """登记线下开票表格。"""
        record = active_store.add_invoice_record(
            {
                "order_id": order_id,
                "buyer_title": buyer_title,
                "tax_id": tax_id,
                "amount": amount,
                "email": email,
                "notes": notes,
            }
        )
        return {"ok": True, "invoice": record}

    return [
        quote_custom_mat,
        check_discount_authority,
        query_order,
        handle_urge_shipment,
        check_logistics_status,
        request_address_change,
        request_product_change,
        register_after_sales_ticket,
        register_invoice,
    ]
