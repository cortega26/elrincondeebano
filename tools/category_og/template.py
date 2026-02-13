"""SVG template system for category OG images."""

from __future__ import annotations

import hashlib
import html
import re
from typing import Tuple

TEMPLATE_VERSION = "v1"
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


def _palette_for_slug(slug: str) -> Tuple[str, str]:
    digest = hashlib.sha1(slug.encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(_PALETTE)
    return _PALETTE[idx]


def build_label(title: str, slug: str) -> str:
    """Create short uppercase label suitable for badge rendering."""
    source = (title or slug or "categoria").strip().upper()
    source = re.sub(r"\s+", " ", source)
    words = source.split(" ")[:2]
    label = " ".join(words).strip()
    if len(label) > 16:
        label = label[:16].rstrip()
    return label or "CATEGORIA"


def render_svg(*, slug: str, title: str, icon_inner_svg: str, icon_name: str) -> str:
    """Render deterministic SVG for a category card."""
    color_a, color_b = _palette_for_slug(slug)
    label = html.escape(build_label(title, slug))
    icon_markup = icon_inner_svg
    if "currentColor" not in icon_markup:
        icon_markup = icon_markup.replace('stroke="', 'stroke="#FFFFFF" ')

    return (
        f"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{WIDTH}\" height=\"{HEIGHT}\" "
        f"viewBox=\"0 0 {WIDTH} {HEIGHT}\" role=\"img\" aria-label=\"{label}\" "
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
        "<rect x=\"255\" y=\"874\" width=\"690\" height=\"142\" rx=\"71\" fill=\"#0E1A2E\" fill-opacity=\"0.5\"/>"
        "<rect x=\"265\" y=\"884\" width=\"670\" height=\"122\" rx=\"61\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.36\" stroke-width=\"3\"/>"
        f"<text x=\"{WIDTH // 2}\" y=\"961\" text-anchor=\"middle\" fill=\"#FFFFFF\" "
        "font-family=\"Arial Black, Arial, Helvetica, sans-serif\" font-size=\"70\" font-weight=\"700\" letter-spacing=\"2\">"
        f"{label}</text>"
        "<rect x=\"10\" y=\"10\" width=\"1180\" height=\"1180\" rx=\"24\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.14\" stroke-width=\"4\"/>"
        "</svg>"
    )
