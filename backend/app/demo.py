"""Read-only demo cases; running a case uses the normal chat pipeline."""
DEMO_CASES = [
    {"id": "custom", "title": "LOGO 定制与方向确认", "stage": "presales", "order_id": "DD20261119002", "question": "我想定制一块200x300cm铝合金门垫，需要横版LOGO，怎么报价，多久发货？", "expected": "核算报价，确认尺寸、字体方向和效果图，协商3-5天发货。"},
    {"id": "discount", "title": "现货折扣权限", "stage": "presales", "order_id": "DD20261119001", "question": "这块页面尺寸地垫可以给我打9折吗？", "expected": "核对售前折扣权限，遵循9.8折红线。"},
    {"id": "shipping", "title": "定制订单催发货", "stage": "insales", "order_id": "DD20261119002", "question": "我的定制订单怎么还没发？请帮我催发货。", "expected": "查询订单，联系工厂加急并检查是否漏开料。"},
    {"id": "logistics", "title": "物流停滞超过48小时", "stage": "insales", "order_id": "DD20261116003", "question": "物流一直不更新，请帮我查询物流并跟进。", "expected": "查询运单停滞时间，通知快递工作群并交接售后核查。"},
    {"id": "change", "title": "已发货定制商品修改", "stage": "insales", "order_id": "DD20261114004", "question": "定制地垫已经发货，我想修改商品尺寸和条纹方向。", "expected": "明确已发货的定制商品不支持直接修改。"},
    {"id": "quality", "title": "地垫脱胶品质售后", "stage": "aftersales", "order_id": "DD20261114004", "question": "收到地垫发现脱胶开裂，质量有问题，要求退货退款。", "expected": "遵循品质售后7折权限，登记售后工单并反馈生产方。"},
]
