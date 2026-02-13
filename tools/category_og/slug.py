"""Slug utilities for category identifiers."""

from __future__ import annotations

import re
import unicodedata


class SlugError(ValueError):
    """Raised when slug normalization produces an invalid value."""


def slugify_category(name: str) -> str:
    """Convert free-form category names into deterministic snake_case slugs."""
    if not isinstance(name, str):
        raise SlugError("Category name must be a string.")
    normalized = unicodedata.normalize("NFD", name.strip().lower())
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = re.sub(r"\s+", "_", normalized)
    normalized = re.sub(r"[^a-z0-9_]", "", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise SlugError("Category slug cannot be empty after normalization.")
    return normalized


def is_slug_safe(slug: str) -> bool:
    """Return True when slug matches the expected managed pattern."""
    return bool(re.fullmatch(r"[a-z0-9_]+", str(slug or "")))
