"""
Data models for category catalog management.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional


def _sanitize_bool(value: Any, default: bool = True) -> bool:
    """Normalize truthy/falsy inputs into a boolean."""
    if isinstance(value, bool):
        return value
    if value in ("true", "True", "1", 1):
        return True
    if value in ("false", "False", "0", 0):
        return False
    return default


def _coerce_int(value: Any, default: int = 0) -> int:
    """Coerce values to int with a fallback."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass
class Subcategory:
    """Represents a subcategory within the catalog."""

    id: str
    title: str
    product_key: str
    slug: str
    description: str = ""
    order: int = 0
    enabled: bool = True

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Subcategory":
        """Build a subcategory from a dictionary payload."""
        return cls(
            id=data["id"],
            title=data.get("title") or data["id"],
            product_key=data.get("product_key") or data["id"],
            slug=data.get("slug") or data["id"],
            description=data.get("description", ""),
            order=_coerce_int(data.get("order"), 0),
            enabled=_sanitize_bool(data.get("enabled"), True),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the subcategory to a dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "product_key": self.product_key,
            "slug": self.slug,
            "description": self.description,
            "order": self.order,
            "enabled": self.enabled,
        }


@dataclass
class Category:
    """Represents a top-level storefront category."""
    # Data model stores multiple fields representing catalog metadata.
    # pylint: disable=too-many-instance-attributes

    id: str
    title: str
    product_key: str
    slug: str
    description: str = ""
    group_id: str = ""
    order: int = 0
    enabled: bool = True
    subcategories: List[Subcategory] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Category":
        """Build a category from a dictionary payload."""
        subcategories_data = data.get("subcategories", []) or []
        subcategories = [
            Subcategory.from_dict(entry)
            for entry in sorted(
                subcategories_data, key=lambda entry: _coerce_int(entry.get("order"), 0)
            )
        ]
        return cls(
            id=data["id"],
            title=data.get("title") or data["id"],
            product_key=data.get("product_key") or data["id"],
            slug=data.get("slug") or data["id"],
            description=data.get("description", ""),
            group_id=data.get("group_id", ""),
            order=_coerce_int(data.get("order"), 0),
            enabled=_sanitize_bool(data.get("enabled"), True),
            subcategories=subcategories,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the category to a dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "product_key": self.product_key,
            "slug": self.slug,
            "description": self.description,
            "group_id": self.group_id,
            "order": self.order,
            "enabled": self.enabled,
            "subcategories": [sub.to_dict() for sub in self.subcategories],
        }

    def get_subcategory(self, subcategory_id: str) -> Optional[Subcategory]:
        """Return a subcategory by id when present."""
        for subcategory in self.subcategories:
            if subcategory.id == subcategory_id:
                return subcategory
        return None

    def sorted_subcategories(self) -> Iterable[Subcategory]:
        """Return subcategories sorted by order."""
        return sorted(self.subcategories, key=lambda sub: sub.order)


@dataclass
class NavGroup:
    """Represents a navigation grouping for categories."""

    id: str
    label: str
    order: int = 0
    description: str = ""
    enabled: bool = True

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NavGroup":
        """Build a nav group from a dictionary payload."""
        return cls(
            id=data["id"],
            label=data.get("label") or data["id"],
            order=_coerce_int(data.get("order"), 0),
            description=data.get("description", ""),
            enabled=_sanitize_bool(data.get("enabled"), True),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the nav group to a dictionary."""
        return {
            "id": self.id,
            "label": self.label,
            "order": self.order,
            "description": self.description,
            "enabled": self.enabled,
        }


@dataclass
class CategoryCatalog:
    """Container for category data and metadata."""

    version: str
    last_updated: str
    nav_groups: List[NavGroup] = field(default_factory=list)
    categories: List[Category] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CategoryCatalog":
        """Build a category catalog from a dictionary payload."""
        nav_groups_data = data.get("nav_groups", []) or []
        categories_data = data.get("categories", []) or []
        nav_groups = [
            NavGroup.from_dict(entry)
            for entry in sorted(
                nav_groups_data, key=lambda entry: _coerce_int(entry.get("order"), 0)
            )
            if entry
        ]
        categories = [
            Category.from_dict(entry)
            for entry in sorted(
                categories_data, key=lambda entry: _coerce_int(entry.get("order"), 0)
            )
            if entry
        ]
        return cls(
            version=data.get("version", ""),
            last_updated=data.get("last_updated", ""),
            nav_groups=nav_groups,
            categories=categories,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the category catalog to a dictionary."""
        return {
            "version": self.version,
            "last_updated": self.last_updated,
            "nav_groups": [group.to_dict() for group in self.nav_groups],
            "categories": [category.to_dict() for category in self.categories],
        }

    def get_nav_group(self, group_id: str) -> Optional[NavGroup]:
        """Return a nav group by id when present."""
        for group in self.nav_groups:
            if group.id == group_id:
                return group
        return None

    def get_category(self, category_id: str) -> Optional[Category]:
        """Return a category by id when present."""
        for category in self.categories:
            if category.id == category_id:
                return category
        return None

    def find_category_by_product_key(self, key: str) -> Optional[Category]:
        """Find a category by product key."""
        normalized = (key or "").strip().lower()
        for category in self.categories:
            if category.product_key.lower() == normalized:
                return category
        return None
