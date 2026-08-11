"""
Plan 055 — Phase 0.3: Capture the Python category-registry golden output.

Round-trips the real category registry through the Python manager's repository
conversion (registry -> legacy CategoryCatalog shape) and writes the golden
JSON consumed by the parity report (scripts/parity-report.ts), which compares
category counts between the TypeScript registry and this Python conversion.

Usage:
    admin/product_manager/.venv/bin/python plans/fixtures/055/capture_python_category_golden.py
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from admin.product_manager.category_models import CategoryCatalog
from admin.product_manager.category_repository import (
    JsonCategoryRepository,
)

FIXTURE_DIR = REPO_ROOT / "plans" / "fixtures" / "055"
GOLDEN_DIR = FIXTURE_DIR / "golden"
REGISTRY_PATH = REPO_ROOT / "data" / "category_registry.json"
GOLDEN_CATEGORY = GOLDEN_DIR / "python_category_registry.json"


def main() -> int:
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)

    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    print(f"Loading registry: {REGISTRY_PATH}")

    repo = JsonCategoryRepository(str(REGISTRY_PATH))
    catalog_payload = repo._registry_to_catalog_payload(registry)
    catalog = CategoryCatalog.from_dict(catalog_payload)
    serialized = catalog.to_dict()

    GOLDEN_CATEGORY.write_text(
        json.dumps(serialized, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    registry_count = len(registry.get("categories", []))
    golden_count = len(serialized.get("categories", []))
    print(f"Registry categories: {registry_count}")
    print(f"Golden categories:   {golden_count}")
    print(f"Golden file written: {GOLDEN_CATEGORY}")

    return 0 if registry_count == golden_count else 1


if __name__ == "__main__":
    sys.exit(main())
