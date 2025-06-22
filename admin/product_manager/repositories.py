import json
import os
import logging
import shutil
import portalocker
from typing import List, Dict, Any, Optional, Protocol
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager
import threading
from functools import wraps
from models import Product, ProductCatalog

logger = logging.getLogger(__name__)

class ProductRepositoryError(Exception):
    """Base exception for repository errors."""
    pass

class ProductLoadError(ProductRepositoryError):
    """Exception raised when there's an error loading products."""
    pass

class ProductSaveError(ProductRepositoryError):
    """Exception raised when there's an error saving products."""
    pass

class ProductRepositoryProtocol(Protocol):
    """Protocol defining the interface for product repositories."""
    
    def load_products(self) -> List[Product]:
        """Load products from the repository."""
        ...

    def save_products(self, products: List[Product]) -> None:
        """Save products to the repository."""
        ...

def with_file_lock(func):
    """Decorator to ensure file operations are thread-safe."""
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        with self._file_lock:
            return func(self, *args, **kwargs)
    return wrapper

class JsonProductRepository(ProductRepositoryProtocol):
    """Repository for storing and retrieving products using JSON files."""
    
    BACKUP_SUFFIX = '.backup'
    MAX_BACKUPS = 5
    ENCODING = 'utf-8'

    def __init__(self, file_name: str, base_path: Optional[str] = None):
        """
        Initialize the JsonProductRepository.

        Args:
            file_name (str): Name of the JSON file to store products
            base_path (str, optional): Base path for the JSON file
        """
        self._file_lock = threading.Lock()
        self._base_path = Path(base_path) if base_path else Path(r"C:\Users\corte\OneDrive\Tienda Ebano\_products")
        self._file_path = self._base_path / file_name
        self._ensure_directory_exists()

    def _ensure_directory_exists(self) -> None:
        """Ensure that the directory for the JSON file exists."""
        try:
            self._base_path.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise ProductRepositoryError(f"Error al crear el directorio {self._base_path}: {e}")

    def _create_backup(self) -> None:
        """Create a backup of the current data file."""
        if not self._file_path.exists():
            return
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = self._file_path.with_suffix(f'{self.BACKUP_SUFFIX}_{timestamp}')
        try:
            shutil.copy2(self._file_path, backup_path)
            self._cleanup_old_backups()
        except OSError as e:
            logger.error(f"Error al crear copia de seguridad: {e}")
            raise ProductSaveError(f"Error al crear copia de seguridad: {e}")

    def _cleanup_old_backups(self) -> None:
        """Remove old backup files keeping only the most recent ones."""
        backup_pattern = f'*{self.BACKUP_SUFFIX}*'
        backup_files = sorted(self._base_path.glob(backup_pattern))
        while len(backup_files) > self.MAX_BACKUPS:
            try:
                backup_files[0].unlink()
                backup_files.pop(0)
            except OSError as e:
                logger.error(f"Error al eliminar copia de seguridad antigua: {e}")

    @contextmanager
    def _open_file(self, mode: str = 'r'):
        """
        Context manager for safely opening and closing the JSON file with locking.
        """
        file_obj = None
        try:
            if 'w' in mode:
                temp_path = self._file_path.with_suffix('.tmp')
                file_obj = open(temp_path, mode, encoding=self.ENCODING)
                portalocker.lock(file_obj, portalocker.LOCK_EX)
            else:
                file_obj = open(self._file_path, mode, encoding=self.ENCODING)
                portalocker.lock(file_obj, portalocker.LOCK_SH)
            yield file_obj
            if 'w' in mode and file_obj:
                file_obj.flush()
                os.fsync(file_obj.fileno())
                portalocker.unlock(file_obj)
                file_obj.close()
                file_obj = None
                os.replace(temp_path, self._file_path)
        except OSError as e:
            raise ProductRepositoryError(f"Error al acceder al archivo {self._file_path}: {e}")
        finally:
            if file_obj:
                try:
                    portalocker.unlock(file_obj)
                    file_obj.close()
                except Exception as e:
                    logger.debug(f"Error al cerrar archivo: {e}")

    @with_file_lock
    def load_products(self) -> List[Product]:
        """Load products from the JSON file."""
        if not self._file_path.exists():
            logger.warning(f"Archivo de productos no encontrado: {self._file_path}")
            return []
        try:
            with self._open_file('r') as file:
                data = json.load(file)
                if isinstance(data, list):
                    catalog = ProductCatalog.create([self._create_product(p) for p in data])
                else:
                    catalog = ProductCatalog.from_dict(data)
                return catalog.products
        except json.JSONDecodeError as e:
            error_msg = f"Error al analizar JSON en {self._file_path}: {e}"
            logger.error(error_msg)
            self._handle_corrupted_file()
            raise ProductLoadError(error_msg)
        except Exception as e:
            error_msg = f"Error inesperado al cargar productos: {e}"
            logger.error(error_msg)
            raise ProductLoadError(error_msg)

    def save_products(self, products: List[Product]) -> None:
        """Save products to the JSON file."""
        try:
            self._create_backup()
            catalog = {
                "version": datetime.now().strftime('%Y%m%d-%H%M%S'),
                "last_updated": datetime.now().isoformat(),
                "products": [product.to_dict() for product in products]
            }
            with self._open_file('w') as file:
                json.dump(catalog, file, indent=2, ensure_ascii=False)
        except Exception as e:
            error_msg = f"Error al guardar productos: {e}"
            logger.error(error_msg)
            raise ProductSaveError(error_msg)

    def _handle_corrupted_file(self) -> None:
        """Handle corrupted data file by attempting to restore from backup."""
        latest_backup = self._find_latest_backup()
        if latest_backup:
            try:
                shutil.copy2(latest_backup, self._file_path)
                logger.info(f"Restaurado desde copia de seguridad: {latest_backup}")
            except OSError as e:
                logger.error(f"Error al restaurar desde copia de seguridad: {e}")

    def _find_latest_backup(self) -> Optional[Path]:
        """Find the most recent backup file."""
        backup_pattern = f'*{self.BACKUP_SUFFIX}*'
        backup_files = sorted(self._base_path.glob(backup_pattern), reverse=True)
        return backup_files[0] if backup_files else None

    @staticmethod
    def _create_product(data: Dict[str, Any]) -> Product:
        """
        Create a Product object from dictionary data.
        """
        try:
            required_fields = {'name', 'description', 'price'}
            if not all(field in data for field in required_fields):
                missing = required_fields - set(data.keys())
                raise ValueError(f"Faltan campos requeridos: {missing}")
            return Product.from_dict(data)
        except (ValueError, TypeError) as e:
            raise ProductRepositoryError(f"Datos de producto inválidos: {e}")

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
            with self._open_file('r') as file:
                data = json.load(file)
            valid_products = []
            for item in data:
                try:
                    product = self._create_product(item)
                    valid_products.append(product)
                except Exception as e:
                    logger.warning(f"Omitiendo datos de producto inválidos: {e}")
            self.save_products(valid_products)
            return True
        except Exception as e:
            logger.error(f"Error al reparar la base de datos: {e}")
            return False
