from typing import List, Optional, Dict, Set, Protocol, Any, Tuple, Union, cast, TYPE_CHECKING
from models import Product
from repositories import ProductRepositoryProtocol, ProductRepositoryError
import logging
from functools import lru_cache
from dataclasses import dataclass, field
from datetime import datetime, timezone
import threading
from collections import defaultdict
from enum import Enum, auto
import json

if TYPE_CHECKING:
    from category_service import CategoryService

logger = logging.getLogger(__name__)

ProductUpdateSpec = Union[Tuple[str, Product], Tuple[str, str, Product]]


def _utc_now_iso() -> str:
    """Return current UTC timestamp with millisecond precision."""
    dt = datetime.now(timezone.utc)
    try:
        return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    except TypeError:
        return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


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
class VersionInfo:
    """Version information for product catalog."""
    version: str
    last_updated: datetime
    product_count: int


class ProductServiceError(Exception):
    """Base exception for ProductService errors."""
    pass


class ProductNotFoundError(ProductServiceError):
    """Raised when a product is not found."""
    pass


class DuplicateProductError(ProductServiceError):
    """Raised when attempting to create a duplicate product."""
    pass


class ProductEventHandler(Protocol):
    """Protocol for product event handlers."""

    def handle_event(self, event: ProductEvent) -> None:
        """Handle a product event."""
        ...


class ProductService:
    """Service class for managing product operations."""

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
        self._event_handlers: Dict[ProductEventType,
                                   Set[ProductEventHandler]] = defaultdict(set)
        self._product_index: Dict[str, Product] = {}
        self._category_index: Dict[str, Set[Product]] = defaultdict(set)
        self._indexes_populated = False
        self.sync_engine = None
        self.category_service = category_service
        if self.category_service:
            self.category_service.attach_product_service(self)
        self._rebuild_indexes()

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

    def set_category_service(self, category_service: Optional["CategoryService"]) -> None:
        """Attach or replace the category service reference."""
        with self._products_lock:
            self.category_service = category_service
            if self.category_service:
                self.category_service.attach_product_service(self)

    def register_event_handler(self, event_type: ProductEventType, handler: ProductEventHandler) -> None:
        """
        Register an event handler for a specific event type.
        """
        self._event_handlers[event_type].add(handler)

    def unregister_event_handler(self, event_type: ProductEventType, handler: ProductEventHandler) -> None:
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
            except Exception as e:
                logger.error(f"Error en el manejador de eventos: {e}")

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

    def _compute_changed_fields(self, original: Product, updated: Product) -> Dict[str, Any]:
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

    def _ensure_category_known(self, category_value: str) -> None:
        """Validate that the provided category exists in the catalog when configured."""
        if not category_value or not self.category_service:
            return
        match = self.category_service.find_category_by_product_key(category_value)
        if not match:
            raise ProductServiceError(
                f"La categoría '{category_value}' no existe en el catálogo. "
                "Actualiza el catálogo de categorías antes de asignarla."
            )

    def _stamp_local_metadata(self, product: Product, fields: List[str], base_rev: int) -> str:
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
                changeset_id=None
            )
        return timestamp

    def apply_server_snapshot(self, snapshot: Dict[str, Any], catalog_rev: int, metadata: Optional[Dict[str, Any]] = None) -> Product:
        """Apply server-provided product state locally."""
        with self._products_lock:
            products = self.get_all_products()
            target_name = snapshot.get("name")
            if not target_name:
                raise ProductServiceError(
                    "Instantánea de producto inválida: falta nombre")
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
        except ProductRepositoryError as e:
            logger.error(f"Error al cargar productos: {e}")
            raise ProductServiceError(f"Error al cargar productos: {e}")

    def get_product_by_name(self, name: str, description: Optional[str] = None) -> Product:
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
                self._ensure_category_known(product.category)
                product.order = len(products)
                self._stamp_local_metadata(
                    product,
                    ["name", "description", "price", "discount",
                        "stock", "category", "image_path", "order"],
                    0
                )
                products.append(product)
                self.repository.save_products(products)
                self._product_index[identity_key] = product
                if product.category:
                    self._category_index[product.category.lower()].add(product)
                self.clear_cache()
                self._notify_event_handlers(ProductEvent(
                    ProductEventType.CREATED,
                    product.name,
                    details={'category': product.category}
                ))
            except Exception as e:
                logger.error(f"Error al agregar producto: {e}")
                raise ProductServiceError(f"Error al agregar producto: {e}")

    def update_product(
        self,
        original_name: str,
        updated_product: Product,
        original_description: Optional[str] = None
    ) -> None:
        """Update an existing product, supporting duplicate names via description."""
        queue_payload: Optional[Dict[str, Any]] = None
        with self._products_lock:
            self._ensure_indexes_ready()
            try:
                original_product = self.get_product_by_name(
                    original_name, original_description
                )
                original_key = original_product.identity_key()
                updated_key = updated_product.identity_key()
                if updated_key != original_key and updated_key in self._product_index:
                    raise DuplicateProductError(
                        "Ya existe un producto con el mismo nombre y descripción."
                    )
                products = self.get_all_products()
                changes = self._compute_changed_fields(
                    original_product, updated_product)
                if not changes:
                    return
                self._ensure_category_known(updated_product.category)
                base_rev = original_product.rev
                timestamp = self._stamp_local_metadata(
                    updated_product,
                    list(changes.keys()),
                    base_rev
                )
                if updated_key != original_key:
                    self._product_index.pop(original_key, None)
                self._product_index[updated_key] = updated_product
                if original_product.category:
                    self._category_index[original_product.category.lower()].discard(
                        original_product)
                if updated_product.category:
                    self._category_index[updated_product.category.lower()].add(
                        updated_product)
                index = products.index(original_product)
                updated_product.order = original_product.order
                products[index] = updated_product
                self.repository.save_products(products)
                self.clear_cache()
                self._notify_event_handlers(ProductEvent(
                    ProductEventType.UPDATED,
                    updated_product.name,
                    details={
                        'nombre_anterior': original_name,
                        'categoria_anterior': original_product.category,
                        'nueva_categoria': updated_product.category
                    }
                ))
                queue_payload = {
                    "product_id": original_product.name,
                    "base_rev": base_rev,
                    "fields": changes,
                    "timestamp": timestamp,
                    "snapshot": updated_product.to_dict(),
                }
            except ValueError:
                raise ProductNotFoundError(
                    f"Producto no encontrado: {original_name}")
            except Exception as e:
                logger.error(f"Error al actualizar producto: {e}")
                raise ProductServiceError(f"Error al actualizar producto: {e}")
        if self.sync_engine and queue_payload:
            self.sync_engine.enqueue_update(**queue_payload)

    def delete_product(self, name: str, description: Optional[str] = None) -> bool:
        """Delete a product by its name and optional description."""
        with self._products_lock:
            try:
                product = self.get_product_by_name(name, description)
                products = self.get_all_products()
                products.remove(product)
                self._product_index.pop(product.identity_key(), None)
                if product.category:
                    self._category_index[product.category.lower()].discard(
                        product)
                self.repository.save_products(products)
                self.clear_cache()
                self._notify_event_handlers(ProductEvent(
                    ProductEventType.DELETED,
                    name,
                    details={'category': product.category}
                ))
                return True
            except ProductNotFoundError:
                return False
            except Exception as e:
                logger.error(f"Error al eliminar producto: {e}")
                raise ProductServiceError(f"Error al eliminar producto: {e}")

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
            product.category
            for product in self.get_all_products()
            if product.category
        }
        return sorted(categories)

    def get_category_choices(self) -> List[Tuple[str, str]]:
        """
        Return (display_name, product_key) tuples for category selection widgets.
        """
        if self.category_service:
            return self.category_service.list_category_choices()
        categories = self.get_categories()
        return [(category, category) for category in categories]

    def get_products_by_category(self, category: str) -> List[Product]:
        """
        Get all products in a specific category.
        """
        category_lower = category.lower()
        return sorted(
            [p for p in self.get_all_products() if p.category.lower()
             == category_lower],
            key=lambda p: p.order
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
        self._ensure_category_known(new_category)
        updated = 0
        with self._products_lock:
            products = self.get_all_products()
            for product in products:
                if (product.category or "").strip().lower() == old_normalized:
                    product.category = new_category
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
        """
        query = query.lower()
        return sorted(
            [p for p in self.get_all_products() if query in p.name.lower() or (
                p.description and query in p.description.lower())],
            key=lambda p: p.order
        )

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
                self._notify_event_handlers(ProductEvent(
                    ProductEventType.REORDERED,
                    '',
                    details={'cantidad_productos': len(new_order)}
                ))
            except Exception as e:
                logger.error(f"Error al reordenar productos: {e}")
                raise ProductServiceError(f"Error al reordenar productos: {e}")

    def clear_cache(self) -> None:
        """Clear all cached data."""
        self._products = None
        self._product_index.clear()
        self._category_index.clear()
        self._indexes_populated = False

    def batch_update(self, updates: List[ProductUpdateSpec]) -> None:
        """Perform multiple updates in a single transaction."""

        if not updates:
            return

        with self._products_lock:
            try:
                products = self.get_all_products()
                identity_map = {p.identity_key(): p for p in products}
                name_groups: Dict[str, List[Product]] = defaultdict(list)
                for product in products:
                    name_groups[Product.normalized_name(product.name)].append(product)

                normalized_updates: List[Tuple[str, str, Product]] = []
                for entry in updates:
                    if len(entry) == 2:
                        original_name, updated_product = cast(Tuple[str, Product], entry)
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
                        original_name, original_description, updated_product = cast(
                            Tuple[str, str, Product], entry
                        )
                        normalized_updates.append(
                            (original_name, original_description, updated_product)
                        )
                    else:
                        raise ProductServiceError(
                            "Formato de actualización inválido en lote."
                        )

                projected_keys = set(identity_map.keys())
                processed_updates: List[Tuple[str, str, Product]] = []
                for original_name, original_description, updated_product in normalized_updates:
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
                            "La actualización crearía productos duplicados con el mismo nombre y descripción."
                        )
                    projected_keys.add(new_key)
                    processed_updates.append((original_key, new_key, updated_product))

                for original_key, new_key, updated_product in processed_updates:
                    original_product = identity_map[original_key]
                    index = products.index(original_product)
                    self._ensure_category_known(updated_product.category)
                    updated_product.order = products[index].order
                    products[index] = updated_product
                    identity_map.pop(original_key, None)
                    identity_map[new_key] = updated_product

                self.repository.save_products(products)
                self.clear_cache()
                self._rebuild_indexes()
                self._notify_event_handlers(
                    ProductEvent(
                        ProductEventType.UPDATED,
                        '',
                        details={'actualizaciones_totales': len(updates)}
                    )
                )
            except Exception as e:
                logger.error(f"Error en actualización por lotes: {e}")
                raise ProductServiceError(
                    f"Error en actualización por lotes: {e}"
                )

    def get_version_info(self) -> VersionInfo:
        """Get current version information."""
        try:
            with self._products_lock:
                products = self.get_all_products()
                with self.repository._open_file('r') as file:
                    data = json.load(file)
                    if isinstance(data, list):
                        return VersionInfo(
                            version=datetime.now().strftime('%Y%m%d-%H%M%S'),
                            last_updated=datetime.now(),
                            product_count=len(products)
                        )
                    return VersionInfo(
                        version=data.get(
                            'version', datetime.now().strftime('%Y%m%d-%H%M%S')),
                        last_updated=datetime.fromisoformat(
                            data.get('last_updated', datetime.now().isoformat())),
                        product_count=len(products)
                    )
        except Exception as e:
            logger.error(f"Error getting version info: {e}")
            return VersionInfo(
                version=datetime.now().strftime('%Y%m%d-%H%M%S'),
                last_updated=datetime.now(),
                product_count=len(self.get_all_products())
            )
