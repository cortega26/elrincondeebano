"""
Plan 055 — Phase 0.3: Capture Python product-manager golden outputs.

Round-trips the synthetic fixture catalog through the Python model and writes
the golden JSON for parity testing against the TypeScript implementation.

Usage:
    admin/product_manager/.venv/bin/python plans/fixtures/055/capture_python_golden.py
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "admin" / "product_manager"))

from models import Product, ProductCatalog

FIXTURE_DIR = REPO_ROOT / "plans" / "fixtures" / "055"
GOLDEN_DIR = FIXTURE_DIR / "golden"

FIXTURE_CATALOG = FIXTURE_DIR / "product_catalog.json"
GOLDEN_ROUNDTRIP = GOLDEN_DIR / "python_roundtrip.json"
GOLDEN_IDENTITIES = GOLDEN_DIR / "python_identities.json"
GOLDEN_DIAGNOSTICS = GOLDEN_DIR / "python_diagnostics.json"


def load_fixture(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def roundtrip_product(product_dict: dict, index: int) -> dict:
    errors: list[str] = []
    loss: list[str] = []

    try:
        product = Product.from_dict(product_dict)
    except Exception as exc:
        return {
            "index": index,
            "name": product_dict.get("name", "?"),
            "status": "parse_error",
            "error": str(exc),
        }

    identity = product.identity_key()
    serialized = product.to_dict()
    re_parsed = Product.from_dict(serialized)

    original_keys = set(product_dict.keys())
    serialized_keys = set(serialized.keys())

    extra_in_original = original_keys - serialized_keys
    extra_in_serialized = serialized_keys - original_keys

    if extra_in_original:
        loss.append(f"fields dropped during serialization: {sorted(extra_in_original)}")
    if extra_in_serialized:
        loss.append(f"extra fields in serialization: {sorted(extra_in_serialized)}")

    for key in sorted(original_keys & serialized_keys):
        original_value = product_dict[key]
        serialized_value = serialized[key]
        if isinstance(original_value, dict) and isinstance(serialized_value, dict):
            continue
        if original_value != serialized_value:
            loss.append(
                f"field '{key}' changed: {repr(original_value)} -> {repr(serialized_value)}"
            )

    if not re_parsed.identity_key() == identity:
        errors.append(
            f"identity drift: {identity} -> {re_parsed.identity_key()}"
        )

    return {
        "index": index,
        "name": product.name,
        "identity": identity,
        "status": "ok" if not loss and not errors else "drift",
        "serialized": serialized,
        "loss": loss,
        "errors": errors,
        "is_archived": product.is_archived,
        "discounted_price": product.discounted_price,
        "discount_percentage": product.discount_percentage,
    }


def main() -> None:
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loading fixture: {FIXTURE_CATALOG}")
    fixture_data = load_fixture(FIXTURE_CATALOG)

    catalog = ProductCatalog.from_dict(fixture_data)
    print(f"Catalog loaded: {len(catalog.products)} products, rev={catalog.metadata.rev}")
    print(f"Version: {catalog.metadata.version}")

    results = []
    identities: dict[str, list[int]] = {}
    drift_count = 0

    for idx, product in enumerate(fixture_data["products"]):
        result = roundtrip_product(product, idx)
        results.append(result)

        identity = result["identity"]
        identities.setdefault(identity, []).append(idx)

        if result["status"] != "ok":
            drift_count += 1
            print(f"  [{idx}] {result['name']}: DRIFT")
            for entry in result.get("loss", []):
                print(f"        loss: {entry}")
            for entry in result.get("errors", []):
                print(f"        error: {entry}")

    collisions = {k: v for k, v in identities.items() if len(v) > 1}
    diagnostics = {
        "total_products": len(results),
        "ok_count": len(results) - drift_count,
        "drift_count": drift_count,
        "identity_collisions": collisions,
        "catalog_version": catalog.metadata.version,
        "catalog_rev": catalog.metadata.rev,
    }

    GOLDEN_ROUNDTRIP.write_text(
        json.dumps([r["serialized"] for r in results if r["serialized"]], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    GOLDEN_IDENTITIES.write_text(
        json.dumps(
            {r["name"]: {"identity": r["identity"], "index": r["index"]} for r in results},
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    GOLDEN_DIAGNOSTICS.write_text(
        json.dumps(diagnostics, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\n=== Results ===")
    print(f"Total: {diagnostics['total_products']}")
    print(f"OK: {diagnostics['ok_count']}")
    print(f"Drift: {diagnostics['drift_count']}")
    if collisions:
        print(f"WARNING: {len(collisions)} identity collisions!")
        for key, indices in collisions.items():
            print(f"  '{key}' maps to indices {indices}")
    print(f"\nGolden files written to: {GOLDEN_DIR}")

    sys.exit(0 if drift_count == 0 else 1)


if __name__ == "__main__":
    main()
