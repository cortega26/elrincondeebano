from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
import os
from functools import cached_property
from datetime import datetime
from copy import deepcopy

DEFAULT_FIELD_TS = "1970-01-01T00:00:00.000Z"


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
    image_avif_path: str = ""
    order: int = 0
    rev: int = 0
    field_last_modified: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    MAX_PRICE: int = 1_000_000  # 1 million
    MAX_NAME_LENGTH: int = 200
    MAX_DESCRIPTION_LENGTH: int = 1000
    VALID_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

    def __post_init__(self) -> None:
        """Validate all fields after initialization."""
        self._validate_name()
        self._validate_description()
        self._validate_price()
        self._validate_discount()
        self._validate_category()
        self._validate_image_path()
        self._validate_image_avif_path()
        if not isinstance(self.field_last_modified, dict):
            self.field_last_modified = {}

    @staticmethod
    def _normalize_text(value: Any) -> str:
        """Return a canonical lowercase representation collapsing whitespace."""

        if not isinstance(value, str):
            return ""
        collapsed = " ".join(value.split())
        return collapsed.casefold()

    @classmethod
    def normalized_name(cls, name: str) -> str:
        """Normalize a product name for comparisons."""

        return cls._normalize_text(name)

    @classmethod
    def normalized_description(cls, description: str) -> str:
        """Normalize a product description for comparisons."""

        return cls._normalize_text(description)

    @classmethod
    def identity_key_from_values(cls, name: str, description: str) -> str:
        """Build the canonical identity key for the provided values."""

        return f"{cls.normalized_name(name)}::{cls.normalized_description(description)}"

    def identity_key(self) -> str:
        """Return the canonical identity key for the current product."""

        return self.identity_key_from_values(self.name, self.description)

    def _validate_name(self) -> None:
        """Validate product name."""
        if not isinstance(self.name, str):
            raise TypeError("El nombre debe ser texto.")
        if not self.name.strip():
            raise ValueError("El nombre no puede estar vacío.")
        if len(self.name) > self.MAX_NAME_LENGTH:
            raise ValueError(
                f"El nombre no puede tener más de {self.MAX_NAME_LENGTH} caracteres."
            )

    def _validate_description(self) -> None:
        """Validate product description."""
        if not isinstance(self.description, str):
            raise TypeError("La descripción debe ser texto.")
        if len(self.description) > self.MAX_DESCRIPTION_LENGTH:
            raise ValueError(
                f"La descripción no puede tener más de {self.MAX_DESCRIPTION_LENGTH} caracteres."
            )

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
        if len(self.category) > 50:
            raise ValueError("El nombre de la categoría es demasiado largo.")

    def _validate_image_path(self) -> None:
        """Validate image path format and extension."""
        if not self.image_path:
            return

        if not isinstance(self.image_path, str):
            raise InvalidImagePathError("La ruta de la imagen debe ser texto.")

        normalized_path = os.path.normpath(self.image_path).replace("\\", "/")

        if not normalized_path.startswith("assets/images/"):
            raise InvalidImagePathError(
                "La ruta de la imagen debe comenzar con 'assets/images/'"
            )

        _, ext = os.path.splitext(normalized_path)
        if ext.lower() not in self.VALID_IMAGE_EXTENSIONS:
            allowed = ", ".join(self.VALID_IMAGE_EXTENSIONS)
            raise InvalidImagePathError(
                f"Extensión de imagen inválida. Permitidas: {allowed}"
            )

    def _validate_image_avif_path(self) -> None:
        """Validate optional AVIF image path and ensure fallback exists."""
        if not self.image_avif_path:
            return

        if not isinstance(self.image_avif_path, str):
            raise InvalidImagePathError("La ruta AVIF debe ser texto.")

        normalized_path = os.path.normpath(self.image_avif_path).replace("\\", "/")
        if not normalized_path.startswith("assets/images/"):
            raise InvalidImagePathError(
                "La ruta AVIF debe comenzar con 'assets/images/'"
            )

        _, ext = os.path.splitext(normalized_path)
        if ext.lower() != ".avif":
            raise InvalidImagePathError("La ruta AVIF debe terminar en '.avif'")

        if not self.image_path:
            raise InvalidImagePathError(
                "Para utilizar AVIF debes mantener una imagen de respaldo (PNG, JPG, GIF o WebP)."
            )

        fallback_normalized = os.path.normpath(self.image_path).replace("\\", "/")
        _, fallback_ext = os.path.splitext(fallback_normalized)
        if fallback_ext.lower() not in self.VALID_IMAGE_EXTENSIONS:
            allowed = ", ".join(self.VALID_IMAGE_EXTENSIONS)
            raise InvalidImagePathError(
                f"La imagen de respaldo debe tener una extensión válida ({allowed})."
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

        if "discounted_price" in self.__dict__:
            del self.__dict__["discounted_price"]

    def ensure_field_metadata(self, field_name: str) -> Dict[str, Any]:
        """Ensure metadata exists for a given field."""
        if field_name not in self.field_last_modified or not isinstance(
            self.field_last_modified[field_name], dict
        ):
            self.field_last_modified[field_name] = {
                "ts": DEFAULT_FIELD_TS,
                "by": "admin",
                "rev": self.rev,
                "base_rev": 0,
                "changeset_id": None,
            }
        meta = self.field_last_modified[field_name]
        meta.setdefault("ts", DEFAULT_FIELD_TS)
        meta.setdefault("by", "admin")
        meta.setdefault("rev", self.rev)
        meta.setdefault("base_rev", 0)
        meta.setdefault("changeset_id", None)
        return meta

    def update_field_metadata(
        self,
        field_name: str,
        *,
        ts: str,
        by: str,
        rev: int,
        base_rev: int,
        changeset_id: Optional[str] = None,
    ) -> None:
        """Update metadata for a field."""
        meta = self.ensure_field_metadata(field_name)
        meta["ts"] = ts
        meta["by"] = by
        meta["rev"] = rev
        meta["base_rev"] = base_rev
        if changeset_id is not None:
            meta["changeset_id"] = changeset_id

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Product":
        """Create a Product instance from a dictionary."""
        required_fields = {"name", "description", "price"}
        missing_fields = required_fields - set(data.keys())
        if missing_fields:
            raise ValueError(f"Faltan campos requeridos: {', '.join(missing_fields)}")

        payload = data.copy()
        payload.setdefault("rev", data.get("rev", 0))
        payload.setdefault("image_avif_path", data.get("image_avif_path", ""))
        field_meta = payload.get("field_last_modified")
        if not isinstance(field_meta, dict):
            field_meta = {}
        normalised_meta: Dict[str, Dict[str, Any]] = {}
        for key, value in field_meta.items():
            if isinstance(value, dict):
                normalised_meta[key] = {
                    "ts": value.get("ts", DEFAULT_FIELD_TS),
                    "by": value.get("by", "admin"),
                    "rev": value.get("rev", payload["rev"]),
                    "base_rev": value.get("base_rev", 0),
                    "changeset_id": value.get("changeset_id"),
                }
            else:
                normalised_meta[key] = {
                    "ts": DEFAULT_FIELD_TS,
                    "by": "admin",
                    "rev": payload["rev"],
                    "base_rev": 0,
                    "changeset_id": None,
                }
        payload["field_last_modified"] = normalised_meta
        return cls(**payload)

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
            "image_avif_path": self.image_avif_path,
            "order": self.order,
            "rev": self.rev,
            "field_last_modified": deepcopy(self.field_last_modified),
        }

    def __eq__(self, other: object) -> bool:
        """Check if two products are equal."""
        if not isinstance(other, Product):
            return NotImplemented
        return self.identity_key() == other.identity_key()

    def __hash__(self) -> int:
        """Hash based on the canonical product identity."""
        return hash(self.identity_key())


@dataclass
class ProductMetadata:
    """Metadata for the product catalog."""

    version: str
    last_updated: str
    rev: int = 0


@dataclass
class ProductCatalog:
    """Complete product catalog with metadata."""

    metadata: ProductMetadata
    products: List[Product]

    @classmethod
    def create(cls, products: List[Product]) -> "ProductCatalog":
        """Create a new catalog with current metadata."""
        metadata = ProductMetadata(
            version=datetime.now().strftime("%Y%m%d-%H%M%S"),
            last_updated=datetime.now().isoformat(),
            rev=0,
        )
        return cls(metadata=metadata, products=products)

    def to_dict(self) -> Dict[str, Any]:
        """Convert catalog to dictionary format."""
        return {
            "version": self.metadata.version,
            "last_updated": self.metadata.last_updated,
            "rev": self.metadata.rev,
            "products": [p.to_dict() for p in self.products],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProductCatalog":
        """Create catalog from dictionary data."""
        metadata = ProductMetadata(
            version=data.get("version", ""),
            last_updated=data.get("last_updated", ""),
            rev=data.get("rev", 0),
        )
        products = [Product.from_dict(p) for p in data.get("products", [])]
        return cls(metadata=metadata, products=products)
