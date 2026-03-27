from pathlib import Path

import pytest

from test_support import bootstrap_tests

bootstrap_tests()

from tools.category_og.paths import (  # noqa: E402
    UnsafePathError,
    find_override_raster_path,
    safe_slug_path,
    safe_versioned_jpg_path,
)


def test_safe_slug_path_accepts_managed_targets(tmp_path: Path) -> None:
    target = safe_slug_path(tmp_path, "bebidas", ".jpg")
    assert target == (tmp_path / "bebidas.jpg").resolve()  # nosec B101 - pytest assertion


def test_safe_slug_path_rejects_invalid_slug_and_suffix(tmp_path: Path) -> None:
    with pytest.raises(UnsafePathError):
        safe_slug_path(tmp_path, "../escape", ".jpg")

    with pytest.raises(UnsafePathError):
        safe_slug_path(tmp_path, "Bebidas", ".jpg")

    with pytest.raises(UnsafePathError):
        safe_slug_path(tmp_path, "bebidas", ".png")


def test_safe_versioned_jpg_path_accepts_managed_token(tmp_path: Path) -> None:
    target = safe_versioned_jpg_path(tmp_path, "bebidas", "og_v1")
    assert target == (tmp_path / "bebidas.og_v1.jpg").resolve()  # nosec B101 - pytest assertion


def test_safe_versioned_jpg_path_rejects_invalid_token(tmp_path: Path) -> None:
    with pytest.raises(UnsafePathError):
        safe_versioned_jpg_path(tmp_path, "bebidas", "../v1")


def test_find_override_raster_path_prefers_managed_override_file(tmp_path: Path) -> None:
    target = tmp_path / "cervezas.override.png"
    target.write_bytes(b"png")
    assert find_override_raster_path(tmp_path, "cervezas") == target.resolve()  # nosec B101
