"""Utility helpers for UI image handling and category labels."""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Dict, List, Optional, Tuple, cast

logger = logging.getLogger(__name__)

# --- Centralized PIL / Image Support Detection ---
try:
    from PIL import Image, ImageTk, features  # type: ignore

    PIL_AVAILABLE = True
    try:
        PIL_WEBP = features.check("webp")
    except Exception:  # pylint: disable=broad-exception-caught
        PIL_WEBP = False

    # Try multiple strategies for AVIF support
    try:
        import pillow_heif  # type: ignore

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
            import pillow_avif  # type: ignore

            PIL_AVIF = bool(getattr(pillow_avif, "__name__", ""))
        except ImportError:
            try:
                PIL_AVIF = features.check("avif")
            except Exception:  # pylint: disable=broad-exception-caught
                PIL_AVIF = False
    except Exception:  # pylint: disable=broad-exception-caught
        PIL_AVIF = False

except ImportError:
    PIL_AVAILABLE = False
    PIL_WEBP = False
    PIL_AVIF = False
    # Mocking for type hinting if needed, or just relying on checks
    Image = None
    ImageTk = None


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
        self.display_values: List[str] = []

        for label, key in self.choices:
            display = self._format_display(label, key)
            self.display_values.append(display)
            self.display_to_key[display] = key
            self.key_to_display[key.strip().lower()] = display
            self.labels_by_key[key.strip().lower()] = label

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
        display = self.key_to_display.get(normalized)
        if display:
            return display
        label = self.labels_by_key.get(normalized, key)
        return self._format_display(label, key)

    def get_key_from_display(self, display_value: str) -> str:
        """Return the key for a display label."""
        cleaned = (display_value or "").strip()
        if not cleaned:
            return ""
        return self.display_to_key.get(cleaned, cleaned)
