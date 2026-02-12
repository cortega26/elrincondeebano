"""Utility helpers for UI image handling and category labels."""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from collections import defaultdict
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple, cast

logger = logging.getLogger(__name__)


def _normalize_lookup_text(value: str) -> str:
    """Normalize free-form text for tolerant lookups."""
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    normalized = unicodedata.normalize("NFD", cleaned)
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", normalized.lower())


def default_category_subdir(category_key: str) -> str:
    """Return a deterministic fallback subdirectory for a category key."""
    cleaned = unicodedata.normalize("NFD", (category_key or "").strip())
    cleaned = "".join(ch for ch in cleaned if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", cleaned)
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", cleaned).strip("_").lower()
    return cleaned or "general"


def extract_media_subdir(path_value: Any) -> Optional[str]:
    """Extract first-level media subdirectory from assets/images path."""
    if not isinstance(path_value, str):
        return None
    normalized = path_value.strip().replace("\\", "/")
    if not normalized.startswith("assets/images/"):
        return None
    remainder = normalized[len("assets/images/") :]
    if not remainder:
        return None
    segment = remainder.split("/", 1)[0].strip().lower()
    if not segment:
        return None
    return segment


def derive_category_media_subdirs(
    products: Iterable[Any],
    category_keys: Iterable[str],
) -> Tuple[Dict[str, str], Dict[str, Set[str]]]:
    """Derive preferred and alias media subdirs for category keys."""
    normalized_key_map: Dict[str, str] = {}
    primary: Dict[str, str] = {}
    aliases: Dict[str, Set[str]] = {}
    counters: Dict[str, Dict[str, int]] = defaultdict(dict)

    for key in category_keys:
        key_value = str(key or "").strip()
        if not key_value:
            continue
        normalized_key_map[_normalize_lookup_text(key_value)] = key_value
        default_subdir = default_category_subdir(key_value)
        primary[key_value] = default_subdir
        aliases[key_value] = {default_subdir}

    for product in products:
        if isinstance(product, dict):
            raw_category = product.get("category")
            media_candidates = [product.get("image_path"), product.get("image_avif_path")]
        else:
            raw_category = getattr(product, "category", "")
            media_candidates = [
                getattr(product, "image_path", None),
                getattr(product, "image_avif_path", None),
            ]

        category_text = str(raw_category or "").strip()
        if not category_text:
            continue

        normalized = _normalize_lookup_text(category_text)
        category_key = normalized_key_map.get(normalized, category_text)
        if category_key not in aliases:
            default_subdir = default_category_subdir(category_key)
            primary[category_key] = default_subdir
            aliases[category_key] = {default_subdir}
            normalized_key_map[_normalize_lookup_text(category_key)] = category_key

        for media_path in media_candidates:
            subdir = extract_media_subdir(media_path)
            if not subdir:
                continue
            category_counts = counters[category_key]
            category_counts[subdir] = category_counts.get(subdir, 0) + 1
            aliases[category_key].add(subdir)

    for category_key, category_counts in counters.items():
        if not category_counts:
            continue
        preferred = sorted(
            category_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )[0][0]
        primary[category_key] = preferred
        aliases.setdefault(category_key, set()).add(preferred)

    return primary, aliases

# --- Centralized PIL / Image Support Detection ---
Image: Any = None  # pylint: disable=invalid-name
ImageTk: Any = None  # pylint: disable=invalid-name

try:
    from PIL import Image as PILImage, ImageTk as PILImageTk, features

    PIL_AVAILABLE = True
    Image = PILImage  # pylint: disable=invalid-name
    ImageTk = PILImageTk  # pylint: disable=invalid-name
    try:
        PIL_WEBP = features.check("webp")
    except Exception:  # pylint: disable=broad-exception-caught
        PIL_WEBP = False

    # Try multiple strategies for AVIF support
    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
        REGISTER_AVIF_OPENER = cast(
            Optional[Callable[[], None]],
            getattr(pillow_heif, "register_avif_opener", None),
        )
        if REGISTER_AVIF_OPENER is not None:
            try:
                REGISTER_AVIF_OPENER()
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.debug(
                    "Failed to register AVIF opener via pillow_heif: %s", exc
                )
        PIL_AVIF = True
    except ImportError:
        try:
            import pillow_avif

            PIL_AVIF = bool(getattr(pillow_avif, "__name__", ""))
        except ImportError:
            try:
                PIL_AVIF = bool(features.check("avif"))
            except Exception:  # pylint: disable=broad-exception-caught
                PIL_AVIF = False
    except Exception:  # pylint: disable=broad-exception-caught
        PIL_AVIF = False

except ImportError:
    PIL_AVAILABLE = False
    PIL_WEBP = False
    PIL_AVIF = False
    # Mocking for type hinting if needed, or just relying on checks
    Image = None  # pylint: disable=invalid-name
    ImageTk = None  # pylint: disable=invalid-name


def load_thumbnail(path: str, w: int, h: int) -> Optional[Any]:
    """
    Load and resize an image from path.
    Returns None if PIL is not available or image fails to load.
    Returns ImageTk.PhotoImage.
    """
    if not PIL_AVAILABLE:
        return None

    if not os.path.exists(path):
        return None

    try:
        with Image.open(path) as img:
            # Handle mode
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA")
            img.thumbnail((w, h))
            return ImageTk.PhotoImage(img)
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("Failed to load thumbnail %s: %s", path, exc)
        return None


class CategoryHelper:
    """Helper for managing category display names and keys."""

    def __init__(self, choices: List[Tuple[str, str]]):
        """Initialize helper with category choices."""
        self.choices = choices
        self._prepare_mappings()

    def update_choices(self, choices: List[Tuple[str, str]]) -> None:
        """Update category choices and rebuild mappings."""
        self.choices = choices
        self._prepare_mappings()

    def _prepare_mappings(self) -> None:
        """Build lookup tables for labels and keys."""
        self.display_to_key: Dict[str, str] = {}
        self.key_to_display: Dict[str, str] = {}
        self.labels_by_key: Dict[str, str] = {}
        self.lookup_to_key: Dict[str, str] = {}
        self.display_values: List[str] = []

        for label, key in self.choices:
            display = self._format_display(label, key)
            self.display_values.append(display)
            self.display_to_key[display] = key
            self.key_to_display[key.strip().lower()] = display
            self.labels_by_key[key.strip().lower()] = label
            for candidate in (display, label, key):
                self._register_lookup(candidate, key)

    @staticmethod
    def _normalize_lookup(value: str) -> str:
        """Normalize free-form text for tolerant lookups."""
        return _normalize_lookup_text(value)

    def _register_lookup(self, source: str, key: str) -> None:
        """Register both exact and normalized aliases for a category key."""
        source_clean = (source or "").strip()
        key_clean = (key or "").strip()
        if not source_clean or not key_clean:
            return
        self.lookup_to_key[source_clean.casefold()] = key_clean
        compact = self._normalize_lookup(source_clean)
        if compact:
            self.lookup_to_key[compact] = key_clean

    @staticmethod
    def _format_display(label: str, key: str) -> str:
        """Format a display label for a category choice."""
        cleaned_label = (label or "").strip()
        cleaned_key = (key or "").strip()
        if not cleaned_label:
            return cleaned_key
        if cleaned_label == cleaned_key:
            return cleaned_key
        return f"{cleaned_label} ({cleaned_key})"

    def get_display_for_key(self, key: str) -> str:
        """Return the display label for a stored key."""
        normalized = (key or "").strip().lower()
        if not normalized:
            return ""
        canonical_key = self.lookup_to_key.get((key or "").strip().casefold()) or key
        canonical_normalized = (canonical_key or "").strip().lower()
        display = self.key_to_display.get(canonical_normalized) or self.key_to_display.get(
            normalized
        )
        if display:
            return display
        label = self.labels_by_key.get(canonical_normalized, key)
        return self._format_display(label, canonical_key)

    def get_key_from_display(self, display_value: str) -> str:
        """Return the key for a display label."""
        cleaned = (display_value or "").strip()
        if not cleaned:
            return ""
        key = self.display_to_key.get(cleaned)
        if key:
            return key
        by_casefold = self.lookup_to_key.get(cleaned.casefold())
        if by_casefold:
            return by_casefold
        compact = self._normalize_lookup(cleaned)
        if compact:
            by_compact = self.lookup_to_key.get(compact)
            if by_compact:
                return by_compact

        # Support free-typed "Label (key)" values.
        if cleaned.endswith(")") and "(" in cleaned:
            candidate = cleaned.rsplit("(", 1)[1].rstrip(")").strip()
            if candidate:
                key_from_candidate = self.lookup_to_key.get(candidate.casefold())
                if key_from_candidate:
                    return key_from_candidate
                compact_candidate = self._normalize_lookup(candidate)
                if compact_candidate:
                    key_from_compact = self.lookup_to_key.get(compact_candidate)
                    if key_from_compact:
                        return key_from_compact
        return cleaned
