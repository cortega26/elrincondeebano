"""
Service layer for managing storefront categories and subcategories.
"""

from __future__ import annotations

import re
import threading
from dataclasses import replace
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple

from category_models import (
    Category,
    CategoryCatalog,
    NavGroup,
    Subcategory,
)
from category_repository import JsonCategoryRepository

CategoryChoice = Tuple[str, str]


def _slugify(source: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", source.strip())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug.lower() or "categoria"


def _canonical_key(value: str) -> str:
    return (value or "").strip().lower()


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _version_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


class CategoryServiceError(Exception):
    """Base error raised by CategoryService."""


class CategoryNotFoundError(CategoryServiceError):
    """Raised when a category cannot be found."""


class SubcategoryNotFoundError(CategoryServiceError):
    """Raised when a subcategory cannot be located."""


class NavGroupNotFoundError(CategoryServiceError):
    """Raised when a navigation group is missing."""


class CategoryService:
    """Provide CRUD operations for categories and navigation metadata."""

    def __init__(self, repository: JsonCategoryRepository):
        self.repository = repository
        self._catalog: Optional[CategoryCatalog] = None
        self._lock = threading.RLock()
        self._product_service = None

    def attach_product_service(self, product_service) -> None:
        self._product_service = product_service

    def _load_catalog(self) -> CategoryCatalog:
        if self._catalog is None:
            self._catalog = self.repository.load_catalog()
        return self._catalog

    def reload(self) -> None:
        with self._lock:
            self._catalog = self.repository.load_catalog()

    def _persist(self) -> None:
        catalog = self._load_catalog()
        catalog.version = _version_stamp()
        catalog.last_updated = _timestamp()
        self.repository.save_catalog(catalog)

    def list_nav_groups(self, include_disabled: bool = False) -> List[NavGroup]:
        catalog = self._load_catalog()
        groups = catalog.nav_groups
        if include_disabled:
            return [replace(group) for group in groups]
        return [replace(group) for group in groups if group.enabled]

    def list_categories(self, include_disabled: bool = False) -> List[Category]:
        catalog = self._load_catalog()
        categories = catalog.categories
        if include_disabled:
            return [replace(category) for category in categories]
        return [replace(category) for category in categories if category.enabled]

    def list_category_choices(self) -> List[CategoryChoice]:
        return [
            (category.title, category.product_key)
            for category in self.list_categories(include_disabled=False)
        ]

    def find_category(self, category_id: str) -> Category:
        catalog = self._load_catalog()
        match = catalog.get_category(category_id)
        if not match:
            raise CategoryNotFoundError(f"Categoría no encontrada: {category_id}")
        return match

    def find_category_by_product_key(self, product_key: str) -> Optional[Category]:
        catalog = self._load_catalog()
        return catalog.find_category_by_product_key(product_key)

    def ensure_group_exists(self, group_id: str) -> NavGroup:
        catalog = self._load_catalog()
        group = catalog.get_nav_group(group_id)
        if not group:
            raise NavGroupNotFoundError(f"Grupo de navegación no encontrado: {group_id}")
        if not group.enabled:
            raise NavGroupNotFoundError(
                f"Grupo de navegación deshabilitado: {group_id}"
            )
        return group

    def create_nav_group(
        self,
        label: str,
        group_id: Optional[str] = None,
        *,
        order: Optional[int] = None,
        description: str = "",
    ) -> NavGroup:
        with self._lock:
            catalog = self._load_catalog()
            normalized_id = group_id or _slugify(label)
            if catalog.get_nav_group(normalized_id):
                raise CategoryServiceError(
                    f"Ya existe un grupo con el identificador '{normalized_id}'"
                )
            next_order = (
                max((group.order for group in catalog.nav_groups), default=0) + 10
                if order is None
                else order
            )
            nav_group = NavGroup(
                id=normalized_id,
                label=label.strip(),
                order=next_order,
                description=description.strip(),
                enabled=True,
            )
            catalog.nav_groups.append(nav_group)
            catalog.nav_groups.sort(key=lambda group: group.order)
            self._persist()
            return nav_group

    def update_nav_group(
        self,
        group_id: str,
        *,
        label: Optional[str] = None,
        order: Optional[int] = None,
        description: Optional[str] = None,
        enabled: Optional[bool] = None,
    ) -> NavGroup:
        with self._lock:
            catalog = self._load_catalog()
            group = catalog.get_nav_group(group_id)
            if not group:
                raise NavGroupNotFoundError(group_id)
            if label is not None:
                group.label = label.strip()
            if description is not None:
                group.description = description.strip()
            if order is not None:
                group.order = int(order)
            if enabled is not None:
                group.enabled = bool(enabled)
            catalog.nav_groups.sort(key=lambda entry: entry.order)
            self._persist()
            return group

    def delete_nav_group(self, group_id: str) -> None:
        with self._lock:
            catalog = self._load_catalog()
            group = catalog.get_nav_group(group_id)
            if not group:
                raise NavGroupNotFoundError(group_id)
            in_use = any(
                _canonical_key(category.group_id) == _canonical_key(group_id)
                for category in catalog.categories
            )
            if in_use:
                raise CategoryServiceError(
                    f"No se puede eliminar el grupo '{group_id}' porque tiene categorías asociadas."
                )
            catalog.nav_groups = [
                entry for entry in catalog.nav_groups if entry.id != group_id
            ]
            self._persist()

    def _ensure_unique_identifiers(
        self,
        *,
        slug: str,
        product_key: str,
        exclude_category: Optional[str] = None,
    ) -> None:
        catalog = self._load_catalog()
        slug_key = _canonical_key(slug)
        product_key_normalized = _canonical_key(product_key)
        for category in catalog.categories:
            if exclude_category and category.id == exclude_category:
                continue
            if _canonical_key(category.id) == slug_key:
                raise CategoryServiceError(
                    f"Ya existe una categoría con el identificador '{slug}'."
                )
            if _canonical_key(category.slug) == slug_key:
                raise CategoryServiceError(
                    f"El slug '{slug}' ya está en uso por otra categoría."
                )
            if _canonical_key(category.product_key) == product_key_normalized:
                raise CategoryServiceError(
                    f"La clave de producto '{product_key}' ya está en uso."
                )

    def create_category(
        self,
        title: str,
        *,
        slug: Optional[str] = None,
        product_key: Optional[str] = None,
        group_id: str,
        description: str = "",
        order: Optional[int] = None,
        enabled: bool = True,
    ) -> Category:
        with self._lock:
            catalog = self._load_catalog()
            self.ensure_group_exists(group_id)
            title_clean = title.strip()
            slug_value = slug.strip() if slug else _slugify(title_clean)
            product_key_value = (
                product_key.strip() if product_key else title_clean.replace(" ", "")
            )
            self._ensure_unique_identifiers(
                slug=slug_value,
                product_key=product_key_value,
            )
            next_order = (
                max((category.order for category in catalog.categories), default=0) + 10
                if order is None
                else int(order)
            )
            category = Category(
                id=slug_value,
                title=title_clean,
                product_key=product_key_value,
                slug=slug_value,
                description=description.strip(),
                group_id=group_id,
                order=next_order,
                enabled=bool(enabled),
                subcategories=[],
            )
            catalog.categories.append(category)
            catalog.categories.sort(key=lambda entry: entry.order)
            self._persist()
            return category

    def update_category(
        self,
        category_id: str,
        *,
        title: Optional[str] = None,
        slug: Optional[str] = None,
        product_key: Optional[str] = None,
        group_id: Optional[str] = None,
        description: Optional[str] = None,
        order: Optional[int] = None,
        enabled: Optional[bool] = None,
    ) -> Category:
        with self._lock:
            catalog = self._load_catalog()
            category = catalog.get_category(category_id)
            if not category:
                raise CategoryNotFoundError(category_id)

            new_slug = slug.strip() if slug else category.slug
            new_product_key = (
                product_key.strip() if product_key else category.product_key
            )
            if slug or product_key:
                self._ensure_unique_identifiers(
                    slug=new_slug,
                    product_key=new_product_key,
                    exclude_category=category_id,
                )

            if group_id:
                self.ensure_group_exists(group_id)
                category.group_id = group_id
            if title is not None:
                category.title = title.strip()
            if slug is not None:
                category.id = new_slug
                category.slug = new_slug
            if product_key is not None:
                category.product_key = new_product_key
            if description is not None:
                category.description = description.strip()
            if order is not None:
                category.order = int(order)
            if enabled is not None:
                category.enabled = bool(enabled)
            catalog.categories.sort(key=lambda entry: entry.order)
            self._persist()
            return category

    def delete_category(
        self,
        category_id: str,
        *,
        fallback_product_key: Optional[str] = None,
    ) -> None:
        with self._lock:
            catalog = self._load_catalog()
            category = catalog.get_category(category_id)
            if not category:
                raise CategoryNotFoundError(category_id)

            if self._product_service:
                in_use = self._product_service.count_products_by_category(
                    category.product_key
                )
                if in_use > 0 and not fallback_product_key:
                    raise CategoryServiceError(
                        "La categoría se encuentra en uso. Debes seleccionar otra categoría para reasignar los productos."
                    )
                if in_use > 0 and fallback_product_key:
                    self._product_service.reassign_category(
                        category.product_key, fallback_product_key
                    )
            catalog.categories = [
                entry for entry in catalog.categories if entry.id != category_id
            ]
            self._persist()

    def reorder_categories(self, ordered_ids: Sequence[str]) -> None:
        with self._lock:
            catalog = self._load_catalog()
            order_map: Dict[str, int] = {
                category_id: index * 10 for index, category_id in enumerate(ordered_ids)
            }
            for category in catalog.categories:
                if category.id in order_map:
                    category.order = order_map[category.id]
            catalog.categories.sort(key=lambda entry: entry.order)
            self._persist()

    def create_subcategory(
        self,
        category_id: str,
        *,
        title: str,
        slug: Optional[str] = None,
        product_key: Optional[str] = None,
        description: str = "",
        order: Optional[int] = None,
        enabled: bool = True,
    ) -> Subcategory:
        with self._lock:
            category = self.find_category(category_id)
            candidate_slug = slug.strip() if slug else _slugify(title)
            candidate_product_key = (
                product_key.strip() if product_key else title.replace(" ", "")
            )
            existing_ids = {
                _canonical_key(sub.id)
                for sub in category.subcategories
            }
            if _canonical_key(candidate_slug) in existing_ids:
                raise CategoryServiceError(
                    f"Ya existe una subcategoría con el identificador '{candidate_slug}'."
                )
            next_order = (
                max((sub.order for sub in category.subcategories), default=0) + 10
                if order is None
                else int(order)
            )
            subcategory = Subcategory(
                id=candidate_slug,
                title=title.strip(),
                product_key=candidate_product_key,
                slug=candidate_slug,
                description=description.strip(),
                order=next_order,
                enabled=bool(enabled),
            )
            category.subcategories.append(subcategory)
            category.subcategories.sort(key=lambda entry: entry.order)
            self._persist()
            return subcategory

    def update_subcategory(
        self,
        category_id: str,
        subcategory_id: str,
        *,
        title: Optional[str] = None,
        slug: Optional[str] = None,
        product_key: Optional[str] = None,
        description: Optional[str] = None,
        order: Optional[int] = None,
        enabled: Optional[bool] = None,
    ) -> Subcategory:
        with self._lock:
            category = self.find_category(category_id)
            subcategory = category.get_subcategory(subcategory_id)
            if not subcategory:
                raise SubcategoryNotFoundError(subcategory_id)
            if title is not None:
                subcategory.title = title.strip()
            if slug is not None:
                subcategory.id = slug.strip()
                subcategory.slug = slug.strip()
            if product_key is not None:
                subcategory.product_key = product_key.strip()
            if description is not None:
                subcategory.description = description.strip()
            if order is not None:
                subcategory.order = int(order)
            if enabled is not None:
                subcategory.enabled = bool(enabled)
            category.subcategories.sort(key=lambda entry: entry.order)
            self._persist()
            return subcategory

    def delete_subcategory(self, category_id: str, subcategory_id: str) -> None:
        with self._lock:
            category = self.find_category(category_id)
            before = len(category.subcategories)
            category.subcategories = [
                entry for entry in category.subcategories if entry.id != subcategory_id
            ]
            if len(category.subcategories) == before:
                raise SubcategoryNotFoundError(subcategory_id)
            self._persist()

    def reorder_subcategories(
        self,
        category_id: str,
        ordered_ids: Sequence[str],
    ) -> None:
        with self._lock:
            category = self.find_category(category_id)
            order_map: Dict[str, int] = {
                sub_id: index * 10 for index, sub_id in enumerate(ordered_ids)
            }
            for sub in category.subcategories:
                if sub.id in order_map:
                    sub.order = order_map[sub.id]
            category.subcategories.sort(key=lambda entry: entry.order)
            self._persist()
