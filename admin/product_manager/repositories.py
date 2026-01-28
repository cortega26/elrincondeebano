"""Repositories for product catalog persistence."""

# Similar repository logic is intentionally duplicated for clarity.
# pylint: disable=duplicate-code

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
from contextlib import contextmanager
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol

import portalocker

from .models import Product, ProductCatalog

logger = logging.getLogger(__name__)


class ProductRepositoryError(Exception):
    """Base exception for repository errors."""


class ProductLoadError(ProductRepositoryError):
    """Exception raised when there's an error loading products."""


class ProductSaveError(ProductRepositoryError):
    """Exception raised when there's an error saving products."""


class ProductRepositoryProtocol(Protocol):
    """Protocol defining the interface for product repositories."""

    def load_products(self) -> List[Product]:
        """Load products from the repository."""
        raise NotImplementedError

    def save_products(
        self, products: List[Product], metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Save products to the repository."""
        raise NotImplementedError

    def get_catalog_meta(self) -> Dict[str, Any]:
        """Return the last known catalog metadata."""
        raise NotImplementedError


def with_file_lock(func):
    """Decorator to ensure file operations are thread-safe."""

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        """Wrap repository calls with a file lock."""
        # Accessing protected lock is intentional for repository synchronization.
        # pylint: disable=protected-access
        with self._file_lock:
            return func(self, *args, **kwargs)

    return wrapper


class JsonProductRepository(ProductRepositoryProtocol):
    """Repository for storing and retrieving products using JSON files."""

    BACKUP_SUFFIX = ".backup"
    MAX_BACKUPS = 5
    ENCODING = "utf-8"

    def __init__(self, file_name: str, base_path: Optional[str] = None):
        """
        Initialize the JsonProductRepository.

        Args:
            file_name (str): Name of the JSON file to store products
            base_path (str, optional): Base path for the JSON file
        """
        self._file_lock = threading.Lock()
        provided_path = Path(file_name)
        if provided_path.is_absolute():
            self._file_path = provided_path
            self._base_path = provided_path.parent
        else:
            if base_path:
                self._base_path = Path(base_path)
            else:
                self._base_path = Path(__file__).resolve().parents[2] / "data"
            self._file_path = self._base_path / provided_path
        self._ensure_directory_exists()
        self._catalog_meta: Dict[str, Any] = {
            "version": "",
            "last_updated": "",
            "rev": 0,
        }

    def _ensure_directory_exists(self) -> None:
        """Ensure that the directory for the JSON file exists."""
        try:
            self._file_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ProductRepositoryError(
                f"Error al crear el directorio {self._file_path.parent}: {exc}"
            ) from exc

    def _create_backup(self) -> None:
        """Create a backup of the current data file."""
        if not self._file_path.exists():
            return
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = self._file_path.with_suffix(f"{self.BACKUP_SUFFIX}_{timestamp}")
        try:
            shutil.copy2(self._file_path, backup_path)
            self._cleanup_old_backups()
        except OSError as exc:
            logger.error("Error al crear copia de seguridad: %s", exc)
            raise ProductSaveError(
                f"Error al crear copia de seguridad: {exc}"
            ) from exc

    def _cleanup_old_backups(self) -> None:
        """Remove old backup files keeping only the most recent ones."""
        backup_pattern = f"*{self.BACKUP_SUFFIX}*"
        backup_files = sorted(self._file_path.parent.glob(backup_pattern))
        while len(backup_files) > self.MAX_BACKUPS:
            try:
                backup_files[0].unlink()
                backup_files.pop(0)
            except OSError as exc:
                logger.error("Error al eliminar copia de seguridad antigua: %s", exc)

    @contextmanager
    def _open_file(self, mode: str = "r"):
        """
        Context manager for safely opening and closing the JSON file with locking.
        """
        file_obj = None
        try:
            if "w" in mode:
                temp_path = self._file_path.with_suffix(".tmp")
                file_obj = open(temp_path, mode, encoding=self.ENCODING)
                portalocker.lock(file_obj, portalocker.LOCK_EX)
            else:
                file_obj = open(self._file_path, mode, encoding=self.ENCODING)
                portalocker.lock(file_obj, portalocker.LOCK_SH)
            yield file_obj
            if "w" in mode and file_obj:
                file_obj.flush()
                os.fsync(file_obj.fileno())
                portalocker.unlock(file_obj)
                file_obj.close()
                file_obj = None
                os.replace(temp_path, self._file_path)
        except OSError as exc:
            raise ProductRepositoryError(
                f"Error al acceder al archivo {self._file_path}: {exc}"
            ) from exc
        finally:
            if file_obj:
                try:
                    portalocker.unlock(file_obj)
                    file_obj.close()
                except Exception as exc:  # pylint: disable=broad-exception-caught
                    logger.debug("Error al cerrar archivo: %s", exc)

    @with_file_lock
    def load_products(self) -> List[Product]:
        """Load products from the JSON file."""
        if not self._file_path.exists():
            logger.warning("Archivo de productos no encontrado: %s", self._file_path)
            return []
        try:
            with self._open_file("r") as file:
                data = json.load(file)
                if isinstance(data, list):
                    catalog = ProductCatalog.create(
                        [self._create_product(p) for p in data]
                    )
                    max_rev = max(
                        (product.rev for product in catalog.products), default=0
                    )
                    self._catalog_meta = {
                        "version": catalog.metadata.version,
                        "last_updated": catalog.metadata.last_updated,
                        "rev": max_rev,
                    }
                else:
                    catalog = ProductCatalog.from_dict(data)
                    self._catalog_meta = {
                        "version": catalog.metadata.version,
                        "last_updated": catalog.metadata.last_updated,
                        "rev": data.get("rev", catalog.metadata.rev),
                    }
                return catalog.products
        except json.JSONDecodeError as exc:
            error_msg = f"Error al analizar JSON en {self._file_path}: {exc}"
            logger.error(error_msg)
            self._handle_corrupted_file()
            raise ProductLoadError(error_msg) from exc
        except Exception as exc:  # pylint: disable=broad-exception-caught
            error_msg = f"Error inesperado al cargar productos: {exc}"
            logger.error(error_msg)
            raise ProductLoadError(error_msg) from exc

    def save_products(
        self, products: List[Product], metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Save products to the JSON file."""
        try:
            self._create_backup()
            if metadata:
                allowed_keys = {"version", "last_updated", "rev"}
                for key in allowed_keys:
                    if key in metadata:
                        self._catalog_meta[key] = metadata[key]
            else:
                now = datetime.now()
                self._catalog_meta["version"] = now.strftime("%Y%m%d-%H%M%S")
                self._catalog_meta["last_updated"] = now.isoformat()
            catalog = {
                "version": self._catalog_meta.get("version"),
                "last_updated": self._catalog_meta.get("last_updated"),
                "rev": self._catalog_meta.get("rev", 0),
                "products": [product.to_dict() for product in products],
            }
            with self._open_file("w") as file:
                json.dump(catalog, file, indent=2, ensure_ascii=False)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            error_msg = f"Error al guardar productos: {exc}"
            logger.error(error_msg)
            raise ProductSaveError(error_msg) from exc

    def _handle_corrupted_file(self) -> None:
        """Handle corrupted data file by attempting to restore from backup."""
        latest_backup = self._find_latest_backup()
        if latest_backup:
            try:
                shutil.copy2(latest_backup, self._file_path)
                logger.info("Restaurado desde copia de seguridad: %s", latest_backup)
            except OSError as exc:
                logger.error("Error al restaurar desde copia de seguridad: %s", exc)

    def _find_latest_backup(self) -> Optional[Path]:
        """Find the most recent backup file."""
        backup_pattern = f"*{self.BACKUP_SUFFIX}*"
        backup_files = sorted(self._file_path.parent.glob(backup_pattern), reverse=True)
        return backup_files[0] if backup_files else None

    @staticmethod
    def _create_product(data: Dict[str, Any]) -> Product:
        """
        Create a Product object from dictionary data.
        """
        try:
            required_fields = {"name", "description", "price"}
            if not all(field in data for field in required_fields):
                missing = required_fields - set(data.keys())
                raise ValueError(f"Faltan campos requeridos: {missing}")
            return Product.from_dict(data)
        except (ValueError, TypeError) as exc:
            raise ProductRepositoryError(
                f"Datos de producto inválidos: {exc}"
            ) from exc

    def get_catalog_meta(self) -> Dict[str, Any]:
        """Return current catalog metadata."""
        return dict(self._catalog_meta)

    def update_catalog_meta(self, **kwargs: Any) -> None:
        """Update catalog metadata with allowed keys."""
        allowed = {"version", "last_updated", "rev"}
        for key, value in kwargs.items():
            if key in allowed:
                self._catalog_meta[key] = value

    def get_file_path(self) -> Path:
        """Return path to the catalog file."""
        return self._file_path

    @with_file_lock
    def reorder_products(self, products: List[Product]) -> None:
        """
        Reorder products and save the new order.
        """
        for i, product in enumerate(products):
            product.order = i
        self.save_products(products)

    def repair_database(self) -> bool:
        """
        Attempt to repair the database if it's corrupted.
        """
        try:
            with self._open_file("r") as file:
                raw_data = json.load(file)
            if isinstance(raw_data, dict):
                products_data = raw_data.get("products", raw_data)
            else:
                products_data = raw_data
            if isinstance(products_data, dict) or not isinstance(products_data, list):
                logger.error(
                    "Estructura inválida del catálogo en %s: se esperaba una lista "
                    "de productos y se recibió %s",
                    self._file_path,
                    type(products_data).__name__,
                )
                return False
            valid_products = []
            for index, item in enumerate(products_data):
                if not isinstance(item, dict):
                    logger.warning(
                        "Omitiendo entrada %s de tipo %s: se esperaba un objeto con "
                        "datos de producto.",
                        index,
                        type(item).__name__,
                    )
                    continue
                try:
                    product = self._create_product(item)
                    valid_products.append(product)
                except Exception as exc:  # pylint: disable=broad-exception-caught
                    logger.warning(
                        "Omitiendo datos de producto inválidos en índice %s: %s",
                        index,
                        exc,
                    )
            self.save_products(valid_products)
            return True
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.error("Error al reparar la base de datos: %s", exc)
            return False
