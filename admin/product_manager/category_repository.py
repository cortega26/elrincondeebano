"""
Repository for category catalog storage.
"""

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
from pathlib import Path
from typing import Any, Dict, List, Optional

import portalocker

from .category_models import CategoryCatalog

logger = logging.getLogger(__name__)


class CategoryRepositoryError(Exception):
    """Base exception for category repository errors."""


def with_file_lock(func):
    """Decorator ensuring exclusive access to repository operations."""

    def wrapper(self, *args, **kwargs):
        """Wrap repository calls with a file lock."""
        # Accessing protected lock is intentional for repository synchronization.
        # pylint: disable=protected-access
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
    REGISTRY_FILE_NAME = "category_registry.json"
    REGISTRY_SCHEMA_VERSION = "1.0"

    def __init__(self, file_name: str, base_path: Optional[str] = None):
        provided_path = Path(file_name)
        if provided_path.is_absolute():
            self._file_path = provided_path
            self._base_path = provided_path.parent
        else:
            self._base_path = (
                Path(base_path)
                if base_path
                else Path(
                    os.path.abspath(
                        os.path.join(os.path.dirname(__file__), "..", "data")
                    )
                )
            )
            self._file_path = self._base_path / provided_path

        if self._file_path.name == self.REGISTRY_FILE_NAME:
            self._registry_path = self._file_path
        else:
            self._registry_path = self._file_path.parent / self.REGISTRY_FILE_NAME

        self._file_lock = threading.Lock()
        self._ensure_directory_exists()

    def _ensure_directory_exists(self) -> None:
        """Ensure the repository directory exists."""
        try:
            self._file_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise CategoryRepositoryError(
                f"No se pudo crear el directorio {self._file_path.parent}: {exc}"
            ) from exc

    def _backup_path(self) -> Path:
        """Return a new backup path with timestamp suffix."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return self._file_path.with_suffix(f"{self.BACKUP_SUFFIX}_{timestamp}")

    def _cleanup_old_backups(self) -> None:
        """Remove oldest backups beyond MAX_BACKUPS."""
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

    @staticmethod
    def _normalize_display_name(value: Any, fallback: str) -> str:
        """Return the default label from a registry display_name payload."""
        if isinstance(value, dict):
            candidate = value.get("default")
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        if isinstance(value, str) and value.strip():
            return value.strip()
        return fallback

    def _registry_to_catalog_payload(self, registry: Dict[str, Any]) -> Dict[str, Any]:
        """Convert category_registry.json payload into legacy catalog shape."""
        nav_groups_payload = registry.get("nav_groups", []) or []
        categories_payload = registry.get("categories", []) or []

        nav_groups = []
        for group in nav_groups_payload:
            if not isinstance(group, dict):
                continue
            group_id = (group.get("id") or "").strip()
            label = self._normalize_display_name(group.get("display_name"), group_id)
            nav_groups.append(
                {
                    "id": group_id,
                    "label": label,
                    "order": int(group.get("sort_order") or group.get("order") or 0),
                    "description": (group.get("description") or "").strip(),
                    "enabled": group.get("active", group.get("enabled", True)) is not False,
                }
            )

        categories = []
        for category in categories_payload:
            if not isinstance(category, dict):
                continue
            category_id = (category.get("id") or "").strip()
            category_key = (
                (category.get("key") or category.get("product_key") or category_id) or ""
            ).strip()
            title = self._normalize_display_name(
                category.get("display_name"), category.get("title") or category_key
            )
            subcategories_payload = category.get("subcategories", []) or []
            subcategories: List[Dict[str, Any]] = []
            for subcategory in subcategories_payload:
                if not isinstance(subcategory, dict):
                    continue
                sub_id = (subcategory.get("id") or "").strip()
                sub_key = (
                    (subcategory.get("key") or subcategory.get("product_key") or sub_id)
                    or ""
                ).strip()
                sub_title = self._normalize_display_name(
                    subcategory.get("display_name"),
                    subcategory.get("title") or sub_key,
                )
                subcategories.append(
                    {
                        "id": sub_id,
                        "title": sub_title,
                        "product_key": sub_key,
                        "slug": (subcategory.get("slug") or sub_id).strip(),
                        "description": (subcategory.get("description") or "").strip(),
                        "order": int(
                            subcategory.get("sort_order")
                            or subcategory.get("order")
                            or 0
                        ),
                        "enabled": subcategory.get(
                            "active", subcategory.get("enabled", True)
                        )
                        is not False,
                    }
                )

            categories.append(
                {
                    "id": category_id,
                    "title": title,
                    "product_key": category_key,
                    "slug": (category.get("slug") or category_id).strip(),
                    "description": (category.get("description") or "").strip(),
                    "group_id": (
                        category.get("nav_group") or category.get("group_id") or ""
                    ).strip(),
                    "order": int(
                        category.get("sort_order") or category.get("order") or 0
                    ),
                    "enabled": category.get("active", category.get("enabled", True))
                    is not False,
                    "subcategories": subcategories,
                }
            )

        return {
            "version": registry.get("version", ""),
            "last_updated": registry.get("last_updated", ""),
            "nav_groups": nav_groups,
            "categories": categories,
        }

    def _catalog_to_registry_payload(self, catalog: CategoryCatalog) -> Dict[str, Any]:
        """Convert in-memory catalog data into category registry shape."""
        nav_groups = []
        for group in catalog.nav_groups:
            nav_groups.append(
                {
                    "id": group.id,
                    "display_name": {"default": group.label},
                    "active": group.enabled,
                    "sort_order": int(group.order),
                    "description": group.description or "",
                }
            )

        categories = []
        for category in catalog.categories:
            subcategories = []
            for subcategory in category.subcategories:
                subcategories.append(
                    {
                        "id": subcategory.id,
                        "key": subcategory.product_key,
                        "slug": subcategory.slug,
                        "display_name": {"default": subcategory.title},
                        "active": subcategory.enabled,
                        "sort_order": int(subcategory.order),
                        "description": subcategory.description or "",
                    }
                )

            categories.append(
                {
                    "id": category.id,
                    "key": category.product_key,
                    "slug": category.slug,
                    "display_name": {"default": category.title},
                    "nav_group": category.group_id,
                    "active": category.enabled,
                    "sort_order": int(category.order),
                    "description": category.description or "",
                    "subcategories": subcategories,
                }
            )

        return {
            "schema_version": self.REGISTRY_SCHEMA_VERSION,
            "source": self._file_path.name,
            "version": catalog.version,
            "last_updated": catalog.last_updated,
            "nav_groups": nav_groups,
            "categories": categories,
        }

    def _write_registry_payload(self, payload: Dict[str, Any]) -> None:
        """Write category registry payload atomically."""
        temp_path = self._registry_path.with_suffix(".tmp")
        try:
            with open(temp_path, "w", encoding=self.ENCODING) as handle:
                json.dump(payload, handle, indent=2, ensure_ascii=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, self._registry_path)
        except OSError as exc:
            raise CategoryRepositoryError(
                f"No se pudo actualizar el registro de categorías {self._registry_path}: {exc}"
            ) from exc
        finally:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass

    @contextmanager
    def _open_file(self, mode: str):
        """Open the catalog file with advisory locks."""
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
                except Exception as exc:  # noqa: BLE001  # pylint: disable=broad-exception-caught
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
        """Load the category catalog from disk."""
        if self._registry_path.exists():
            try:
                with open(self._registry_path, "r", encoding=self.ENCODING) as handle:
                    raw_registry = json.load(handle)
                payload = self._registry_to_catalog_payload(raw_registry)
                return CategoryCatalog.from_dict(payload)
            except Exception as exc:  # noqa: BLE001  # pylint: disable=broad-exception-caught
                logger.warning(
                    "No se pudo cargar %s (%s). Se usará el catálogo legacy.",
                    self._registry_path,
                    exc,
                )

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
        except Exception as exc:  # noqa: BLE001  # pylint: disable=broad-exception-caught
            raise CategoryRepositoryError(
                f"Datos de categorías inválidos en {self._file_path}: {exc}"
            ) from exc

    @with_file_lock
    def save_catalog(self, catalog: CategoryCatalog) -> None:
        """Persist the category catalog to disk."""
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

        try:
            registry_payload = self._catalog_to_registry_payload(catalog)
            self._write_registry_payload(registry_payload)
        except CategoryRepositoryError as exc:
            logger.warning("No se pudo actualizar category_registry.json: %s", exc)

    def get_file_path(self) -> Path:
        """Return the repository file path."""
        return self._file_path
