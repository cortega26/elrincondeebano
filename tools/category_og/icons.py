"""Icon mapping and loading helpers for category OG generation."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict


@dataclass(frozen=True)
class IconMapping:
    """Resolved icon configuration."""

    version: str
    default_icon: str
    slug_map: Dict[str, str]
    keyword_map: Dict[str, str]


def load_icon_mapping(config_path: Path) -> IconMapping:
    """Load deterministic icon mapping configuration."""
    if not config_path.exists():
        raise FileNotFoundError(f"Icon mapping file not found: {config_path}")
    raw = json.loads(config_path.read_text(encoding="utf-8-sig"))
    slug_map = {
        str(key).strip().lower(): str(value).strip()
        for key, value in dict(raw.get("slug_map") or {}).items()
        if str(key).strip() and str(value).strip()
    }
    keyword_map = {
        str(key).strip().lower(): str(value).strip()
        for key, value in dict(raw.get("keyword_map") or {}).items()
        if str(key).strip() and str(value).strip()
    }
    default_icon = str(raw.get("default_icon") or "shapes").strip()
    version = str(raw.get("version") or "v1").strip() or "v1"
    return IconMapping(
        version=version,
        default_icon=default_icon,
        slug_map=slug_map,
        keyword_map=keyword_map,
    )


def resolve_icon_name(mapping: IconMapping, slug: str, title: str) -> str:
    """Resolve icon name using slug-first then keyword fallback."""
    normalized_slug = str(slug or "").strip().lower()
    if normalized_slug in mapping.slug_map:
        return mapping.slug_map[normalized_slug]

    haystack = f"{normalized_slug} {title or ''}".lower()
    for keyword, icon_name in mapping.keyword_map.items():
        if keyword and keyword in haystack:
            return icon_name
    return mapping.default_icon


def load_icon_inner_svg(icon_name: str, icons_dir: Path) -> str:
    """Load icon SVG and return its inner markup.

    The icon source keeps Lucide's original stroke style for consistency.
    """
    icon_path = (icons_dir / f"{icon_name}.svg").resolve()
    if not icon_path.exists():
        raise FileNotFoundError(f"Icon not found: {icon_path}")
    raw = icon_path.read_text(encoding="utf-8")
    match = re.search(r"<svg[^>]*>(?P<inner>[\s\S]*?)</svg>", raw, flags=re.IGNORECASE)
    if not match:
        raise ValueError(f"Invalid icon SVG wrapper in {icon_path}")
    inner = match.group("inner").strip()
    if not inner:
        raise ValueError(f"Icon has no drawable content: {icon_path}")
    return inner
