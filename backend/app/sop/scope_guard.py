"""Fail closed before model/tool execution on questions outside store service."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

SCOPE_REPLY = "亲，我只能协助本店商品、地垫定制、订单、物流、开票和售后相关问题，无法回答数学题或其他生活问题。请告诉我您要咨询的商品或订单问题。"
BUSINESS = re.compile(
    r"地垫|门垫|丝圈|硅藻泥|铝合金|pvc|商品|产品|订单|订货|定制|定做|报价|"
    r"尺寸|材质|防滑|吸水|厚度|色差|脱胶|开裂|瑕疵|质量|品质|面积|单价|总价|合计|总额|数量|"
    r"物流|快递|运单|包裹|签收|发货|催发|收货|改地址|修改地址|"
    r"改尺寸|改颜色|修改商品|修改产品|换款|拍错|退款|退货|换货|补发|售后|"
    r"发票|开票|抬头|税号|优惠|打折|折扣|logo|效果图|草图|裁剪|"
    r"图案|字体|条纹|方向|印刷|工厂|仓库|做货|开料|外包装|少件|破损|漏发|赔偿|挽单|"
    r"\bdd\d{11}\b|\b(?:order|shipping|delivery|invoice|refund|return|doormat|mat|carpet)\b",
    re.I,
)
# A store keyword or attached order ID must not grant permission to a second task.
OFF_TOPIC = re.compile(
    r"天气|气温|下雨|星座|运势|股票|炒股|基金|彩票|做菜|菜谱|吃什么|旅游攻略|"
    r"感冒|头疼|头痛|吃什么药|看病|诊断|谈恋爱|追女孩|讲(?:个|一个)?故事|"
    r"写(?:一首|首|个|一篇)?(?:诗|作文|代码|程序)|翻译|宇宙|人生意义|"
    r"忽略.{0,15}(?:指令|规则|提示)|(?:绕过|忘记).{0,15}(?:规则|限制)|"
    r"\b(?:weather|horoscope|recipe|politics|write code|ignore.*instructions)\b",
    re.I,
)
ARITHMETIC = re.compile(r"\d+(?:\.\d+)?\s*[+＋÷/×*\-]\s*\d+(?:\.\d+)?|一加一|一加1|1加1")
COMMERCIAL_CALC = re.compile(r"面积|单价|总价|合计|总额|共计|几块|每块|数量|长宽|平方|算钱|报价")
SMALLTALK = re.compile(r"^(?:你好|您好|亲|在吗|在不在|谢谢|多谢|好的|好|嗯|收到|明白了|hello|hi|thanks)[呀啊哦呢吗哈~!！?？。\s]*$", re.I)
CONTINUATION = re.compile(r"^(?:多少钱|怎么算钱|怎么收费|多久|还要多久|什么时候到|怎么办|怎么处理|我要处理|"
                          r"能便宜点吗|可以吗|能帮我处理吗|麻烦加急一下|横版|竖版|深蓝色|深灰色|奶油白|"
                          r"\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:cm|厘米)?|dd\d{11})[呀啊呢吗~!！?？。\s]*$", re.I)


@dataclass(frozen=True)
class ScopeVerdict:
    allowed: bool
    reason: str


def check_service_scope(message: str, *, has_business_context: bool = False) -> ScopeVerdict:
    text = unicodedata.normalize('NFKC', message).strip()
    if OFF_TOPIC.search(text):
        return ScopeVerdict(False, 'unrelated_topic_or_instruction')
    calculation_text = re.sub(r'\d{4}[-/]\d{1,2}[-/]\d{1,2}', '', text)
    if BUSINESS.search(text) and re.search(r'尺寸|定制|长宽|厘米|cm|毫米', text, re.I):
        calculation_text = re.sub(r'\d+(?:\.\d+)?\s*[*×]\s*\d+(?:\.\d+)?', '', calculation_text)
    if ARITHMETIC.search(calculation_text) and not (BUSINESS.search(text) and COMMERCIAL_CALC.search(text)):
        return ScopeVerdict(False, 'unrelated_arithmetic')
    if SMALLTALK.fullmatch(text):
        return ScopeVerdict(True, 'service_greeting')
    # Split independent requests so “地垫多少钱，顺便回答1+1” cannot pass on 地垫.
    parts = re.split(r"[，,。！？!?；;\n]+|顺便|另外|以及|并且|同时帮我|and also", text, flags=re.I)
    has_business = bool(BUSINESS.search(text))
    for part in filter(None, (p.strip() for p in parts)):
        if BUSINESS.search(part) or SMALLTALK.fullmatch(part):
            continue
        if CONTINUATION.fullmatch(part) and (has_business or has_business_context):
            continue
        return ScopeVerdict(False, 'unrecognized_service_request')
    if has_business or (has_business_context and CONTINUATION.fullmatch(text)):
        return ScopeVerdict(True, 'store_service')
    return ScopeVerdict(False, 'unrecognized_service_request')
