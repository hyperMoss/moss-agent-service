"""基于规则与关键词的快速意图路由模块（售前 / 售中 / 售后）。"""

from __future__ import annotations

from dataclasses import dataclass
from app.models import StageType


@dataclass
class RouteResult:
    stage: StageType
    intent: str
    checklist: list[str]


INTENT_RULES: list[tuple[StageType, str, list[str], list[str]]] = [
    # 售后优先匹配（避免“定制地垫有味道/破损”被误判到售前）
    (
        "aftersales",
        "logistics_issue",
        ["签收未收到", "没收到", "少件", "破损", "外包装", "压坏", "脏了", "漏发"],
        [
            "核查物流破损/少件/签收未收到凭证",
            "优先挽单避免订单流失，赔偿部分由快递承担",
            "登记售后表格并确认结果（退货退款/换货/补偿）",
        ],
    ),
    (
        "aftersales",
        "quality_issue",
        ["质量问题", "品质", "脱胶", "开裂", "起边", "印刷错", "做错了", "瑕疵", "坏了"],
        [
            "核实问题归属（工厂做货 vs 仓库发错）",
            "优先挽单（品质问题最低权限 7 折）",
            "无论是否处理好，均须登记售后表格",
            "将问题与处理方案反馈至对应工厂/仓库工作群",
        ],
    ),
    (
        "aftersales",
        "personal_issue",
        ["色差", "误差", "味道", "臭", "太薄", "厚度不足", "质量差", "不想要", "退货", "退款", "换货"],
        [
            "针对色差/1-3cm误差/新货气味/厚度进行安抚解释",
            "优先挽单（个人问题最低权限 8 折）",
            "登记售后表格并记录处理结果（退货退款/换货/补偿）",
        ],
    ),
    # 售中部分
    (
        "insales",
        "urge_logistics",
        ["物流", "快递", "不动", "停滞", "丢件", "几天没更新", "运单"],
        [
            "定位对应快递工作群跟进",
            "若确认丢件 -> 交接售后补发",
            "若物流停滞超过 48 小时 -> 交接售后确认物流是否正常",
        ],
    ),
    (
        "insales",
        "change_address",
        ["改地址", "修改地址", "换地址", "收货地址", "寄错地址"],
        [
            "确认订单是否已发货",
            "发货前：引导买家自主修改或客服代改，确认无误完结",
            "发货后：发送最终地址至快递群并告知需到原址后转出（时效较长）",
        ],
    ),
    (
        "insales",
        "change_product",
        ["改尺寸", "改颜色", "修改商品", "修改产品", "换款", "拍错了"],
        [
            "确认订单是否已发货及是否为定制订单",
            "发货前：直接改单并通知仓库按新信息发货",
            "发货后-页面尺寸：拦截运单号并交接售后补发",
            "发货后-定制订单：告知定制商品不支持修改商品信息",
        ],
    ),
    (
        "insales",
        "urge_shipment",
        ["催发货", "什么时候发", "怎么还没发", "加急", "发了吗"],
        [
            "核查订单类型（页面尺寸 vs 定制订单）",
            "页面尺寸：通知仓库发货（有编号的通知工厂加急）",
            "定制订单：通知工厂加急做，重点排查仓库是否漏开料",
        ],
    ),
    (
        "insales",
        "invoice",
        ["发票", "开票", "普票", "专票", "抬头", "税号"],
        [
            "收集开票抬头、税号、金额及邮箱",
            "线下开票必须登记发票表格",
        ],
    ),
    # 售前部分
    (
        "presales",
        "custom_order",
        ["定制", "定做", "logo", "LOGO", "异形", "裁剪", "效果图", "横版", "竖版", "条纹", "报价"],
        [
            "根据不同产品材质/规格给出报价",
            "确认尺寸方向：字体横竖版 / 条纹纹路 / 异形裁剪方向（卷材手绘草图，含LOGO对接LOGO群出效果图）",
            "核对产品效果图：字体、尺寸、方向三要素",
            "协商发货时间 3-5 天（线上确认，未确认须电联确认防赔付）",
            "订单备注定制信息并区分【工厂做货】或【仓库做货】",
        ],
    ),
    (
        "presales",
        "page_size",
        ["优惠", "打折", "便宜", "多少钱", "推荐", "尺寸", "地垫", "你好", "在吗"],
        [
            "发送热情欢迎语并了解使用场景与需求",
            "推荐合适地垫款式",
            "页面尺寸客服拥有最低 9.8 折优惠权限",
        ],
    ),
]


def route_intent(message: str, stage_hint: StageType | None = None) -> RouteResult:
    """根据客户消息快速识别阶段与意图。"""
    text = message.strip().lower()
    for stage, intent, keywords, checklist in INTENT_RULES:
        if stage_hint and stage != stage_hint:
            continue
        if any(kw.lower() in text for kw in keywords):
            return RouteResult(stage=stage, intent=intent, checklist=checklist)

    # 若指定了 stage_hint 但未命中细分关键词，回退至该阶段默认意图
    if stage_hint == "insales":
        return RouteResult(
            stage="insales",
            intent="urge_shipment",
            checklist=["查询订单状态与发货进度", "根据页面尺寸/定制类型通知对应部门"],
        )
    if stage_hint == "aftersales":
        return RouteResult(
            stage="aftersales",
            intent="quality_issue",
            checklist=["判断售后类型（品质/个人/物流）", "按权限挽单并登记售后表格"],
        )

    # 二次全局扫描（忽略 stage_hint）
    for stage, intent, keywords, checklist in INTENT_RULES:
        if any(kw.lower() in text for kw in keywords):
            return RouteResult(stage=stage, intent=intent, checklist=checklist)

    return RouteResult(
        stage="presales",
        intent="page_size",
        checklist=[
            "发送欢迎语并了解客户需求（页面尺寸或定制需求）",
            "页面尺寸最高可给 9.8 折优惠",
        ],
    )
