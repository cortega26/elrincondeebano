from pathlib import Path

import pytest

from test_support import bootstrap_tests, require

bootstrap_tests()

from admin.product_manager.storefront_service import (  # noqa: E402
    StorefrontBundle,
    StorefrontBundleService,
    StorefrontBundleValidationError,
    FeaturedStaplesError,
    FeaturedStaplesService,
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


def test_storefront_bundle_service_round_trips_bundle_price(tmp_path: Path) -> None:
    bundle_file = tmp_path / "storefront-bundles.json"
    service = StorefrontBundleService(bundle_file)
    bundle = StorefrontBundle(
        id="combo-precio",
        title="Combo con precio",
        description="Con precio fijo.",
        items=[StorefrontProductReference(category="Bebidas", name="Coca-Cola 2L")],
        bundle_price=4990,
    )

    service.save_bundles([bundle])
    loaded = service.load_bundles()

    require(len(loaded) == 1, "Expected one bundle after round-trip")
    require(
        loaded[0].bundle_price == 4990,
        "Expected bundlePrice to round-trip through save/load",
    )


def test_storefront_bundle_service_omits_bundle_price_when_zero(tmp_path: Path) -> None:
    bundle_file = tmp_path / "storefront-bundles.json"
    service = StorefrontBundleService(bundle_file)
    bundle = StorefrontBundle(
        id="combo-sin-precio",
        title="Combo sin precio",
        description="Sin precio fijo.",
        items=[StorefrontProductReference(category="Bebidas", name="Coca-Cola 2L")],
        bundle_price=0,
    )

    service.save_bundles([bundle])
    content = bundle_file.read_text(encoding="utf-8")

    require(
        "bundlePrice" not in content,
        "Expected bundlePrice key to be omitted from JSON when value is 0",
    )


def test_storefront_bundle_service_rejects_negative_bundle_price(tmp_path: Path) -> None:
    bundle_file = tmp_path / "storefront-bundles.json"
    bundle_file.write_text(
        '[{"id": "x", "title": "X", "description": "Y", "bundlePrice": -100,'
        ' "items": [{"category": "Bebidas", "name": "Coca-Cola 2L"}]}]\n',
        encoding="utf-8",
    )
    service = StorefrontBundleService(bundle_file)
    with pytest.raises(StorefrontBundleValidationError):
        service.load_bundles()


# ---------------------------------------------------------------------------
# FeaturedStaplesService tests
# ---------------------------------------------------------------------------

_EXPERIENCE_TEMPLATE = """{
  "trustBar": [],
  "home": {
    "featuredStaples": [
      {"category": "Bebidas", "name": "Coca-Cola 2L"},
      {"category": "Lacteos", "name": "Leche Entera"}
    ],
    "quickPicks": []
  },
  "bundles": [],
  "companionRules": []
}
"""


def test_featured_staples_service_loads_staples(tmp_path: Path) -> None:
    experience_file = tmp_path / "storefront-experience.json"
    experience_file.write_text(_EXPERIENCE_TEMPLATE, encoding="utf-8")

    service = FeaturedStaplesService(experience_file)
    staples = service.load_staples()

    require(len(staples) == 2, "Expected two staples to load from the JSON config")
    require(
        staples[0].name == "Coca-Cola 2L",
        "Expected first staple name to match the JSON fixture",
    )
    require(
        staples[1].category == "Lacteos",
        "Expected second staple category to match the JSON fixture",
    )


def test_featured_staples_service_saves_and_preserves_other_fields(tmp_path: Path) -> None:
    experience_file = tmp_path / "storefront-experience.json"
    experience_file.write_text(_EXPERIENCE_TEMPLATE, encoding="utf-8")

    service = FeaturedStaplesService(experience_file)
    new_staples = [
        StorefrontProductReference(category="Despensa", name="Mont Blanc • Harina sin polvos"),
    ]
    service.save_staples(new_staples)

    content = experience_file.read_text(encoding="utf-8")
    require(
        '"Mont Blanc' in content,
        "Expected saved staples to appear in the config file",
    )
    require(
        '"bundles"' in content,
        "Expected other top-level fields (bundles) to be preserved after saving staples",
    )
    require(
        "Coca-Cola" not in content,
        "Expected old staples to be replaced by the new list",
    )
    require(
        content.endswith("\n"),
        "Expected saved config to end with a newline for clean diffs",
    )


def test_featured_staples_service_returns_empty_for_missing_file(tmp_path: Path) -> None:
    service = FeaturedStaplesService(tmp_path / "nonexistent.json")
    staples = service.load_staples()
    require(len(staples) == 0, "Expected empty list when config file does not exist")


def test_featured_staples_service_raises_on_save_when_file_missing(tmp_path: Path) -> None:
    service = FeaturedStaplesService(tmp_path / "nonexistent.json")
    with pytest.raises(FeaturedStaplesError):
        service.save_staples([])


def test_featured_staples_service_round_trips_multiple_staples(tmp_path: Path) -> None:
    experience_file = tmp_path / "storefront-experience.json"
    experience_file.write_text(_EXPERIENCE_TEMPLATE, encoding="utf-8")

    service = FeaturedStaplesService(experience_file)
    original_staples = service.load_staples()
    service.save_staples(original_staples)
    reloaded = service.load_staples()

    require(
        len(reloaded) == len(original_staples),
        "Expected staple count to survive a round-trip through save/load",
    )
    for original, reloaded_item in zip(original_staples, reloaded):
        require(
            original.category == reloaded_item.category and original.name == reloaded_item.name,
            f"Expected staple '{original.name}' to survive round-trip unchanged",
        )
