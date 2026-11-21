"""多模态线索提取模块（借鉴 Onto media_understanding.py）。

支持上传地垫瑕疵图、色差对比图、定制效果图或快递破损面单图：
- 提取现象、疑似分类、尺寸/面单线索，并显式保留不确定项（uncertainties）。
- 未配置外部 VLM API 时基于文件名与说明提供确定性离线线索解析，保证全链路可测。
"""

from __future__ import annotations

from typing import Any


def analyze_media_evidence(
    filename: str,
    caption: str = "",
    media_type: str = "image",
) -> dict[str, Any]:
    text = f"{filename} {caption}".lower()
    clues: list[str] = []
    uncertainties: list[str] = []
    suggested_stage = "aftersales"
    suggested_intent = "quality_issue"

    if any(k in text for k in ["logo", "效果图", "草图", "定制", "design", "sketch"]):
        suggested_stage = "presales"
        suggested_intent = "custom_order"
        clues.append("识别为定制设计图/手绘草图，需重点核对字体横竖版、尺寸数值与裁剪方向。")
        uncertainties.append("图片未包含最终发货时效确认记录，需线上或电联确认 3-5 天发货周期。")
    elif any(k in text for k in ["破损", "外包装", "快递", "面单", "压坏", "waybill", "box"]):
        suggested_stage = "aftersales"
        suggested_intent = "logistics_issue"
        clues.append("识别为快递外包装破损/面单异常凭证，建议优先挽单并向快递工作群追责理赔。")
        uncertainties.append("需进一步核对签收时间及内物是否同步受损，以明确快递理赔金额。")
    elif any(k in text for k in ["色差", "尺寸", "误差", "尺子", "味道", "薄"]):
        suggested_stage = "aftersales"
        suggested_intent = "personal_issue"
        clues.append("识别为色差/裁剪误差(1-3cm)/厚度主观反馈凭证，适用个人问题最低 8 折挽单权限。")
        uncertainties.append("拍摄光线与测量起点存在主观差异，需结合订单规格核实是否超出 1-3cm 正常误差。")
    else:
        clues.append("识别为商品实拍瑕疵/质量反馈凭证（脱胶/开裂/印刷偏差等），适用品质问题最低 7 折挽单权限。")
        uncertainties.append("需结合订单记录确认做货归属（工厂做货 vs 仓库发错），再派发对应工作群。")

    return {
        "filename": filename,
        "media_type": media_type,
        "suggested_stage": suggested_stage,
        "suggested_intent": suggested_intent,
        "extracted_clues": clues,
        "uncertainties": uncertainties,
        "prompt_injection": (
            f"【多模态附件线索：{filename}】"
            + " ".join(clues)
            + (" 待确认项：" + " ".join(uncertainties) if uncertainties else "")
        ),
    }
