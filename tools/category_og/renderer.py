"""SVG -> JPG renderer backed by Node sharp."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class RenderError(RuntimeError):
    """Raised when SVG->JPG rendering fails."""


def _resolve_node_binary() -> str:
    candidates = [
        shutil.which("node"),
        "C:\\Program Files\\nodejs\\node.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    raise RenderError("Node.js executable not found. Install Node 22.x and retry.")


def render_svg_to_jpg(
    *,
    repo_root: Path,
    svg_path: Path,
    jpg_path: Path,
    width: int = 1200,
    height: int = 1200,
    quality: int = 88,
) -> None:
    """Render SVG file into JPG using sharp through a Node helper."""
    node_bin = _resolve_node_binary()
    script_path = (repo_root / "tools" / "category_og" / "render_jpg.mjs").resolve()
    if not script_path.exists():
        raise RenderError(f"Renderer script missing: {script_path}")

    command = [
        node_bin,
        str(script_path),
        str(svg_path),
        str(jpg_path),
        str(width),
        str(height),
        str(quality),
    ]
    process = subprocess.run(  # noqa: S603
        command,
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode != 0:
        raise RenderError(
            "sharp rendering failed"
            f"\ncommand: {' '.join(command)}"
            f"\nstdout: {process.stdout.strip()}"
            f"\nstderr: {process.stderr.strip()}"
        )
