# 基于 AgentScope 2.0 + React (Astryx) 的全链路智能客服系统

本系统基于 [AgentScope 2.0](https://github.com/agentscope-ai/agentscope)（Python 后端）与 Meta 开源的 [Astryx Design System](https://github.com/meta/astryx)（React 19 + TypeScript 前端）构建，完整落地地垫电商 **售前 / 售中 / 售后** 全链路客服接待 SOP。

## 1. 系统架构与 SOP 映射

- **后端（`backend/`）**：FastAPI + SQLite + [AgentScope 2.0 Quickstart API](https://docs.agentscope.io/en/versions/2.0.11/quickstart)（`Agent`、`Toolkit`、`DashScopeChatModel` / `OpenAIChatModel`、`reply_stream`）。
  - **售前部分**：标准欢迎语、页面尺寸（内置 **9.8 折** 权限红线校验）、定制需求（材质面积报价、字体横竖版/条纹纹路/异形裁剪方向确认、LOGO 群效果图核对、强制协商 **3-5 天** 发货时间、备注工厂/仓库做货）。
  - **售中部分**：催发货（页面常规通知仓库、有编号/定制通知工厂加急并提示防仓库漏开料）、催物流（丢件交接售后补发、物流停滞超 **48 小时** 交接售后核实）、修改地址（发货前直接改单、发货后发快递群并告知需到达原地址后转出）、修改产品信息（发货前改单通知仓库；发货后页面尺寸拦截补发、定制商品不支持修改）、线下开票登记发票表。
  - **售后部分**：品质问题（挽单最低 **7 折**、强制登记售后表、区分工厂/仓库反馈工作群）、个人问题（色差/1-3cm误差/气味/厚度等，挽单最低 **8 折**、登记售后表）、物流问题（签收未收到/破损少件，挽单且赔偿由快递承担、登记售后表）、高频售后话术库。
  - **开箱即用演示模式（Demo Mode）**：未填写 API Key 时自动启用内置 SOP 规则与工具演示引擎，完整体验 SSE 流式回复、工具调用轨迹与台账落库；配置 `DASHSCOPE_API_KEY` 或 `OPENAI_API_KEY` 后无缝切换至 AgentScope 2.0 真实模型推理。
- **前端（`frontend/`）**：React 19 + Vite + TypeScript + [Astryx Design System](https://astryx.atmeta.com/docs/getting-started)（`@astryxdesign/core`、`@astryxdesign/theme-neutral`、`@stylexjs/stylex`、`@astryxdesign/cli`）。
  - 三栏客服坐席工作台：左侧 **SOP 流程与高频话术一键引用**、中间 **SSE 流式对话与工具调用轨迹 + 必检清单**、右侧 **售后表 / 工作群流转 / 发票表实时台账**，顶部支持 **模型与折扣红线热配置**。

## 2. 快速启动

### 后端（Python 3.11+，推荐使用 `uv`）

```bash
cd backend
cp .env.example .env
# 按需在 .env 中填入 DASHSCOPE_API_KEY 或 OPENAI_API_KEY（留空则自动使用内置 SOP 演示模式）
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

运行自动化测试：

```bash
cd backend
pytest
```

### 前端（Node.js 22.13+，React 19 + Astryx）

```bash
cd frontend
npm install
# 可选：使用 Astryx CLI 查看组件或切换主题（如 matcha / stone / butter）
npx @astryxdesign/cli theme list
npm run dev
```

浏览器访问 `http://localhost:5173` 即可使用（Vite 已配置 `/api` 自动代理到 `http://127.0.0.1:8000`）。

## 3. 轻量服务器（如 2核2G）部署建议

- 后端依赖使用 `uv pip install` 仅安装核心包与云端 LLM API，不拉取本地重型向量/推理模型，常驻内存可控。
- 生产环境建议在构建机执行 `npm run build` 生成静态产物后由 Nginx 托管，避免在 2c2g 机器上运行 `vite dev`；若需在 2c2g 机器上直接安装依赖，建议先配置 2GB Swap 防止 OOM。
