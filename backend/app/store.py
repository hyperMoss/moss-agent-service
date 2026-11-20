"""SQLite 轻量持久化存储：订单、售后登记表、线下发票登记表、工作群通知记录与对话日志。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import runtime_config


SEED_ORDERS = [
    {
        "order_id": "DD20261119001",
        "buyer_name": "林女士",
        "order_type": "page_size",  # page_size | custom
        "has_code": 0,
        "product_name": "商用加密丝圈入户地垫 120x180cm 深灰",
        "amount": 188.0,
        "status": "unshipped",  # unshipped | shipped | delivered
        "production_owner": "warehouse",  # factory | warehouse
        "courier": "中通快递",
        "tracking_no": "",
        "logistics_stalled_hours": 0,
        "shipping_address": "上海市浦东新区张江高科技园区科苑路88号",
        "custom_notes": "",
    },
    {
        "order_id": "DD20261119002",
        "buyer_name": "陈先生",
        "order_type": "custom",
        "has_code": 1,
        "product_name": "定制LOGO铝合金防滑门垫 200x300cm 横版字体",
        "amount": 680.0,
        "status": "unshipped",
        "production_owner": "factory",
        "courier": "德邦物流",
        "tracking_no": "",
        "logistics_stalled_hours": 0,
        "shipping_address": "广东省深圳市南山区科技园南区高新南一道18号",
        "custom_notes": "工厂做货｜横版LOGO居中｜协商发货3-5天已线上确认",
    },
    {
        "order_id": "DD20261116003",
        "buyer_name": "周小姐",
        "order_type": "page_size",
        "has_code": 0,
        "product_name": "硅藻泥软地垫 60x120cm 奶油白",
        "amount": 96.0,
        "status": "shipped",
        "production_owner": "warehouse",
        "courier": "圆通速递",
        "tracking_no": "YT889912345678",
        "logistics_stalled_hours": 56,  # 超过48小时，触发售后交接
        "shipping_address": "浙江省杭州市西湖区文三路259号",
        "custom_notes": "",
    },
    {
        "order_id": "DD20261114004",
        "buyer_name": "王总",
        "order_type": "custom",
        "has_code": 1,
        "product_name": "异形裁剪电梯PVC地垫 155x142cm 竖向条纹",
        "amount": 420.0,
        "status": "shipped",
        "production_owner": "factory",
        "courier": "顺丰速运",
        "tracking_no": "SF162900451234",
        "logistics_stalled_hours": 12,
        "shipping_address": "北京市朝阳区建国门外大街1号国贸大厦",
        "custom_notes": "工厂做货｜异形切角按草图｜条纹竖向｜发货3-5天",
    },
]


class CSStore:
    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = Path(db_path or runtime_config.db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _now(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS orders (
                    order_id TEXT PRIMARY KEY,
                    buyer_name TEXT NOT NULL,
                    order_type TEXT NOT NULL,
                    has_code INTEGER NOT NULL DEFAULT 0,
                    product_name TEXT NOT NULL,
                    amount REAL NOT NULL,
                    status TEXT NOT NULL,
                    production_owner TEXT NOT NULL,
                    courier TEXT NOT NULL DEFAULT '',
                    tracking_no TEXT NOT NULL DEFAULT '',
                    logistics_stalled_hours INTEGER NOT NULL DEFAULT 0,
                    shipping_address TEXT NOT NULL,
                    custom_notes TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS after_sales_tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    sub_reason TEXT NOT NULL,
                    source_party TEXT NOT NULL,
                    discount_offered REAL,
                    resolution TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS invoice_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    buyer_title TEXT NOT NULL,
                    tax_id TEXT NOT NULL DEFAULT '',
                    amount REAL NOT NULL,
                    email TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS work_group_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_type TEXT NOT NULL,
                    order_id TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    stage TEXT NOT NULL DEFAULT 'presales',
                    intent TEXT NOT NULL DEFAULT '',
                    tool_calls_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL
                );
                """
            )
            existing = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
            if existing == 0:
                conn.executemany(
                    """
                    INSERT INTO orders (
                        order_id, buyer_name, order_type, has_code, product_name,
                        amount, status, production_owner, courier, tracking_no,
                        logistics_stalled_hours, shipping_address, custom_notes
                    ) VALUES (
                        :order_id, :buyer_name, :order_type, :has_code, :product_name,
                        :amount, :status, :production_owner, :courier, :tracking_no,
                        :logistics_stalled_hours, :shipping_address, :custom_notes
                    )
                    """,
                    SEED_ORDERS,
                )

    def list_orders(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM orders ORDER BY order_id DESC").fetchall()
            return [dict(r) for r in rows]

    def get_order(self, order_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM orders WHERE order_id = ?", (order_id,)
            ).fetchone()
            return dict(row) if row else None

    def update_order_address(self, order_id: str, new_address: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE orders SET shipping_address = ? WHERE order_id = ?",
                (new_address, order_id),
            )
            return cur.rowcount > 0

    def update_order_product(self, order_id: str, new_product: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE orders SET product_name = ? WHERE order_id = ?",
                (new_product, order_id),
            )
            return cur.rowcount > 0

    def add_after_sales_ticket(self, record: dict[str, Any]) -> dict[str, Any]:
        created_at = self._now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO after_sales_tickets (
                    order_id, category, sub_reason, source_party,
                    discount_offered, resolution, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["order_id"],
                    record["category"],
                    record["sub_reason"],
                    record["source_party"],
                    record.get("discount_offered"),
                    record["resolution"],
                    record.get("notes", ""),
                    created_at,
                ),
            )
            return {"id": cur.lastrowid, **record, "created_at": created_at}

    def list_after_sales_tickets(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM after_sales_tickets ORDER BY id DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def add_invoice_record(self, record: dict[str, Any]) -> dict[str, Any]:
        created_at = self._now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO invoice_records (
                    order_id, buyer_title, tax_id, amount, email, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["order_id"],
                    record["buyer_title"],
                    record.get("tax_id", ""),
                    record["amount"],
                    record.get("email", ""),
                    record.get("notes", ""),
                    created_at,
                ),
            )
            return {"id": cur.lastrowid, **record, "created_at": created_at}

    def list_invoice_records(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM invoice_records ORDER BY id DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def add_notification(self, group_type: str, order_id: str, summary: str) -> dict[str, Any]:
        created_at = self._now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO work_group_notifications (group_type, order_id, summary, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (group_type, order_id, summary, created_at),
            )
            return {
                "id": cur.lastrowid,
                "group_type": group_type,
                "order_id": order_id,
                "summary": summary,
                "created_at": created_at,
            }

    def list_notifications(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM work_group_notifications ORDER BY id DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        stage: str = "presales",
        intent: str = "",
        tool_calls: list[dict[str, Any]] | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO chat_messages (
                    session_id, role, content, stage, intent, tool_calls_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    role,
                    content,
                    stage,
                    intent,
                    json.dumps(tool_calls or [], ensure_ascii=False),
                    self._now(),
                ),
            )

    def get_session_messages(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC",
                (session_id,),
            ).fetchall()
            result = []
            for r in rows:
                item = dict(r)
                item["tool_calls"] = json.loads(item.pop("tool_calls_json", "[]"))
                result.append(item)
            return result


store = CSStore()
