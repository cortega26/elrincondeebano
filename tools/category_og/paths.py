"""Path and filesystem safety helpers for category OG assets."""

from __future__ import annotations

from pathlib import Path
import re

from .slug import is_slug_safe


class UnsafePathError(ValueError):
    """Raised when a target path escapes the managed base directory."""


def repo_root_from_here() -> Path:
    """Resolve repository root using this package location."""
    return Path(__file__).resolve().parents[2]


def category_assets_dir(repo_root: Path) -> Path:
    return repo_root / "assets" / "images" / "og" / "categories"


def icon_assets_dir(repo_root: Path) -> Path:
    return repo_root / "assets" / "images" / "og" / "icons"


def manifest_path(repo_root: Path) -> Path:
    return category_assets_dir(repo_root) / ".og_manifest.json"


def icon_map_path(repo_root: Path) -> Path:
    return repo_root / "config" / "category_og_icon_map.json"


VERSION_TOKEN_RE = re.compile(r"^[a-z0-9_-]+$")


def safe_slug_path(base_dir: Path, slug: str, suffix: str) -> Path:
    """Build a safe managed path inside base_dir for a slug + suffix."""
    if not is_slug_safe(slug):
        raise UnsafePathError(f"Invalid managed slug: {slug!r}")
    if suffix not in (".svg", ".jpg"):
        raise UnsafePathError(f"Unsupported suffix: {suffix}")
    target = (base_dir / f"{slug}{suffix}").resolve()
    base = base_dir.resolve()
    if not str(target).startswith(str(base)):
        raise UnsafePathError(f"Refusing to operate outside {base}")
    return target


def safe_versioned_jpg_path(base_dir: Path, slug: str, version_token: str) -> Path:
    """Build a safe managed JPG path using a stable version token."""
    if not is_slug_safe(slug):
        raise UnsafePathError(f"Invalid managed slug: {slug!r}")
    if not VERSION_TOKEN_RE.fullmatch(version_token):
        raise UnsafePathError(f"Invalid JPG version token: {version_token!r}")
    target = (base_dir / f"{slug}.{version_token}.jpg").resolve()
    base = base_dir.resolve()
    if not str(target).startswith(str(base)):
        raise UnsafePathError(f"Refusing to operate outside {base}")
    return target
