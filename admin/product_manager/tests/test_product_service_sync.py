# ruff: noqa: E402
from test_support import InMemoryRepository, bootstrap_tests, require


bootstrap_tests()

from admin.product_manager.models import Product
from admin.product_manager.services import ProductService, build_product_sync_id


def test_update_product_queues_stable_sync_id_for_duplicate_names() -> None:
    base = Product(name="Producto", description="Original", price=1000)
    repo = InMemoryRepository(
        [
            base,
            Product(name="Producto", description="Variante", price=900),
        ]
    )
    service = ProductService(repo)

    queued = {}

    class SyncStub:
        def enqueue_update(self, **payload) -> None:
            queued.update(payload)

    service.set_sync_engine(SyncStub())
    updated = Product(name="Producto", description="Original", price=1300)

    service.update_product(base.name, updated, base.description)

    require(
        queued.get("product_id") == build_product_sync_id(base),
        "Expected sync payload to use duplicate-safe product identity",
    )


def test_apply_server_snapshot_uses_lookup_product_id_for_duplicate_names() -> None:
    repo = InMemoryRepository(
        [
            Product(name="Producto", description="Original", price=1000),
            Product(name="Producto", description="Variante", price=900),
        ]
    )
    service = ProductService(repo)

    snapshot = Product(name="Producto", description="Variante", price=950).to_dict()

    service.apply_server_snapshot(
        snapshot,
        2,
        {"version": "20250311-010000", "last_updated": "2025-03-11T01:00:00.000Z"},
        lookup_product_id=build_product_sync_id(snapshot),
    )

    original = service.get_product_by_name("Producto", "Original")
    variant = service.get_product_by_name("Producto", "Variante")
    require(original.price == 1000, "Expected original duplicate to remain unchanged")
    require(variant.price == 950, "Expected matching duplicate to be updated")


def test_apply_server_snapshot_matches_snapshot_identity_after_rename() -> None:
    repo = InMemoryRepository([Product(name="Producto", description="Original", price=1000)])
    service = ProductService(repo)

    snapshot = Product(name="Producto Renombrado", description="Original", price=1100).to_dict()

    service.apply_server_snapshot(
        snapshot,
        3,
        {"version": "20250311-010500", "last_updated": "2025-03-11T01:05:00.000Z"},
        lookup_product_id=build_product_sync_id(Product(name="Producto", description="Original", price=1000)),
    )

    renamed = service.get_product_by_name("Producto Renombrado", "Original")
    require(renamed.price == 1100, "Expected renamed snapshot to replace the existing product")
