"""SVG template system for category OG images."""

from __future__ import annotations

import hashlib
import html
import re
from typing import List, Tuple

TEMPLATE_VERSION = "v3"
WIDTH = 1200
HEIGHT = 1200

_PALETTE: Tuple[Tuple[str, str], ...] = (
    ("#3A77E6", "#1A2A67"),
    ("#2D9A8B", "#154D4D"),
    ("#D1782A", "#6A2F10"),
    ("#6B56D4", "#2C1E67"),
    ("#BB557A", "#5B1F3A"),
    ("#5F8E3A", "#264419"),
    ("#7F6A49", "#3A2E1F"),
    ("#2A87B8", "#123A5B"),
)

_PALETTE_OVERRIDES = {
    "aguas": ("#4BA7F0", "#155A9A"),
    "bebidas": ("#D94D32", "#6D241B"),
    "carnesyembutidos": ("#B3552E", "#5A2615"),
    "cervezas": ("#E0A122", "#7A4A07"),
    "chocolates": ("#8D5A3A", "#3A2418"),
    "comestibles": ("#8FB64D", "#39531E"),
    "despensa": ("#6AA84F", "#2F5F27"),
    "e": ("#2E7B7F", "#113E45"),
    "energeticaseisotonicas": ("#14B8B1", "#0B3B4A"),
    "espumantes": ("#C6A96A", "#6D5127"),
    "juegos": ("#6A5AE0", "#2D236B"),
    "jugos": ("#F08A24", "#8C3F10"),
    "lacteos": ("#EFD8A3", "#8F6E33"),
    "limpiezayaseo": ("#56A6D8", "#16435F"),
    "llaveros": ("#5A6ACF", "#25306B"),
    "mascotas": ("#D98B45", "#6B4020"),
    "piscos": ("#C67B3D", "#6A3B18"),
    "snacksdulces": ("#D05A91", "#5B2140"),
    "snackssalados": ("#CFA328", "#665114"),
    "software": ("#2B8CC4", "#103A5A"),
    "vinos": ("#7B1E3A", "#2C0E1A"),
}


def _palette_for_slug(slug: str) -> Tuple[str, str]:
    normalized = (slug or "").strip().lower()
    if normalized in _PALETTE_OVERRIDES:
        return _PALETTE_OVERRIDES[normalized]
    digest = hashlib.sha1(slug.encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(_PALETTE)
    return _PALETTE[idx]


def build_label(title: str, slug: str) -> str:
    """Create normalized uppercase label for badge rendering."""
    source = (title or slug or "categoria").strip().upper()
    source = re.sub(r"\s+", " ", source)
    return source or "CATEGORIA"


def _wrap_label_lines(label: str) -> List[str]:
    compact = re.sub(r"\s+", " ", label).strip()
    if not compact:
        return ["CATEGORIA"]
    if len(compact) <= 16:
        return [compact]

    words = compact.split(" ")
    target_chars = 14
    lines: List[str] = []
    current = ""
    for word in words:
        if not current:
            current = word
            continue
        candidate = f"{current} {word}"
        if len(candidate) <= target_chars:
            current = candidate
            continue
        lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def _label_style_for_lines(lines: List[str]) -> Tuple[int, int]:
    count = max(1, len(lines))
    longest = max((len(line) for line in lines), default=0)
    if count <= 1:
        font_size = 70
    elif count == 2:
        font_size = 52
    else:
        font_size = 42

    if longest > 16:
        font_size = max(34, font_size - (longest - 16) * 2)
    line_height = int(font_size * 1.1)
    return font_size, line_height


def _render_label_tspans(lines: List[str], *, center_x: int, center_y: int, line_height: int) -> str:
    start_y = center_y - ((len(lines) - 1) * line_height) / 2
    chunks: List[str] = []
    for index, line in enumerate(lines):
        y = start_y + (index * line_height)
        chunks.append(
            f"<tspan x=\"{center_x}\" y=\"{y:.1f}\">{html.escape(line)}</tspan>"
        )
    return "".join(chunks)


def render_svg(*, slug: str, title: str, icon_inner_svg: str, icon_name: str) -> str:
    """Render deterministic SVG for a category card."""
    color_a, color_b = _palette_for_slug(slug)
    label = build_label(title, slug)
    label_lines = _wrap_label_lines(label)
    label_font_size, label_line_height = _label_style_for_lines(label_lines)
    label_tspans = _render_label_tspans(
        label_lines,
        center_x=WIDTH // 2,
        center_y=946,
        line_height=label_line_height,
    )
    icon_markup = icon_inner_svg
    if "currentColor" not in icon_markup:
        icon_markup = icon_markup.replace('stroke="', 'stroke="#FFFFFF" ')

    return (
        f"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{WIDTH}\" height=\"{HEIGHT}\" "
        f"viewBox=\"0 0 {WIDTH} {HEIGHT}\" role=\"img\" aria-label=\"{html.escape(label)}\" "
        f"data-template-version=\"{TEMPLATE_VERSION}\" data-icon=\"{html.escape(icon_name)}\">"
        "<defs>"
        f"<linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">"
        f"<stop offset=\"0%\" stop-color=\"{color_a}\"/>"
        f"<stop offset=\"100%\" stop-color=\"{color_b}\"/>"
        "</linearGradient>"
        "<radialGradient id=\"halo\" cx=\"0.5\" cy=\"0.4\" r=\"0.7\">"
        "<stop offset=\"0%\" stop-color=\"#FFFFFF\" stop-opacity=\"0.18\"/>"
        "<stop offset=\"100%\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/>"
        "</radialGradient>"
        "</defs>"
        f"<rect width=\"{WIDTH}\" height=\"{HEIGHT}\" fill=\"url(#bg)\"/>"
        f"<circle cx=\"{WIDTH // 2}\" cy=\"500\" r=\"306\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.18\" stroke-width=\"12\"/>"
        f"<circle cx=\"{WIDTH // 2}\" cy=\"500\" r=\"246\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.30\" stroke-width=\"4\"/>"
        f"<circle cx=\"{WIDTH // 2}\" cy=\"500\" r=\"220\" fill=\"#0E1A2E\" fill-opacity=\"0.26\"/>"
        f"<circle cx=\"{WIDTH // 2}\" cy=\"500\" r=\"320\" fill=\"url(#halo)\"/>"
        f"<g transform=\"translate({WIDTH // 2} 500) scale(14) translate(-12 -12)\" color=\"#FFFFFF\" stroke=\"currentColor\" fill=\"none\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">"
        f"{icon_markup}"
        "</g>"
        "<rect x=\"255\" y=\"868\" width=\"690\" height=\"156\" rx=\"78\" fill=\"#0E1A2E\" fill-opacity=\"0.5\"/>"
        "<rect x=\"265\" y=\"878\" width=\"670\" height=\"136\" rx=\"68\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.36\" stroke-width=\"3\"/>"
        f"<text x=\"{WIDTH // 2}\" text-anchor=\"middle\" fill=\"#FFFFFF\" "
        f"font-family=\"Arial Black, Arial, Helvetica, sans-serif\" font-size=\"{label_font_size}\" "
        "font-weight=\"700\" letter-spacing=\"2\" dominant-baseline=\"middle\" "
        "style=\"paint-order: stroke; stroke: rgba(10, 16, 28, 0.35); stroke-width: 2px;\">"
        f"{label_tspans}</text>"
        "<rect x=\"10\" y=\"10\" width=\"1180\" height=\"1180\" rx=\"24\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.14\" stroke-width=\"4\"/>"
        "</svg>"
    )
