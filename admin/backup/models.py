from dataclasses import dataclass
from typing import Optional, Dict, Any, List
import os
from functools import cached_property
from datetime import datetime

class ProductError(Exception):
    """Base exception for Product-related errors."""
    pass

class InvalidPriceError(ProductError):
    """Raised when price validation fails."""
    pass

class InvalidDiscountError(ProductError):
    """Raised when discount validation fails."""
    pass

class InvalidImagePathError(ProductError):
    """Raised when image path validation fails."""
    pass

@dataclass
class Product:
    name: str
    description: str
    price: int
    discount: int = 0
    stock: bool = False
    category: str = ""
    image_path: str = ""
    order: int = 0

    # Constants for validation
    MAX_PRICE: int = 100_000_000  # 100 million
    MAX_NAME_LENGTH: int = 200
    MAX_DESCRIPTION_LENGTH: int = 1000
    VALID_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}

    def __post_init__(self) -> None:
        """Validate all fields after initialization."""
        self._validate_name()
        self._validate_description()
        self._validate_price()
        self._validate_discount()
        self._validate_category()
        self._validate_image_path()

    def _validate_name(self) -> None:
        """Validate product name."""
        if not isinstance(self.name, str):
            raise TypeError("El nombre debe ser texto.")
        if not self.name.strip():
            raise ValueError("El nombre no puede estar vacío.")
        if len(self.name) > self.MAX_NAME_LENGTH:
            raise ValueError(f"El nombre no puede tener más de {self.MAX_NAME_LENGTH} caracteres.")

    def _validate_description(self) -> None:
        """Validate product description."""
        if not isinstance(self.description, str):
            raise TypeError("La descripción debe ser texto.")
        if len(self.description) > self.MAX_DESCRIPTION_LENGTH:
            raise ValueError(f"La descripción no puede tener más de {self.MAX_DESCRIPTION_LENGTH} caracteres.")

    def _validate_price(self) -> None:
        """Validate product price."""
        if not isinstance(self.price, int):
            raise InvalidPriceError("El precio debe ser un número entero.")
        if self.price <= 0:
            raise InvalidPriceError("El precio debe ser mayor que cero.")
        if self.price > self.MAX_PRICE:
            raise InvalidPriceError(f"El precio no puede exceder {self.MAX_PRICE:,}")

    def _validate_discount(self) -> None:
        """Validate product discount."""
        if not isinstance(self.discount, int):
            raise InvalidDiscountError("El descuento debe ser un número entero.")
        if self.discount < 0:
            raise InvalidDiscountError("El descuento no puede ser negativo.")
        if self.discount > self.price:
            raise InvalidDiscountError("El descuento no puede ser mayor que el precio.")

    def _validate_category(self) -> None:
        """Validate product category."""
        if not isinstance(self.category, str):
            raise TypeError("La categoría debe ser texto.")
        if len(self.category) > 50:  # reasonable limit for category length
            raise ValueError("El nombre de la categoría es demasiado largo.")

    def _validate_image_path(self) -> None:
        """Validate image path format and extension."""
        if not self.image_path:
            return
        
        if not isinstance(self.image_path, str):
            raise InvalidImagePathError("La ruta de la imagen debe ser texto.")
        
        # Normalize path
        normalized_path = os.path.normpath(self.image_path).replace('\\', '/')
        
        # Basic path validation
        if not normalized_path.startswith('assets/images/'):
            raise InvalidImagePathError("La ruta de la imagen debe comenzar con 'assets/images/'")
        
        # Validate file extension
        _, ext = os.path.splitext(normalized_path)
        if ext.lower() not in self.VALID_IMAGE_EXTENSIONS:
            raise InvalidImagePathError(
                f"Extensión de imagen inválida. Permitidas: {', '.join(self.VALID_IMAGE_EXTENSIONS)}"
            )

    @cached_property
    def discounted_price(self) -> int:
        """Calculate the final price after discount."""
        return max(0, self.price - self.discount)

    @property
    def discount_percentage(self) -> float:
        """Calculate discount as a percentage of original price."""
        if self.price == 0:
            return 0.0
        return round((self.discount / self.price) * 100, 2)

    def apply_discount(self, percentage: float) -> None:
        """Apply a percentage discount to the product."""
        if not isinstance(percentage, (int, float)):
            raise TypeError("El porcentaje de descuento debe ser un número")
        if not 0 <= percentage <= 100:
            raise ValueError("El porcentaje de descuento debe estar entre 0 y 100")
        
        self.discount = int(self.price * (percentage / 100))
        self._validate_discount()
        
        # Invalidate cached properties
        if 'discounted_price' in self.__dict__:
            del self.__dict__['discounted_price']

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Product':
        """Create a Product instance from a dictionary."""
        required_fields = {'name', 'description', 'price'}
        missing_fields = required_fields - set(data.keys())
        if missing_fields:
            raise ValueError(f"Faltan campos requeridos: {', '.join(missing_fields)}")
        
        return cls(**data)

    def to_dict(self) -> Dict[str, Any]:
        """Convert the product to a dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "price": self.price,
            "discount": self.discount,
            "stock": self.stock,
            "category": self.category,
            "image_path": self.image_path,
            "order": self.order
        }

    def __eq__(self, other: object) -> bool:
        """Check if two products are equal."""
        if not isinstance(other, Product):
            return NotImplemented
        return self.name.lower() == other.name.lower()

    def __hash__(self) -> int:
        """Hash based on the product name."""
        return hash(self.name.lower())


@dataclass
class ProductMetadata:
    """Metadata for the product catalog."""
    version: str
    last_updated: str

@dataclass
class ProductCatalog:
    """Complete product catalog with metadata."""
    metadata: ProductMetadata
    products: List[Product]

    @classmethod
    def create(cls, products: List[Product]) -> 'ProductCatalog':
        """Create a new catalog with current metadata."""
        metadata = ProductMetadata(
            version=datetime.now().strftime('%Y%m%d-%H%M%S'),
            last_updated=datetime.now().isoformat()
        )
        return cls(metadata=metadata, products=products)

    def to_dict(self) -> Dict[str, Any]:
        """Convert catalog to dictionary format."""
        return {
            "version": self.metadata.version,
            "last_updated": self.metadata.last_updated,
            "products": [p.to_dict() for p in self.products]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ProductCatalog':
        """Create catalog from dictionary data."""
        metadata = ProductMetadata(
            version=data.get('version', ''),
            last_updated=data.get('last_updated', '')
        )
        products = [Product.from_dict(p) for p in data.get('products', [])]
        return cls(metadata=metadata, products=products)
