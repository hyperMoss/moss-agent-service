"""动态可热更新的系统与模型配置。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


@dataclass
class RuntimeConfig:
    model_provider: str = field(
        default_factory=lambda: os.getenv("MODEL_PROVIDER", "dashscope").lower()
    )
    dashscope_api_key: str = field(
        default_factory=lambda: os.getenv("DASHSCOPE_API_KEY", "")
    )
    dashscope_model: str = field(
        default_factory=lambda: os.getenv("DASHSCOPE_MODEL", "qwen-plus")
    )
    openai_api_key: str = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY", "")
    )
    openai_base_url: str = field(
        default_factory=lambda: os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    )
    openai_model: str = field(
        default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    )
    db_path: str = field(
        default_factory=lambda: os.getenv(
            "DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "cs_system.db")
        )
    )
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
            if o.strip()
        ]
    )

    # SOP 优惠红线配置（支持管理后台热调整）
    presales_page_min_discount: float = 0.98  # 页面尺寸客服最低 9.8 折
    aftersales_quality_min_discount: float = 0.70  # 品质问题挽单最低 7 折
    aftersales_personal_min_discount: float = 0.80  # 个人问题挽单最低 8 折
    logistics_stall_hours_threshold: int = 48  # 物流停滞超 48 小时交接售后

    def effective_provider(self) -> str:
        """若未配置对应 API Key，自动回退为 demo 模式，保证开箱即用。"""
        if self.model_provider == "dashscope" and self.dashscope_api_key:
            return "dashscope"
        if self.model_provider == "openai" and self.openai_api_key:
            return "openai"
        return "demo"


runtime_config = RuntimeConfig()
