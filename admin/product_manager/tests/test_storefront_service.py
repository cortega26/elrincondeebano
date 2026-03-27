from pathlib import Path

import pytest

from test_support import bootstrap_tests, require

bootstrap_tests()

from admin.product_manager.storefront_service import (  # noqa: E402
    StorefrontBundle,
    StorefrontBundleService,
    StorefrontBundleValidationError,
    StorefrontProductReference,
    slugify_bundle_id,
)


def test_slugify_bundle_id_normalizes_human_titles() -> None:
    require(
        slugify_bundle_id("Noche de pelis") == "noche-de-pelis",
        "Expected plain bundle titles to become URL-safe ids",
    )
    require(
        slugify_bundle_id("Básicos del día!") == "basicos-del-dia",
        "Expected accents and punctuation to be normalized in bundle ids",
    )


def test_storefront_bundle_service_loads_saved_bundles(tmp_path: Path) -> None:
    bundle_file = tmp_path / "storefront-bundles.json"
    bundle_file.write_text(
        """
[
  {
    "id": "combo-prueba",
    "title": "Combo Prueba",
    "description": "Una prueba controlada.",
    "items": [
      {"category": "Bebidas", "name": "Coca-Cola 2L"}
    ]
  }
]
""".strip()
        + "\n",
        encoding="utf-8",
    )

    service = StorefrontBundleService(bundle_file)
    bundles = service.load_bundles()

    require(len(bundles) == 1, "Expected one bundle to load from the JSON file")
    require(
        bundles[0].items[0].name == "Coca-Cola 2L",
        "Expected product references to round-trip from disk",
    )


def test_storefront_bundle_service_saves_with_atomic_payload(tmp_path: Path) -> None:
    bundle_file = tmp_path / "storefront-bundles.json"
    service = StorefrontBundleService(bundle_file)
    bundles = [
        StorefrontBundle(
            id="basicos",
            title="Básicos",
            description="Combo simple.",
            items=[
                StorefrontProductReference(
                    category="Despensa",
                    name="Mont Blanc • Harina sin polvos",
                )
            ],
        )
    ]

    service.save_bundles(bundles)

    require(bundle_file.exists(), "Expected the bundle file to be created on save")
    content = bundle_file.read_text(encoding="utf-8")
    require(
        '"title": "Básicos"' in content,
        "Expected saved JSON to include the bundle title",
    )
    require(
        content.endswith("\n"),
        "Expected saved bundle JSON to end with a newline for clean diffs",
    )


def test_storefront_bundle_service_rejects_duplicate_ids(tmp_path: Path) -> None:
    bundle_file = tmp_path / "storefront-bundles.json"
    service = StorefrontBundleService(bundle_file)

    duplicate_bundles = [
        {
            "id": "combo",
            "title": "Combo 1",
            "description": "Primero",
            "items": [{"category": "Bebidas", "name": "Coca-Cola 2L"}],
        },
        {
            "id": "combo",
            "title": "Combo 2",
            "description": "Segundo",
            "items": [{"category": "Aguas", "name": "Benedictino • Agua sin gas 2L"}],
        },
    ]

    with pytest.raises(StorefrontBundleValidationError):
        service.save_bundles(duplicate_bundles)
