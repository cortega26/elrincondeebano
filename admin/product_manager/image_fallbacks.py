"""Helpers to infer or generate raster fallbacks for AVIF assets."""

from __future__ import annotations

import logging
import shutil
import subprocess  # nosec B404 - required to invoke the trusted, project-local Node.js fallback script; no untrusted input involved
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
NODE_FALLBACK_SCRIPT = PROJECT_ROOT / "tools" / "convert-avif-fallback.mjs"
FALLBACK_EXTENSIONS = (".webp", ".jpg", ".jpeg", ".png", ".gif")


def _normalize_avif_asset_path(avif_rel: str) -> Optional[str]:
    normalized = str(avif_rel or "").strip().replace("\\", "/")
    if not normalized.startswith("assets/images/"):
        return None
    if not normalized.lower().endswith(".avif"):
        return None
    return normalized


def _asset_path_from_absolute(base_dir: Path, absolute_path: Path) -> str:
    rel_path = absolute_path.relative_to(base_dir).as_posix()
    return f"assets/images/{rel_path}"


def guess_fallback_from_avif(base_dir: str | Path, avif_rel: str) -> Optional[str]:
    """Infer a sibling fallback asset stored alongside an AVIF file."""
    normalized = _normalize_avif_asset_path(avif_rel)
    if not normalized:
        return None

    base_dir_path = Path(base_dir)
    relative = Path(normalized[len("assets/images/") :])
    target_stem = relative.stem
    target_dir = (base_dir_path / relative.parent).resolve()

    for ext in FALLBACK_EXTENSIONS:
        candidate = target_dir / f"{target_stem}{ext}"
        if candidate.exists():
            return _asset_path_from_absolute(base_dir_path, candidate)

    if not target_dir.exists():
        return None

    try:
        for candidate in target_dir.iterdir():
            if not candidate.is_file():
                continue
            if candidate.suffix.lower() not in FALLBACK_EXTENSIONS:
                continue
            if candidate.stem.casefold() != target_stem.casefold():
                continue
            return _asset_path_from_absolute(base_dir_path, candidate)
    except OSError as exc:
        logger.debug(
            "No se pudo inspeccionar el directorio de fallback %s: %s",
            target_dir,
            exc,
        )
        return None

    return None


def generate_fallback_from_avif(
    base_dir: str | Path,
    avif_rel: str,
    *,
    pil_available: bool,
    pil_avif: bool,
    pil_webp: bool,
    image_module: Any,
    resize_max: Optional[int] = None,
    preferred_extension: Optional[str] = None,
    command_logger: Optional[logging.Logger] = None,
) -> Optional[str]:
    """Create a non-AVIF fallback next to the AVIF source when missing."""
    normalized = _normalize_avif_asset_path(avif_rel)
    if not normalized:
        return None

    guessed = guess_fallback_from_avif(base_dir, normalized)
    if guessed:
        return guessed

    base_dir_path = Path(base_dir)
    relative = Path(normalized[len("assets/images/") :])
    avif_path = (base_dir_path / relative).resolve()
    if not avif_path.exists():
        return None

    logger_instance = command_logger or logger
    target_extension = _select_fallback_extension(
        pil_webp=pil_webp,
        preferred_extension=preferred_extension,
    )
    fallback_path = avif_path.with_suffix(target_extension)

    if fallback_path.exists():
        return _asset_path_from_absolute(base_dir_path, fallback_path)

    if pil_available and pil_avif:
        if _generate_with_pillow(
            avif_path=avif_path,
            fallback_path=fallback_path,
            image_module=image_module,
            pil_webp=pil_webp,
            resize_max=resize_max,
            command_logger=logger_instance,
        ):
            return _asset_path_from_absolute(base_dir_path, fallback_path)

    if _generate_with_node(
        avif_path=avif_path,
        fallback_path=fallback_path,
        resize_max=resize_max,
        command_logger=logger_instance,
    ):
        return _asset_path_from_absolute(base_dir_path, fallback_path)

    return None


def _select_fallback_extension(
    *,
    pil_webp: bool,
    preferred_extension: Optional[str],
) -> str:
    normalized_preferred = str(preferred_extension or "").strip().lower()
    if normalized_preferred in FALLBACK_EXTENSIONS:
        return normalized_preferred
    if pil_webp or _node_fallback_available():
        return ".webp"
    return ".png"


def _generate_with_pillow(
    *,
    avif_path: Path,
    fallback_path: Path,
    image_module: Any,
    pil_webp: bool,
    resize_max: Optional[int],
    command_logger: logging.Logger,
) -> bool:
    if image_module is None:
        return False

    try:
        fallback_path.parent.mkdir(parents=True, exist_ok=True)
        with image_module.open(avif_path) as src_img:
            image = src_img.convert(
                "RGBA" if src_img.mode in ("P", "RGBA", "LA") else "RGB"
            )
            if resize_max and resize_max > 0:
                image.thumbnail((resize_max, resize_max))

            save_params: dict[str, Any] = {}
            if fallback_path.suffix.lower() == ".webp" and pil_webp:
                save_params = {"format": "WEBP", "quality": 85}
            image.save(fallback_path, **save_params)
            image.close()
        return True
    except Exception as exc:
        command_logger.warning(
            "No se pudo generar fallback desde AVIF %s con Pillow: %s",
            avif_path,
            exc,
        )
        return False


def _node_fallback_available() -> bool:
    return NODE_FALLBACK_SCRIPT.exists() and shutil.which("node") is not None


def _generate_with_node(
    *,
    avif_path: Path,
    fallback_path: Path,
    resize_max: Optional[int],
    command_logger: logging.Logger,
) -> bool:
    node_bin = shutil.which("node")
    if node_bin is None or not NODE_FALLBACK_SCRIPT.exists():
        return False

    command = [
        node_bin,
        str(NODE_FALLBACK_SCRIPT),
        "--src",
        str(avif_path),
        "--dest",
        str(fallback_path),
    ]
    if resize_max and resize_max > 0:
        command.extend(["--max-size", str(resize_max)])

    try:
        subprocess.run(  # nosec B603 - command is built from fixed constants (NODE_FALLBACK_SCRIPT) and validated Path objects; shell=False (default) is intentional
            command,
            check=True,
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
        )
        return fallback_path.exists()
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        stdout = (exc.stdout or "").strip()
        details = stderr or stdout or str(exc)
        command_logger.warning(
            "No se pudo generar fallback desde AVIF %s con Node: %s",
            avif_path,
            details,
        )
        return False
    except OSError as exc:
        command_logger.warning(
            "No se pudo ejecutar el conversor Node para %s: %s",
            avif_path,
            exc,
        )
        return False
