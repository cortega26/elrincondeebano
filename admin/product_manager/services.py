"""Service layer for product management."""

from __future__ import annotations

import json
import logging
import threading
from copy import deepcopy
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum, auto
from typing import (
    TYPE_CHECKING,
    Any,
    Dict,
    List,
    Optional,
    Protocol,
    Sequence,
    Set,
    Tuple,
    Union,
)

from .models import Product
from .repositories import ProductRepositoryError, ProductRepositoryProtocol
from .time_utils import parse_iso_datetime
from .history_store import HistoryStore

if TYPE_CHECKING:
    from .category_service import CategoryService

logger = logging.getLogger(__name__)

ProductUpdateSpec = Union[Tuple[str, Product], Tuple[str, str, Product]]


def _utc_now_iso() -> str:
    """Return current UTC timestamp with millisecond precision."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class ProductEventType(Enum):
    """Event types for product operations."""

    CREATED = auto()
    UPDATED = auto()
    DELETED = auto()
    REORDERED = auto()


@dataclass
class ProductEvent:
    """Event data for product operations."""

    event_type: ProductEventType
    product_name: str
    timestamp: datetime = field(default_factory=datetime.now)
    details: Optional[Dict] = None


@dataclass
class ProductFilterCriteria:
    """Criteria for filtering products."""

    query: Optional[str] = None
    category: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    only_discount: bool = False
    only_out_of_stock: bool = False
    show_archived_only: bool = False


@dataclass
class VersionInfo:
    """Version information for product catalog."""

    version: str
    last_updated: datetime
    product_count: int


class ProductServiceError(Exception):
    """Base exception for ProductService errors."""


class ProductNotFoundError(ProductServiceError):
    """Raised when a product is not found."""


class DuplicateProductError(ProductServiceError):
    """Raised when attempting to create a duplicate product."""


class ProductEventHandler(Protocol):
    """Protocol for product event handlers."""
    # Protocol defines a single method by design.
    # pylint: disable=too-few-public-methods

    def handle_event(self, event: ProductEvent) -> None:
        """Handle a product event."""
        raise NotImplementedError


class ProductService:
    """Service class for managing product operations."""
    # Service exposes many operations and keeps runtime state.
    # pylint: disable=too-many-instance-attributes,too-many-public-methods

    def __init__(
        self,
        repository: ProductRepositoryProtocol,
        category_service: Optional["CategoryService"] = None,
    ):
        """
        Initialize the ProductService.
        """
        self.repository = repository
        self._products: Optional[List[Product]] = None
        self._products_lock = threading.RLock()
        self._event_handlers: Dict[ProductEventType, Set[ProductEventHandler]] = (
            defaultdict(set)
        )
        self._product_index: Dict[str, Product] = {}
        self._category_index: Dict[str, Set[Product]] = defaultdict(set)
        self._indexes_populated = False
        self.sync_engine = None
        self.category_service = category_service
        self._history_store = HistoryStore()
        if self.category_service:
            self.category_service.attach_product_service(self)
        self._rebuild_indexes()

    def _cap_history_entries(
        self, entries: List[Dict[str, Any]], cap: int = 20
    ) -> List[Dict[str, Any]]:
        return entries[-cap:] if len(entries) > cap else entries

    def _record_history_entries(
        self, entries: List[Tuple[str, str, Dict[str, Any]]], cap: int = 20
    ) -> None:
        if not entries:
            return
        try:
            history = self._history_store.load_history()
            for old_key, new_key, entry in entries:
                if old_key != new_key and old_key in history:
                    merged = history.get(old_key, []) + history.get(new_key, [])
                    history[new_key] = self._cap_history_entries(merged, cap)
                    history.pop(old_key, None)
                history[new_key] = self._cap_history_entries(
                    history.get(new_key, []) + [entry], cap
                )
            self._history_store.save_history(history)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.error("Error al guardar historial: %s", exc)

    def _rebuild_indexes(self) -> None:
        """Rebuild the internal indexes for faster lookups."""
        with self._products_lock:
            products = self.get_all_products()
            self._product_index.clear()
            self._category_index.clear()
            for product in products:
                self._product_index[product.identity_key()] = product
                if product.category:
                    self._category_index[product.category.lower()].add(product)
            self._indexes_populated = True

    def _ensure_indexes_ready(self) -> None:
        """Ensure lookup indexes are populated before accessing them."""
        if not self._indexes_populated:
            self._rebuild_indexes()

    def set_category_service(
        self, category_service: Optional["CategoryService"]
    ) -> None:
        """Attach or replace the category service reference."""
        with self._products_lock:
            self.category_service = category_service
            if self.category_service:
                self.category_service.attach_product_service(self)

    def register_event_handler(
        self, event_type: ProductEventType, handler: ProductEventHandler
    ) -> None:
        """
        Register an event handler for a specific event type.
        """
        self._event_handlers[event_type].add(handler)

    def unregister_event_handler(
        self, event_type: ProductEventType, handler: ProductEventHandler
    ) -> None:
        """
        Unregister an event handler.
        """
        self._event_handlers[event_type].discard(handler)

    def _notify_event_handlers(self, event: ProductEvent) -> None:
        """
        Notify all registered handlers of an event.
        """
        for handler in self._event_handlers[event.event_type]:
            try:
                handler.handle_event(event)
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.error("Error en el manejador de eventos: %s", exc)

    def set_sync_engine(self, sync_engine) -> None:
        """Attach a sync engine for remote coordination."""
        self.sync_engine = sync_engine

    def get_conflicts(self) -> List[Dict[str, Any]]:
        """Retrieve pending sync conflicts."""
        if not self.sync_engine:
            return []
        return self.sync_engine.get_conflicts()

    def get_sync_pending_count(self) -> int:
        """Return number of queued outbound changes."""
        if not self.sync_engine:
            return 0
        return self.sync_engine.pending_count()

    def get_sync_status(self) -> Dict[str, int]:
        """Provide a summary of the synchronization queue state."""
        if not self.sync_engine:
            return {"pending": 0, "waiting": 0, "errors": 0, "total": 0}
        return self.sync_engine.status_summary()

    def consume_conflicts(self) -> List[Dict[str, Any]]:
        """Return and clear accumulated sync conflicts."""
        if not self.sync_engine:
            return []
        return self.sync_engine.clear_conflicts()

    def _compute_changed_fields(
        self, original: Product, updated: Product
    ) -> Dict[str, Any]:
        """Compute field-level differences between two products."""
        tracked_fields = [
            "name",
            "description",
            "price",
            "discount",
            "stock",
            "category",
            "image_path",
            "image_avif_path",
            "order",
        ]
        diffs: Dict[str, Any] = {}
        for field_name in tracked_fields:
            if getattr(original, field_name) != getattr(updated, field_name):
                diffs[field_name] = getattr(updated, field_name)
        return diffs

    def _normalize_category_value(self, category_value: str) -> str:
        """Return canonical category key and validate catalog membership."""
        cleaned = (category_value or "").strip()
        if not cleaned or not self.category_service:
            return cleaned

        resolved_key = None
        resolver = getattr(self.category_service, "resolve_category_key", None)
        if callable(resolver):
            try:
                resolved_key = resolver(cleaned)
            except Exception:  # pylint: disable=broad-exception-caught
                resolved_key = None

        if resolved_key:
            return str(resolved_key).strip()

        match = self.category_service.find_category_by_product_key(cleaned)
        if match:
            return (match.product_key or "").strip()

        raise ProductServiceError(
            f"La categoría '{category_value}' no existe en el catálogo. "
            "Actualiza el catálogo de categorías antes de asignarla."
        )

    def _stamp_local_metadata(
        self, product: Product, fields: List[str], base_rev: int
    ) -> str:
        """Update metadata for locally modified fields and return timestamp."""
        timestamp = _utc_now_iso()
        product.rev = base_rev
        for field_name in fields:
            product.update_field_metadata(
                field_name,
                ts=timestamp,
                by="offline",
                rev=base_rev,
                base_rev=base_rev,
                changeset_id=None,
            )
        return timestamp

    def apply_server_snapshot(
        self,
        snapshot: Dict[str, Any],
        catalog_rev: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Product:
        """Apply server-provided product state locally."""
        with self._products_lock:
            products = self.get_all_products()
            target_name = snapshot.get("name")
            if not target_name:
                raise ProductServiceError(
                    "Instantánea de producto inválida: falta nombre"
                )
            new_product = Product.from_dict(snapshot)
            replaced = False
            for index, existing in enumerate(products):
                if existing.name.lower() == target_name.lower():
                    new_product.order = snapshot.get("order", existing.order)
                    products[index] = new_product
                    replaced = True
                    break
            if not replaced:
                new_product.order = snapshot.get("order", len(products))
                products.append(new_product)
            catalog_meta = {"rev": catalog_rev}
            if metadata:
                for key in ("version", "last_updated"):
                    if key in metadata:
                        catalog_meta[key] = metadata[key]
            self.repository.save_products(products, metadata=catalog_meta)
            self.clear_cache()
            self._rebuild_indexes()
            return new_product

    def get_all_products(self) -> List[Product]:
        """
        Get all products from the repository.
        """
        try:
            with self._products_lock:
                if self._products is None:
                    self._products = list(self.repository.load_products())
                return list(self._products)
        except ProductRepositoryError as exc:
            logger.error("Error al cargar productos: %s", exc)
            raise ProductServiceError(f"Error al cargar productos: {exc}") from exc

    def get_product_by_name(
        self, name: str, description: Optional[str] = None
    ) -> Product:
        """Get a product by its name, optionally disambiguated by description."""

        normalized_name = Product.normalized_name(name)
        if description is not None:
            self._ensure_indexes_ready()
            key = Product.identity_key_from_values(name, description)
            product = self._product_index.get(key)
            if not product:
                raise ProductNotFoundError(
                    f"Producto no encontrado: {name} / {description}"
                )
            return product

        matches = [
            product
            for product in self.get_all_products()
            if Product.normalized_name(product.name) == normalized_name
        ]

        if not matches:
            raise ProductNotFoundError(f"Producto no encontrado: {name}")
        if len(matches) > 1:
            raise ProductServiceError(
                "Existen múltiples productos con el mismo nombre. "
                "Proporcione la descripción para desambiguar la búsqueda."
            )
        return matches[0]

    def add_product(self, product: Product) -> None:
        """
        Add a new product.
        """
        with self._products_lock:
            self._ensure_indexes_ready()
            identity_key = product.identity_key()
            if identity_key in self._product_index:
                raise DuplicateProductError(
                    "Ya existe un producto con el mismo nombre y descripción."
                )
            try:
                products = self.get_all_products()
                product.category = self._normalize_category_value(product.category)
                product.order = len(products)
                self._stamp_local_metadata(
                    product,
                    [
                        "name",
                        "description",
                        "price",
                        "discount",
                        "stock",
                        "category",
                        "image_path",
                        "order",
                    ],
                    0,
                )
                products.append(product)
                self.repository.save_products(products)
                self._product_index[identity_key] = product
                if product.category:
                    self._category_index[product.category.lower()].add(product)
                self.clear_cache()
                self._notify_event_handlers(
                    ProductEvent(
                        ProductEventType.CREATED,
                        product.name,
                        details={"category": product.category},
                    )
                )
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.error("Error al agregar producto: %s", exc)
                raise ProductServiceError(
                    f"Error al agregar producto: {exc}"
                ) from exc

    def update_product(
        self,
        original_name: str,
        updated_product: Product,
        original_description: Optional[str] = None,
    ) -> None:
        """Update an existing product, supporting duplicate names via description."""
        queue_payload: Optional[Dict[str, Any]] = None
        history_entries: Optional[List[Tuple[str, str, Dict[str, Any]]]] = None
        with self._products_lock:
            self._ensure_indexes_ready()
            try:
                original_product = self.get_product_by_name(
                    original_name, original_description
                )
                before_snapshot = original_product.to_dict()
                original_key = original_product.identity_key()
                updated_key = updated_product.identity_key()
                if updated_key != original_key and updated_key in self._product_index:
                    raise DuplicateProductError(
                        "Ya existe un producto con el mismo nombre y descripción."
                    )
                products = self.get_all_products()
                changes = self._compute_changed_fields(
                    original_product, updated_product
                )
                if not changes:
                    return
                updated_product.category = self._normalize_category_value(
                    updated_product.category
                )
                base_rev = original_product.rev
                timestamp = self._stamp_local_metadata(
                    updated_product, list(changes.keys()), base_rev
                )
                if updated_key != original_key:
                    self._product_index.pop(original_key, None)
                self._product_index[updated_key] = updated_product
                if original_product.category:
                    self._category_index[original_product.category.lower()].discard(
                        original_product
                    )
                if updated_product.category:
                    self._category_index[updated_product.category.lower()].add(
                        updated_product
                    )
                index = products.index(original_product)
                updated_product.order = original_product.order
                products[index] = updated_product
                self.repository.save_products(products)
                self.clear_cache()
                self._notify_event_handlers(
                    ProductEvent(
                        ProductEventType.UPDATED,
                        updated_product.name,
                        details={
                            "nombre_anterior": original_name,
                            "categoria_anterior": original_product.category,
                            "nueva_categoria": updated_product.category,
                        },
                    )
                )
                history_entries = [
                    (
                        original_key,
                        updated_key,
                        {
                            "ts": _utc_now_iso(),
                            "operation": "editar",
                            "before": before_snapshot,
                            "after": updated_product.to_dict(),
                        },
                    )
                ]
                queue_payload = {
                    "product_id": original_product.name,
                    "base_rev": base_rev,
                    "fields": changes,
                    "timestamp": timestamp,
                    "snapshot": updated_product.to_dict(),
                }
            except ValueError as exc:
                raise ProductNotFoundError(
                    f"Producto no encontrado: {original_name}"
                ) from exc
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.error("Error al actualizar producto: %s", exc)
                raise ProductServiceError(
                    f"Error al actualizar producto: {exc}"
                ) from exc
        if history_entries is not None:
            self._record_history_entries(history_entries)
        if self.sync_engine and queue_payload:
            self.sync_engine.enqueue_update(**queue_payload)

    def delete_product(self, name: str, description: Optional[str] = None) -> bool:
        """Archive a product by its name and optional description."""
        with self._products_lock:
            try:
                product = self.get_product_by_name(name, description)
                if product.is_archived:
                    return False
                products = self.get_all_products()
                before_snapshot = product.to_dict()
                product.is_archived = True
                self.repository.save_products(products)
                self.clear_cache()
                self._notify_event_handlers(
                    ProductEvent(
                        ProductEventType.DELETED,
                        name,
                        details={"category": product.category, "archived": True},
                    )
                )
                entry = {
                    "ts": _utc_now_iso(),
                    "operation": "archivar",
                    "before": before_snapshot,
                    "after": product.to_dict(),
                }
                self._record_history_entries(
                    [(product.identity_key(), product.identity_key(), entry)]
                )
                return True
            except ProductNotFoundError:
                return False
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.error("Error al eliminar producto: %s", exc)
                raise ProductServiceError(
                    f"Error al eliminar producto: {exc}"
                ) from exc

    def get_categories(self) -> List[str]:
        """
        Get a list of unique categories.
        """
        if self.category_service:
            return [
                product_key
                for _, product_key in self.category_service.list_category_choices()
            ]
        categories = {
            product.category for product in self.get_all_products() if product.category
        }
        return sorted(categories)

    def get_category_choices(self) -> List[Tuple[str, str]]:
        """
        Return (display_name, product_key) tuples for category selection widgets.
        """
        if self.category_service:
            choices = self.category_service.list_category_choices()
        else:
            categories = self.get_categories()
            choices = [(category, category) for category in categories]
        return sorted(choices, key=lambda entry: (entry[0] or "").casefold())

    def get_products_by_category(self, category: str) -> List[Product]:
        """
        Get all products in a specific category.
        """
        category_lower = category.lower()
        return sorted(
            [
                p
                for p in self.get_all_products()
                if p.category.lower() == category_lower
            ],
            key=lambda p: p.order,
        )

    def count_products_by_category(self, category: str) -> int:
        """Return the number of products assigned to the given category key."""
        normalized = (category or "").strip().lower()
        if not normalized:
            return 0
        with self._products_lock:
            return sum(
                1
                for product in self.get_all_products()
                if (product.category or "").strip().lower() == normalized
            )

    def reassign_category(self, old_category: str, new_category: str) -> int:
        """Reassign all products from old_category to new_category."""
        old_normalized = (old_category or "").strip().lower()
        if not old_normalized:
            return 0
        old_category_key = self._normalize_category_value(old_category)
        if old_category_key:
            old_normalized = old_category_key.lower()
        new_category_key = self._normalize_category_value(new_category)
        if not new_category_key:
            return 0
        updated = 0
        with self._products_lock:
            products = self.get_all_products()
            for product in products:
                if (product.category or "").strip().lower() == old_normalized:
                    product.category = new_category_key
                    self._stamp_local_metadata(product, ["category"], product.rev)
                    updated += 1
            if updated:
                self.repository.save_products(products)
                self.clear_cache()
                self._rebuild_indexes()
        return updated

    def search_products(self, query: str) -> List[Product]:
        """
        Search for products by name or description.
        Legacy method, prefer using filter_products.
        """
        return self.filter_products(ProductFilterCriteria(query=query))

    def filter_products(self, criteria: ProductFilterCriteria) -> List[Product]:
        """Filter products based on multiple criteria."""
        with self._products_lock:
            # Start with all products
            # Ideally this could be optimized with better indexing if dataset gets large,
            # but for <10k items linear scan with python is usually fine.
            products = self.get_all_products()
            if getattr(criteria, "show_archived_only", False):
                products = [p for p in products if getattr(p, "is_archived", False)]
            else:
                products = [p for p in products if not getattr(p, "is_archived", False)]

            # 1. Category Filter
            if criteria.category:
                normalized_cat = criteria.category.strip().lower()
                products = [
                    p
                    for p in products
                    if (p.category or "").strip().lower() == normalized_cat
                ]

            # 2. Text Search
            if criteria.query:
                q = criteria.query.lower()
                products = [
                    p
                    for p in products
                    if q in p.name.lower()
                    or (p.description and q in p.description.lower())
                ]

            # 3. Attributes
            if criteria.only_discount:
                products = [p for p in products if (p.discount or 0) > 0]

            if criteria.only_out_of_stock:
                products = [p for p in products if not p.stock]

            if criteria.min_price is not None:
                products = [p for p in products if p.price >= criteria.min_price]

            if criteria.max_price is not None:
                products = [p for p in products if p.price <= criteria.max_price]

            # 4. Sorting (Default by order)
            return sorted(products, key=lambda p: p.order)

    def reorder_products(self, new_order: List[Product]) -> None:
        """
        Reorder products based on the provided list.
        """
        with self._products_lock:
            try:
                for i, product in enumerate(new_order):
                    product.order = i
                self.repository.save_products(new_order)
                self._products = new_order
                self.clear_cache()
                self._notify_event_handlers(
                    ProductEvent(
                        ProductEventType.REORDERED,
                        "",
                        details={"cantidad_productos": len(new_order)},
                    )
                )
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.error("Error al reordenar productos: %s", exc)
                raise ProductServiceError(
                    f"Error al reordenar productos: {exc}"
                ) from exc

    def clear_cache(self) -> None:
        """Clear all cached data."""
        self._products = None
        self._product_index.clear()
        self._category_index.clear()
        self._indexes_populated = False

    def batch_update(
        self,
        updates: Sequence[ProductUpdateSpec],
        *,
        operation: str = "bulk",
    ) -> None:
        """Perform multiple updates in a single transaction."""
        # Complex transactional logic; keep localized for now.
        # pylint: disable=too-many-locals,too-many-branches

        if not updates:
            return

        with self._products_lock:
            try:
                products = self.get_all_products()
                identity_map = {p.identity_key(): p for p in products}
                name_groups: Dict[str, List[Product]] = defaultdict(list)
                history_entries: List[Tuple[str, str, Dict[str, Any]]] = []
                for product in products:
                    name_groups[Product.normalized_name(product.name)].append(product)

                normalized_updates: List[Tuple[str, str, Product]] = []
                for entry in updates:
                    if len(entry) == 2:
                        original_name, updated_product = entry
                        matches = name_groups.get(
                            Product.normalized_name(original_name), []
                        )
                        if not matches:
                            raise ProductNotFoundError(
                                f"Producto no encontrado: {original_name}"
                            )
                        if len(matches) > 1:
                            raise ProductServiceError(
                                "Existen múltiples productos con el mismo nombre. "
                                "Incluya la descripción original para continuar."
                            )
                        normalized_updates.append(
                            (original_name, matches[0].description, updated_product)
                        )
                    elif len(entry) == 3:
                        original_name, original_description, updated_product = entry
                        normalized_updates.append(
                            (original_name, original_description, updated_product)
                        )
                    else:
                        raise ProductServiceError(
                            "Formato de actualización inválido en lote."
                        )

                projected_keys = set(identity_map.keys())
                processed_updates: List[Tuple[str, str, Product]] = []
                for (
                    original_name,
                    original_description,
                    updated_product,
                ) in normalized_updates:
                    original_key = Product.identity_key_from_values(
                        original_name, original_description
                    )
                    if original_key not in projected_keys:
                        raise ProductNotFoundError(
                            f"Producto no encontrado: {original_name} / {original_description}"
                        )
                    new_key = updated_product.identity_key()
                    projected_keys.remove(original_key)
                    if new_key in projected_keys:
                        raise DuplicateProductError(
                            "La actualización crearía productos duplicados con el mismo "
                            "nombre y descripción."
                        )
                    projected_keys.add(new_key)
                    processed_updates.append((original_key, new_key, updated_product))

                for original_key, new_key, updated_product in processed_updates:
                    original_product = identity_map[original_key]
                    before_snapshot = original_product.to_dict()
                    index = products.index(original_product)
                    updated_product.category = self._normalize_category_value(
                        updated_product.category
                    )
                    updated_product.order = products[index].order
                    products[index] = updated_product
                    identity_map.pop(original_key, None)
                    identity_map[new_key] = updated_product
                    history_entries.append(
                        (
                            original_key,
                            new_key,
                            {
                                "ts": _utc_now_iso(),
                                "operation": operation,
                                "before": before_snapshot,
                                "after": updated_product.to_dict(),
                            },
                        )
                    )

                self.repository.save_products(products)
                self.clear_cache()
                self._rebuild_indexes()
                self._notify_event_handlers(
                    ProductEvent(
                        ProductEventType.UPDATED,
                        "",
                        details={"actualizaciones_totales": len(updates)},
                    )
                )
                self._record_history_entries(history_entries)
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.error("Error en actualización por lotes: %s", exc)
                raise ProductServiceError(
                    f"Error en actualización por lotes: {exc}"
                ) from exc

    def save_all_products(
        self,
        products: Sequence[Product],
        history_entries: Optional[Sequence[Tuple[str, str, Dict[str, Any]]]] = None,
    ) -> None:
        """Persist a full product list with a single atomic write.

        History recording happens only after the catalog save succeeds.
        """
        entries_list: Optional[List[Tuple[str, str, Dict[str, Any]]]] = None
        if history_entries is not None:
            try:
                entries_list = list(history_entries)
            except TypeError:
                entries_list = None
        try:
            normalized_products = list(products)
            for product in normalized_products:
                product.category = self._normalize_category_value(product.category)
            self.repository.save_products(normalized_products)
            self.clear_cache()
            self._rebuild_indexes()
            if entries_list:
                self._record_history_entries(entries_list)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.error("Error al guardar catálogo completo: %s", exc)
            raise ProductServiceError(
                f"Error al guardar catálogo completo: {exc}"
            ) from exc

    def get_product_history(self, product: Product) -> List[Dict[str, Any]]:
        """Return history entries for a product, newest first."""
        history = self._history_store.load_history()
        entries = history.get(product.identity_key(), [])
        if not isinstance(entries, list):
            return []
        return list(reversed(entries))

    def get_history_entry(
        self, product: Product, index: int
    ) -> Optional[Dict[str, Any]]:
        """Return a single history entry by index (newest first)."""
        entries = self.get_product_history(product)
        if index < 0 or index >= len(entries):
            return None
        return entries[index]

    def revert_product_to_snapshot(
        self,
        current: Product,
        snapshot: Product,
        operation: str = "revertir",
    ) -> None:
        """Revert a product to a historical snapshot with one atomic write."""
        with self._products_lock:
            products = self.get_all_products()
            identity_map = {product.identity_key(): product for product in products}
            current_key = current.identity_key()
            snapshot_key = snapshot.identity_key()
            if current_key not in identity_map:
                raise ProductNotFoundError(
                    f"Producto no encontrado: {current.name} / {current.description}"
                )
            current_product = identity_map[current_key]
            other = identity_map.get(snapshot_key)
            if other is not None and other is not current_product:
                raise DuplicateProductError(
                    "La reversión generaría un producto duplicado con el mismo "
                    "nombre y descripción."
                )
            try:
                candidate = Product.from_dict(snapshot.to_dict())
            except Exception as exc:  # pylint: disable=broad-exception-caught
                raise ProductServiceError(
                    f"Snapshot inválido para revertir: {exc}"
                ) from exc
            index = products.index(current_product)
            candidate.order = current_product.order
            candidate.rev = current_product.rev
            candidate.field_last_modified = deepcopy(
                current_product.field_last_modified
            )
            products[index] = candidate
            before_snapshot = current_product.to_dict()
            entry = {
                "ts": _utc_now_iso(),
                "operation": operation,
                "before": before_snapshot,
                "after": candidate.to_dict(),
            }
            self.save_all_products(
                products, history_entries=[(current_key, snapshot_key, entry)]
            )

    def build_import_plan(self, file_path: str) -> Dict[str, Any]:
        """Build a dry-run import plan from a JSON file."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            raise ProductServiceError(
                f"No se pudo leer el archivo de importación: {exc}"
            ) from exc

        if not isinstance(payload, list):
            raise ProductServiceError(
                "El archivo de importación debe contener una lista de productos."
            )

        existing = self.get_all_products()
        identity_map = {product.identity_key(): product for product in existing}

        rows: List[Dict[str, Any]] = []
        summary = {
            "new": 0,
            "duplicate": 0,
            "invalid": 0,
            "add": 0,
            "update": 0,
            "skip": 0,
        }

        for index, item in enumerate(payload):
            row: Dict[str, Any] = {
                "index": index,
                "identity_key": "",
                "status": "invalid",
                "action": "skip",
                "error": None,
                "incoming": None,
                "existing": None,
            }
            try:
                product = Product.from_dict(item)
                product.category = self._normalize_category_value(product.category)
                row["incoming"] = product
                row["identity_key"] = product.identity_key()
            except ProductServiceError as exc:
                row["error"] = str(exc)
                rows.append(row)
                summary["invalid"] += 1
                summary["skip"] += 1
                continue
            except Exception as exc:  # pylint: disable=broad-exception-caught
                row["error"] = str(exc)
                rows.append(row)
                summary["invalid"] += 1
                summary["skip"] += 1
                continue

            existing_product = identity_map.get(row["identity_key"])
            if existing_product:
                row["status"] = "duplicate"
                row["action"] = "update"
                row["existing"] = existing_product
                summary["duplicate"] += 1
                summary["update"] += 1
            else:
                row["status"] = "new"
                row["action"] = "add"
                summary["new"] += 1
                summary["add"] += 1

            rows.append(row)

        return {
            "source_path": file_path,
            "rows": rows,
            "summary": summary,
        }

    def get_version_info(self) -> VersionInfo:
        """Get current version information."""
        try:
            with self._products_lock:
                products = self.get_all_products()
                catalog_meta = self.repository.get_catalog_meta()
                version = catalog_meta.get("version") or datetime.now().strftime(
                    "%Y%m%d-%H%M%S"
                )
                last_updated_raw = catalog_meta.get("last_updated")
                last_updated = parse_iso_datetime(
                    last_updated_raw if isinstance(last_updated_raw, str) else None,
                    default=datetime.now(),
                ) or datetime.now()
                return VersionInfo(
                    version=str(version),
                    last_updated=last_updated,
                    product_count=len(products),
                )
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.error("Error getting version info: %s", exc)
            return VersionInfo(
                version=datetime.now().strftime("%Y%m%d-%H%M%S"),
                last_updated=datetime.now(),
                product_count=len(self.get_all_products()),
            )
