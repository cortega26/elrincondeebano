"""Core deterministic pipeline for category OG assets."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
import re
import tempfile
from typing import Dict, Iterable, List, Optional

from .icons import load_icon_inner_svg, load_icon_mapping, resolve_icon_name
from .paths import (
    category_assets_dir,
    icon_assets_dir,
    icon_map_path,
    manifest_path,
    repo_root_from_here,
    safe_slug_path,
    safe_versioned_jpg_path,
)
from .renderer import RenderError, render_svg_to_jpg
from .slug import SlugError, is_slug_safe, slugify_category
from .template import HEIGHT, TEMPLATE_VERSION, WIDTH, render_svg


class CategoryOgPipelineError(RuntimeError):
    """Raised for category OG pipeline errors."""


@dataclass(frozen=True)
class CategoryRecord:
    """Minimal category data required for OG generation."""

    slug: str
    title: str


MANAGED_VERSIONED_JPG_RE = re.compile(r"^([a-z0-9_]+)\.([a-z0-9_-]+)\.jpg$")
MANAGED_LEGACY_JPG_RE = re.compile(r"^([a-z0-9_]+)\.jpg$")


def _jpg_version_token() -> str:
    return f"og_{TEMPLATE_VERSION.lower()}"


def _jpg_name_for_slug(slug: str) -> str:
    return f"{slug}.{_jpg_version_token()}.jpg"


def _jpg_owner_slug(file_name: str) -> Optional[str]:
    versioned = MANAGED_VERSIONED_JPG_RE.fullmatch(file_name)
    if versioned:
        return versioned.group(1)
    legacy = MANAGED_LEGACY_JPG_RE.fullmatch(file_name)
    if legacy:
        return legacy.group(1)
    return None


def _file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_text_if_changed(path: Path, payload: str) -> bool:
    existing = path.read_text(encoding="utf-8") if path.exists() else None
    if existing == payload:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")
    return True


def _write_bytes_if_changed(path: Path, payload: bytes) -> bool:
    existing = path.read_bytes() if path.exists() else None
    if existing == payload:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return True


def _render_jpg_if_changed(repo_root: Path, svg_file: Path, jpg_file: Path) -> bool:
    with tempfile.NamedTemporaryFile(suffix=".jpg", dir=str(jpg_file.parent), delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        render_svg_to_jpg(
            repo_root=repo_root,
            svg_path=svg_file,
            jpg_path=tmp_path,
            width=WIDTH,
            height=HEIGHT,
            quality=88,
        )
        rendered = tmp_path.read_bytes()
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
    return _write_bytes_if_changed(jpg_file, rendered)


def _read_json(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _load_categories_from_registry(path: Path) -> List[CategoryRecord]:
    payload = _read_json(path)
    raw_categories = payload.get("categories") or []
    records: List[CategoryRecord] = []
    for entry in raw_categories:
        if not isinstance(entry, dict):
            continue
        raw_slug = str(entry.get("slug") or entry.get("id") or "").strip()
        if not raw_slug:
            continue
        try:
            slug = slugify_category(raw_slug)
        except SlugError:
            continue
        title_payload = entry.get("display_name") or {}
        title = ""
        if isinstance(title_payload, dict):
            title = str(title_payload.get("default") or "").strip()
        title = title or slug
        records.append(CategoryRecord(slug=slug, title=title))
    return records


def _load_categories_from_legacy(path: Path) -> List[CategoryRecord]:
    payload = _read_json(path)
    raw_categories = payload.get("categories") or []
    records: List[CategoryRecord] = []
    for entry in raw_categories:
        if not isinstance(entry, dict):
            continue
        raw_slug = str(entry.get("slug") or entry.get("id") or "").strip()
        if not raw_slug:
            continue
        try:
            slug = slugify_category(raw_slug)
        except SlugError:
            continue
        title = str(entry.get("title") or slug).strip() or slug
        records.append(CategoryRecord(slug=slug, title=title))
    return records


def load_category_records(repo_root: Path) -> List[CategoryRecord]:
    """Load category records from canonical registry with legacy fallback."""
    registry = repo_root / "data" / "category_registry.json"
    legacy = repo_root / "data" / "categories.json"
    if registry.exists():
        records = _load_categories_from_registry(registry)
    elif legacy.exists():
        records = _load_categories_from_legacy(legacy)
    else:
        raise CategoryOgPipelineError("No category source found in data/.")

    unique: Dict[str, CategoryRecord] = {}
    collisions: Dict[str, List[str]] = {}
    for record in records:
        if record.slug in unique:
            collisions.setdefault(record.slug, [unique[record.slug].title]).append(record.title)
            continue
        unique[record.slug] = record

    if collisions:
        examples = ", ".join(f"{slug}: {titles}" for slug, titles in collisions.items())
        raise CategoryOgPipelineError(
            "Slug collision detected in category source. Resolve before generating OG assets. "
            f"Details: {examples}"
        )

    return [unique[slug] for slug in sorted(unique.keys())]


def _manifest_payload(
    *,
    records: Iterable[CategoryRecord],
    categories_dir: Path,
    icon_map_version: str,
) -> Dict:
    slugs = sorted(record.slug for record in records)
    items: Dict[str, Dict[str, object]] = {}
    version_token = _jpg_version_token()
    for slug in slugs:
        svg_file = safe_slug_path(categories_dir, slug, ".svg")
        jpg_file = safe_versioned_jpg_path(categories_dir, slug, version_token)
        jpg_file_name = jpg_file.name
        items[slug] = {
            "svg": {
                "exists": svg_file.exists(),
                "size": svg_file.stat().st_size if svg_file.exists() else 0,
                "sha256": _file_sha256(svg_file) if svg_file.exists() else "",
                "width": WIDTH,
                "height": HEIGHT,
            },
            "jpg": {
                "file": jpg_file_name,
                "exists": jpg_file.exists(),
                "size": jpg_file.stat().st_size if jpg_file.exists() else 0,
                "sha256": _file_sha256(jpg_file) if jpg_file.exists() else "",
                "width": WIDTH,
                "height": HEIGHT,
            },
        }

    return {
        "template_version": TEMPLATE_VERSION,
        "jpg_version_token": version_token,
        "icon_map_version": icon_map_version,
        "managed_slug_pattern": "[a-z0-9_]+",
        "slugs": slugs,
        "items": items,
    }


def _load_manifest(path: Path) -> Dict:
    if not path.exists():
        return {}
    try:
        return _read_json(path)
    except Exception:
        return {}


def _write_manifest_if_changed(path: Path, payload: Dict) -> bool:
    serialized = json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    return _write_text_if_changed(path, serialized)


def _normalize_slug_or_raise(slug: str) -> str:
    try:
        normalized = slugify_category(slug)
    except SlugError as exc:
        raise CategoryOgPipelineError(str(exc)) from exc
    if not is_slug_safe(normalized):
        raise CategoryOgPipelineError(f"Unsafe managed slug: {slug!r}")
    return normalized


def _jpg_variants_for_slug(categories_dir: Path, slug: str) -> List[Path]:
    if not categories_dir.exists():
        return []
    variants: List[Path] = []
    prefix = f"{slug}."
    for entry in categories_dir.iterdir():
        if not entry.is_file() or entry.suffix.lower() != ".jpg":
            continue
        if entry.name == f"{slug}.jpg" or entry.name.startswith(prefix):
            variants.append(entry)
    return variants


def ensure_category_assets(
    slug: str,
    *,
    title: Optional[str] = None,
    repo_root: Optional[Path] = None,
    dry_run: bool = False,
    force: bool = False,
) -> Dict[str, object]:
    """Ensure SVG + JPG assets exist for a category slug."""
    base = repo_root or repo_root_from_here()
    managed_slug = _normalize_slug_or_raise(slug)
    categories_dir = category_assets_dir(base)
    icons_dir = icon_assets_dir(base)
    mapping = load_icon_mapping(icon_map_path(base))

    resolved_title = (title or managed_slug).strip() or managed_slug
    icon_name = resolve_icon_name(mapping, managed_slug, resolved_title)
    icon_inner = load_icon_inner_svg(icon_name, icons_dir)
    svg_payload = render_svg(
        slug=managed_slug,
        title=resolved_title,
        icon_inner_svg=icon_inner,
        icon_name=icon_name,
    )

    svg_file = safe_slug_path(categories_dir, managed_slug, ".svg")
    jpg_file = safe_versioned_jpg_path(categories_dir, managed_slug, _jpg_version_token())
    svg_changed = False
    jpg_changed = False
    removed_jpg_variants: List[str] = []

    if not dry_run:
        svg_changed = _write_text_if_changed(svg_file, svg_payload)
        if force or svg_changed or not jpg_file.exists():
            try:
                jpg_changed = _render_jpg_if_changed(base, svg_file, jpg_file)
            except RenderError as exc:
                raise CategoryOgPipelineError(str(exc)) from exc
        for stale in _jpg_variants_for_slug(categories_dir, managed_slug):
            if stale.resolve() == jpg_file.resolve():
                continue
            stale.unlink()
            removed_jpg_variants.append(str(stale))
            jpg_changed = True
    else:
        svg_changed = force or (not svg_file.exists()) or (svg_file.read_text(encoding="utf-8") != svg_payload)
        jpg_changed = force or (not jpg_file.exists())
        removed_jpg_variants = [
            str(stale)
            for stale in _jpg_variants_for_slug(categories_dir, managed_slug)
            if stale.resolve() != jpg_file.resolve()
        ]
        jpg_changed = jpg_changed or bool(removed_jpg_variants)

    return {
        "slug": managed_slug,
        "title": resolved_title,
        "icon": icon_name,
        "svg": str(svg_file),
        "jpg": str(jpg_file),
        "jpg_file": jpg_file.name,
        "removed_jpg_variants": removed_jpg_variants,
        "svg_changed": bool(svg_changed),
        "jpg_changed": bool(jpg_changed),
    }


def delete_category_assets(
    slug: str,
    *,
    repo_root: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Delete managed SVG + JPG assets for a category slug."""
    base = repo_root or repo_root_from_here()
    managed_slug = _normalize_slug_or_raise(slug)
    categories_dir = category_assets_dir(base)
    deleted: List[str] = []
    svg_target = safe_slug_path(categories_dir, managed_slug, ".svg")
    if svg_target.exists():
        if not dry_run:
            svg_target.unlink()
        deleted.append(str(svg_target))
    for jpg_variant in _jpg_variants_for_slug(categories_dir, managed_slug):
        if not dry_run:
            jpg_variant.unlink()
        deleted.append(str(jpg_variant))
    return {"slug": managed_slug, "deleted": deleted}


def sync_category_assets(
    *,
    repo_root: Optional[Path] = None,
    dry_run: bool = False,
    force: bool = False,
) -> Dict[str, object]:
    """Sync category OG assets with current category source of truth."""
    base = repo_root or repo_root_from_here()
    categories_dir = category_assets_dir(base)
    categories_dir.mkdir(parents=True, exist_ok=True)

    records = load_category_records(base)
    mapping = load_icon_mapping(icon_map_path(base))

    manifest_file = manifest_path(base)
    previous_manifest = _load_manifest(manifest_file)
    force_by_version = (
        previous_manifest.get("template_version") != TEMPLATE_VERSION
        or previous_manifest.get("icon_map_version") != mapping.version
    )

    generated: List[Dict[str, object]] = []
    any_changed = False
    for record in records:
        result = ensure_category_assets(
            record.slug,
            title=record.title,
            repo_root=base,
            dry_run=dry_run,
            force=force or force_by_version,
        )
        generated.append(result)
        any_changed = any_changed or bool(result["svg_changed"]) or bool(result["jpg_changed"])

    expected_slugs = {record.slug for record in records}
    removed: List[str] = []
    for entry in categories_dir.iterdir():
        if not entry.is_file():
            continue
        suffix = entry.suffix.lower()
        if suffix == ".svg":
            stem = entry.stem.lower()
            if not is_slug_safe(stem) or stem in expected_slugs:
                continue
            if not dry_run:
                entry.unlink()
            removed.append(str(entry))
            any_changed = True
            continue
        if suffix != ".jpg":
            continue
        owner_slug = _jpg_owner_slug(entry.name.lower())
        if not owner_slug or not is_slug_safe(owner_slug):
            continue
        is_expected_owner = owner_slug in expected_slugs
        is_expected_name = entry.name.lower() == _jpg_name_for_slug(owner_slug)
        if is_expected_owner and is_expected_name:
            continue
        if not dry_run:
            entry.unlink()
        removed.append(str(entry))
        any_changed = True

    manifest_payload = _manifest_payload(
        records=records,
        categories_dir=categories_dir,
        icon_map_version=mapping.version,
    )
    manifest_changed = False
    if not dry_run:
        manifest_changed = _write_manifest_if_changed(manifest_file, manifest_payload)
        any_changed = any_changed or manifest_changed

    return {
        "generated": generated,
        "removed": removed,
        "manifest": str(manifest_file),
        "manifest_changed": manifest_changed,
        "template_version": TEMPLATE_VERSION,
        "icon_map_version": mapping.version,
        "changed": any_changed,
        "total_categories": len(records),
    }


def lookup_title_for_slug(slug: str, *, repo_root: Optional[Path] = None) -> Optional[str]:
    """Resolve category title from current source of truth for a managed slug."""
    base = repo_root or repo_root_from_here()
    managed = _normalize_slug_or_raise(slug)
    for record in load_category_records(base):
        if record.slug == managed:
            return record.title
    return None
