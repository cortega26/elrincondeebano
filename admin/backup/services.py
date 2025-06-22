from typing import List, Optional, Dict, Set, Protocol, Callable
from models import Product
from repositories import ProductRepositoryProtocol, ProductRepositoryError
import logging
from functools import lru_cache
from dataclasses import dataclass, field
from datetime import datetime
import threading
from collections import defaultdict
from enum import Enum, auto
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

    def __init__(self, repository: ProductRepositoryProtocol):
        """
        Initialize the ProductService.

        Args:
            repository (ProductRepositoryProtocol): The product repository to use
        """
        self.repository = repository
        self._products: Optional[List[Product]] = None
        self._products_lock = threading.RLock()
        self._event_handlers: Dict[ProductEventType, Set[ProductEventHandler]] = defaultdict(set)
        self._product_index: Dict[str, Product] = {}
        self._category_index: Dict[str, Set[Product]] = defaultdict(set)
        
        # Initialize indexes
        self._rebuild_indexes()

    def _rebuild_indexes(self) -> None:
        """Rebuild the internal indexes for faster lookups."""
        with self._products_lock:
            products = self.get_all_products()
            
            # Reset indexes
            self._product_index.clear()
            self._category_index.clear()
            
            # Rebuild indexes
            for product in products:
                self._product_index[product.name.lower()] = product
                if product.category:
                    self._category_index[product.category.lower()].add(product)

    def register_event_handler(self, event_type: ProductEventType, 
                             handler: ProductEventHandler) -> None:
        """
        Register an event handler for a specific event type.

        Args:
            event_type (ProductEventType): The type of event to handle
            handler (ProductEventHandler): The handler to register
        """
        self._event_handlers[event_type].add(handler)

    def unregister_event_handler(self, event_type: ProductEventType, 
                                handler: ProductEventHandler) -> None:
        """
        Unregister an event handler.

        Args:
            event_type (ProductEventType): The type of event
            handler (ProductEventHandler): The handler to unregister
        """
        self._event_handlers[event_type].discard(handler)

    def _notify_event_handlers(self, event: ProductEvent) -> None:
        """
        Notify all registered handlers of an event.

        Args:
            event (ProductEvent): The event to notify about
        """
        for handler in self._event_handlers[event.event_type]:
            try:
                handler.handle_event(event)
            except Exception as e:
                logger.error(f"Error en el manejador de eventos: {e}")

    @lru_cache(maxsize=None)
    def get_all_products(self) -> List[Product]:
        """
        Get all products from the repository.

        Returns:
            List[Product]: A list of all products

        Raises:
            ProductServiceError: If there's an error loading the products
        """
        try:
            with self._products_lock:
                if self._products is None:
                    self._products = self.repository.load_products()
                return self._products.copy()
        except ProductRepositoryError as e:
            logger.error(f"Error al cargar productos: {e}")
            raise ProductServiceError(f"Error al cargar productos: {e}")

    def get_product_by_name(self, name: str) -> Product:
        """
        Get a product by its name.

        Args:
            name (str): The name of the product to find

        Returns:
            Product: The found product

        Raises:
            ProductNotFoundError: If the product is not found
        """
        product = self._product_index.get(name.lower())
        if not product:
            raise ProductNotFoundError(f"Producto no encontrado: {name}")
        return product

    def add_product(self, product: Product) -> None:
        """
        Add a new product.

        Args:
            product (Product): The product to add

        Raises:
            DuplicateProductError: If a product with the same name exists
            ProductServiceError: If there's an error saving the product
        """
        with self._products_lock:
            if product.name.lower() in self._product_index:
                raise DuplicateProductError(f"El producto ya existe: {product.name}")

            try:
                products = self.get_all_products()
                product.order = len(products)
                products.append(product)
                self.repository.save_products(products)
                
                # Update indexes
                self._product_index[product.name.lower()] = product
                if product.category:
                    self._category_index[product.category.lower()].add(product)
                
                # Clear cache and notify
                self.clear_cache()
                self._notify_event_handlers(ProductEvent(
                    ProductEventType.CREATED,
                    product.name,
                    details={'category': product.category}
                ))
            except Exception as e:
                logger.error(f"Error al agregar producto: {e}")
                raise ProductServiceError(f"Error al agregar producto: {e}")

    def update_product(self, original_name: str, updated_product: Product) -> None:
        """
        Update an existing product.

        Args:
            original_name (str): The name of the product to update
            updated_product (Product): The updated product information

        Raises:
            ProductNotFoundError: If the product is not found
            ProductServiceError: If there's an error saving the update
        """
        with self._products_lock:
            try:
                original_product = self.get_product_by_name(original_name)
                products = self.get_all_products()
                
                # Update indexes
                if original_name.lower() != updated_product.name.lower():
                    del self._product_index[original_name.lower()]
                self._product_index[updated_product.name.lower()] = updated_product
                
                if original_product.category:
                    self._category_index[original_product.category.lower()].discard(original_product)
                if updated_product.category:
                    self._category_index[updated_product.category.lower()].add(updated_product)
                
                # Update product list
                index = products.index(original_product)
                updated_product.order = original_product.order
                products[index] = updated_product
                
                # Save and notify
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
            except ValueError:
                raise ProductNotFoundError(f"Producto no encontrado: {original_name}")
            except Exception as e:
                logger.error(f"Error al actualizar producto: {e}")
                raise ProductServiceError(f"Error al actualizar producto: {e}")

    def delete_product(self, name: str) -> bool:
        """
        Delete a product by its name.

        Args:
            name (str): The name of the product to delete

        Returns:
            bool: True if the product was deleted

        Raises:
            ProductServiceError: If there's an error during deletion
        """
        with self._products_lock:
            try:
                product = self.get_product_by_name(name)
                products = self.get_all_products()
                products.remove(product)
                
                # Update indexes
                del self._product_index[name.lower()]
                if product.category:
                    self._category_index[product.category.lower()].discard(product)
                
                # Save and notify
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

    @lru_cache(maxsize=100)
    def get_categories(self) -> List[str]:
        """
        Get a list of unique categories.

        Returns:
            List[str]: A sorted list of unique categories preserving original case
        """
        # Get unique categories preserving original case
        categories = set()
        for product in self.get_all_products():
            if product.category:  # Only add non-empty categories
                categories.add(product.category)
        return sorted(categories)

    def get_products_by_category(self, category: str) -> List[Product]:
        """
        Get all products in a specific category.

        Args:
            category (str): The category to filter by

        Returns:
            List[Product]: List of products in the category
        """
        # Make search case-insensitive but preserve original case in results
        category_lower = category.lower()
        return sorted(
            [p for p in self.get_all_products() 
            if p.category.lower() == category_lower],
            key=lambda p: p.order
        )

    def search_products(self, query: str) -> List[Product]:
        """
        Search for products by name or description.

        Args:
            query (str): The search query

        Returns:
            List[Product]: List of matching products
        """
        query = query.lower()
        return sorted(
            [p for p in self.get_all_products()
             if query in p.name.lower() or 
                (p.description and query in p.description.lower())],
            key=lambda p: p.order
        )

    def reorder_products(self, new_order: List[Product]) -> None:
        """
        Reorder products based on the provided list.

        Args:
            new_order (List[Product]): The new order of products

        Raises:
            ProductServiceError: If there's an error saving the new order
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
        self.get_all_products.cache_clear()
        self.get_categories.cache_clear()

    def batch_update(self, updates: List[tuple[str, Product]]) -> None:
        """
        Perform multiple updates in a single transaction.

        Args:
            updates: List of (original_name, updated_product) tuples

        Raises:
            ProductServiceError: If any update fails
        """
        with self._products_lock:
            try:
                products = self.get_all_products()
                product_dict = {p.name.lower(): p for p in products}
                
                # Validate all updates first
                for original_name, _ in updates:
                    if original_name.lower() not in product_dict:
                        raise ProductNotFoundError(f"Producto no encontrado: {original_name}")
                
                # Apply updates
                for original_name, updated_product in updates:
                    index = products.index(product_dict[original_name.lower()])
                    updated_product.order = products[index].order
                    products[index] = updated_product
                
                # Save all changes
                self.repository.save_products(products)
                self.clear_cache()
                self._rebuild_indexes()
                
                # Notify about batch update
                self._notify_event_handlers(ProductEvent(
                    ProductEventType.UPDATED,
                    '',
                    details={'actualizaciones_totales': len(updates)}
                ))
            except Exception as e:
                logger.error(f"Error en actualización por lotes: {e}")
                raise ProductServiceError(f"Error en actualización por lotes: {e}")

    def get_version_info(self) -> VersionInfo:
        """Get current version information."""
        try:
            with self._products_lock:
                products = self.get_all_products()
                with self.repository._open_file('r') as file:
                    data = json.load(file)
                    
                    # Si es el formato antiguo (lista), crear metadata inicial
                    if isinstance(data, list):
                        return VersionInfo(
                            version=datetime.now().strftime('%Y%m%d-%H%M%S'),
                            last_updated=datetime.now(),
                            product_count=len(products)
                        )
                    
                    # Si es el nuevo formato con versión
                    return VersionInfo(
                        version=data.get('version', datetime.now().strftime('%Y%m%d-%H%M%S')),
                        last_updated=datetime.fromisoformat(
                            data.get('last_updated', datetime.now().isoformat())
                        ),
                        product_count=len(products)
                    )
        except Exception as e:
            logger.error(f"Error getting version info: {e}")
            # Devolver información por defecto si hay error
            return VersionInfo(
                version=datetime.now().strftime('%Y%m%d-%H%M%S'),
                last_updated=datetime.now(),
                product_count=len(self.get_all_products())
            )
