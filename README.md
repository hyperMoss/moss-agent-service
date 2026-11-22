# AgentScope 2.0 × Onto 智能客服与经营归因系统（Python + React Astryx）

本项目延续 [AgentScope 2.0](https://docs.agentscope.io/en/versions/2.0.11/quickstart)（Python/FastAPI）+ React 19 + [Meta Astryx](https://astryx.atmeta.com/docs/getting-started) 架构，深度融合核心架构特色、经营归因与原文溯源抽屉页面设计，并实现**客户前台与商家后台独立路径分离**。

## 1. 页面路径与布局规划

| 访问路径 | 页面定位 | 核心特性 |
| :--- | :--- | :--- |
| `/` 或 `/chat` | **纯面向客户的独立前台**（`CustomerPortal.tsx`） | 极简买家对话体验、常见咨询快捷入口、订单号选填、图片/草图上传、满意度反馈（“未解决”自动静默流入后台 Badcase 队列），完全隐藏内部 SOP 与归因数据。 |
| `/admin` 或 `/admin/chat` | **商家后台 · 智能坐席** | **竖向右手边导航栏**；左侧三栏坐席台（SOP 流程话术 + SSE 流式对话/双本体决策轨迹/点踩入队 + 售后/工作群/发票台账）。 |
| `/admin/attribution` | **商家后台 · 经营归因与决策** | 对标 Onto 的只读双页签看板（售后问题分布 + 归因与决策）与右侧可下钻「原文与归因依据」抽屉。 |
| `/admin/badcases` | **商家后台 · Badcase 自进化** | 集中展示客户前台与坐席点踩捕获的 Badcase 及 Decision Trace，支持人工修复与状态闭环。 |
| `/admin/benchmark` | **商家后台 · 评测与数据集** | 一键运行 20 条全链路 SOP 回归评测集，并展示公开客服数据集目录。 |

## 2. 融合的 Onto 核心特色功能

1. **双本体与动作边界二次校验（`backend/app/ontology/dual_ontology.py`）**：Service Ontology + Decision Ontology 定义允许/禁止动作边界，服务端拦截越权折扣与已发货定制改品承诺。
2. **多模态线索提取（`backend/app/tools/multimodal.py`）**：解析破损/色差/效果图/快递面单线索并显式保留待确认项（`uncertainties`）。
3. **点赞/点踩与 Badcase 自进化闭环**：前后台反馈统一归档至 SQLite `badcase_queue`（附完整 `DecisionTrace`）。
4. **严格只读的经营归因引擎（`backend/app/analytics/attribution_engine.py`）**：程序确定性统计 + `DO-RC1~RC4` / `DO-OPS-*` 护栏 + 点击 `工单第{n}行` 下钻原文与订单快照。

## 3. 测试数据集与一键回归评测

- **内置评测集**：`backend/data/mat_cs_eval_dataset.jsonl`（20 条地垫全链路 SOP 样本）与 `backend/data/after_sales_snapshot.json`（12 条带根因标注的售后快照）。
- **公开测试数据集（拉取脚本 `backend/scripts/download_dataset.py`）**：
  - [dinesshxryu/sea-ecommerce-customer-support-sample](https://huggingface.co/datasets/dinesshxryu/sea-ecommerce-customer-support-sample)（1,000 条含中文多语言电商客服对话）
  - [Alibaba-NLP/EcomBench](https://huggingface.co/datasets/Alibaba-NLP/EcomBench)（中文电商评测基准）

## 4. 快速启动

```bash
# 1. 启动 Python 后端
cd backend
cp .env.example .env
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload --port 8000

# 2. 启动 React 19 + Astryx 前端
cd frontend
npm install
npm run dev
# 客户前台：http://localhost:5173/chat
# 商家后台：http://localhost:5173/admin/chat
```

### OntoCare 风格演示与看板

- `/admin/tickets`：独立演示工单页，支持搜索、选择场景、运行、追问和重置会话。六个场景使用当前地垫业务订单和真实客服接口，预期流程与实际执行结果分开展示。运行售后和履约场景会登记售后表或工作群通知；重置只清空当前演示会话，不撤销登记。
- `/admin/attribution`：经营看板，展示产品与问题码的彩色分布、归因规则及只读问答；点击工单行号查看原文证据。工单数不代表故障率。
- 演示页、智能坐席和客户前台均提供 `Service Ontology` 对话本体。订单、产品节点来自工具实际查询结果，知识与规则节点来自实际决策轨迹；连线表示同轮参与，点击节点可定位关联提问。节点不表示业务资格已核验。

界面参考本机 OntoCare 的 `static/analytics.html`、`static/conversation-graph.js` 和 `static/judge-demo.css`，业务内容使用本项目的地垫 SOP，不依赖参考项目运行。

需要隔离演示登记时，可在启动后端前设置 `DB_PATH=/tmp/moss-demo.db MODEL_PROVIDER=demo`。

### 商品与订单意图护栏

普通与流式客服接口共用服务范围检查，先检查范围再调用模型或业务工具。数学题、生活问题、夹带无关任务或要求忽略规则的消息返回固定范围提示，记录 `out_of_scope` 意图与 `DO-SERVICE-SCOPE` 拦截轨迹；订单号和手动阶段不能绕过检查。未能确认业务意图时也会请用户改为商品或订单问题。商品规格、面积和报价计算可正常处理；有业务上下文时支持短规格及简短追问。
