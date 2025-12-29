"""
Repository for category catalog storage.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

import portalocker

from category_models import CategoryCatalog

logger = logging.getLogger(__name__)


class CategoryRepositoryError(Exception):
    """Base exception for category repository errors."""


def with_file_lock(func):
    """Decorator ensuring exclusive access to repository operations."""

    def wrapper(self, *args, **kwargs):
        with self._file_lock:
            return func(self, *args, **kwargs)

    return wrapper


class JsonCategoryRepository:
    """
    JSON-backed repository for catalog category data.
    """

    BACKUP_SUFFIX = ".backup"
    MAX_BACKUPS = 10
    ENCODING = "utf-8"

    def __init__(self, file_name: str, base_path: Optional[str] = None):
        provided_path = Path(file_name)
        if provided_path.is_absolute():
            self._file_path = provided_path
            self._base_path = provided_path.parent
        else:
            self._base_path = Path(base_path) if base_path else Path(
                os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "data")
                )
            )
            self._file_path = self._base_path / provided_path

        self._file_lock = threading.Lock()
        self._ensure_directory_exists()

    def _ensure_directory_exists(self) -> None:
        try:
            self._file_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise CategoryRepositoryError(
                f"No se pudo crear el directorio {self._file_path.parent}: {exc}"
            ) from exc

    def _backup_path(self) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return self._file_path.with_suffix(f"{self.BACKUP_SUFFIX}_{timestamp}")

    def _cleanup_old_backups(self) -> None:
        backups = sorted(
            self._file_path.parent.glob(f"*{self.BACKUP_SUFFIX}_*"),
            key=lambda path: path.stat().st_mtime,
        )
        while len(backups) > self.MAX_BACKUPS:
            path = backups.pop(0)
            try:
                path.unlink()
            except OSError as exc:
                logger.warning("No se pudo eliminar respaldo %s: %s", path, exc)

    @contextmanager
    def _open_file(self, mode: str):
        temp_path: Optional[Path] = None
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
        except OSError as exc:
            raise CategoryRepositoryError(
                f"No se pudo acceder al archivo {self._file_path}: {exc}"
            ) from exc
        finally:
            if file_obj:
                try:
                    portalocker.unlock(file_obj)
                except Exception as exc:  # noqa: BLE001
                    logger.debug("No se pudo liberar el bloqueo del archivo: %s", exc)
                file_obj.close()
            if temp_path and temp_path.exists():
                try:
                    os.replace(temp_path, self._file_path)
                except OSError as exc:
                    raise CategoryRepositoryError(
                        f"No se pudo actualizar el catálogo de categorías: {exc}"
                    ) from exc

    @with_file_lock
    def load_catalog(self) -> CategoryCatalog:
        if not self._file_path.exists():
            logger.info(
                "Archivo de categorías no encontrado. Creando catálogo vacío en %s",
                self._file_path,
            )
            return CategoryCatalog(version="", last_updated="")

        with self._open_file("r") as handle:
            raw = json.load(handle)
        try:
            return CategoryCatalog.from_dict(raw)
        except Exception as exc:  # noqa: BLE001
            raise CategoryRepositoryError(
                f"Datos de categorías inválidos en {self._file_path}: {exc}"
            ) from exc

    @with_file_lock
    def save_catalog(self, catalog: CategoryCatalog) -> None:
        try:
            if self._file_path.exists():
                backup_path = self._backup_path()
                shutil.copy2(self._file_path, backup_path)
                self._cleanup_old_backups()
        except OSError as exc:
            logger.warning("No se pudo crear copia de seguridad de categorías: %s", exc)

        payload = catalog.to_dict()
        with self._open_file("w") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)

    def get_file_path(self) -> Path:
        return self._file_path
