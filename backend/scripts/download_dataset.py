"""一键下载并转换公开电商客服测试数据集。

支持来源：
1. dinesshxryu/sea-ecommerce-customer-support-sample (Hugging Face，含中文电商客服对话)
2. Alibaba-NLP/EcomBench (Hugging Face，中文电商评测基准)

用法：
  pip install datasets
  python scripts/download_dataset.py --source sea --limit 50
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="拉取 Hugging Face 公开电商客服测试数据集")
    parser.add_argument(
        "--source",
        choices=["sea", "ecombench"],
        default="sea",
        help="选择公开数据集来源",
    )
    parser.add_argument("--limit", type=int, default=50, help="导出样本条数")
    args = parser.parse_args()

    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise SystemExit("请先安装 datasets：uv pip install datasets") from exc

    out_dir = Path(__file__).resolve().parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.source == "sea":
        ds = load_dataset("dinesshxryu/sea-ecommerce-customer-support-sample", split="train")
        out_path = out_dir / "hf_sea_ecommerce_sample.jsonl"
        rows = []
        for idx, item in enumerate(ds):
            if len(rows) >= args.limit:
                break
            lang = str(item.get("language", "")).lower()
            if lang and "zh" not in lang and "chinese" not in lang:
                continue
            rows.append(
                {
                    "id": f"HF-SEA-{idx+1:03d}",
                    "source": "https://huggingface.co/datasets/dinesshxryu/sea-ecommerce-customer-support-sample",
                    "raw": dict(item),
                }
            )
    else:
        ds = load_dataset("Alibaba-NLP/EcomBench", split="test")
        out_path = out_dir / "hf_alibaba_ecombench.jsonl"
        rows = [
            {
                "id": f"HF-ECOM-{idx+1:03d}",
                "source": "https://huggingface.co/datasets/Alibaba-NLP/EcomBench",
                "raw": dict(item),
            }
            for idx, item in enumerate(ds.select(range(min(args.limit, len(ds)))))
        ]

    with out_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"已导出 {len(rows)} 条公开测试样本至：{out_path}")


if __name__ == "__main__":
    main()
