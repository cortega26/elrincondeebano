"""Theme and styling system for the Product Manager UI — powered by ttkbootstrap."""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional, Tuple

import tkinter as tk
from tkinter import ttk

_ttkbootstrap_available = False
_ttkbootstrap_Style: Any = None
_ttkbootstrap_utility: Any = None

try:
    import ttkbootstrap  # noqa: F401
    from ttkbootstrap import Style as _BootstrapStyle, utility as _bs_utility

    _ttkbootstrap_available = True
    _ttkbootstrap_Style = _BootstrapStyle
    _ttkbootstrap_utility = _bs_utility
except ImportError:
    pass


class AppTheme(Enum):
    LIGHT = "light"
    DARK = "dark"


@dataclass
class ColorPalette:
    """Colour overrides for elements outside ttkbootstrap's reach (canvas, toasts, raw tk)."""

    accent: str = "#3584e4"
    danger: str = "#c0392b"
    warning: str = "#e67e22"
    success: str = "#27ae60"
    info: str = "#2980b9"
    status_bg: str = "#eeeeee"
    status_fg: str = "#2e3436"
    toolbar_bg: str = "#f6f5f4"
    canvas_bg: str = "#eeeeee"
    menu_bg: str = "#ffffff"
    menu_fg: str = "#2e3436"


# Pre-built dark variant (avoids recursion from dataclass __post_init__).
PALETTE = ColorPalette()
PALETTE_DARK = ColorPalette(
    accent="#5294e2",
    danger="#e06c75",
    warning="#d19a66",
    success="#98c379",
    info="#61afef",
    status_bg="#252525",
    status_fg="#aaaaaa",
    toolbar_bg="#1e1e1e",
    canvas_bg="#252525",
    menu_bg="#2d2d2d",
    menu_fg="#d4d4d4",
)


_BOOT_LIGHT_THEMES = ("flatly", "minty", "litera", "journal", "cosmo", "simplex", "yeti")
_BOOT_DARK_THEMES = ("darkly", "cyborg", "vapor", "superhero", "solar")

DEFAULT_LIGHT_THEME = "flatly"
DEFAULT_DARK_THEME = "darkly"


class ThemeManager:
    """Central theme manager powered by ttkbootstrap with fallback to clam."""

    def __init__(self, root: tk.Tk, *, style: Any = None):
        self._root = root
        self._current: AppTheme = AppTheme.LIGHT
        self._current_theme_name = DEFAULT_LIGHT_THEME

        if style is not None and _ttkbootstrap_available:
            self._style = style
            self._has_bootstrap = True
        elif _ttkbootstrap_available and hasattr(root, "style"):
            self._style = root.style
            self._has_bootstrap = True
        elif _ttkbootstrap_available:
            self._style = _ttkbootstrap_Style(theme=self._current_theme_name)
            self._has_bootstrap = True
        else:
            self._style = ttk.Style()
            theme = "clam" if "clam" in self._style.theme_names() else "alt"
            self._style.theme_use(theme)
            self._has_bootstrap = False
            self._apply_fallback_styles()

        self._configure_menu_colors(dark=False)
        self._configure_custom_styles()

    # ------------------------------------------------------------------
    #  Properties
    # ------------------------------------------------------------------

    @property
    def current(self) -> AppTheme:
        return self._current

    @property
    def is_dark(self) -> bool:
        return self._current == AppTheme.DARK

    @property
    def current_theme_name(self) -> str:
        return self._current_theme_name

    # ------------------------------------------------------------------
    #  Theme API
    # ------------------------------------------------------------------

    def set_theme(self, theme: AppTheme, *, theme_name: Optional[str] = None) -> None:
        """Apply a theme globally."""
        self._current = theme
        is_dark = theme == AppTheme.DARK

        if theme_name is None:
            theme_name = DEFAULT_DARK_THEME if is_dark else DEFAULT_LIGHT_THEME
        self._current_theme_name = theme_name

        if self._has_bootstrap:
            self._style.theme_use(theme_name)
        else:
            self._apply_fallback_styles()

        self._configure_menu_colors(dark=is_dark)
        self._configure_custom_styles()
        self._root.configure(bg=self._style.colors.bg if self._has_bootstrap else self._root.cget("bg"))

    def toggle_theme(self, *, theme_name: Optional[str] = None) -> AppTheme:
        """Toggle between light and dark. Returns the new theme."""
        new_theme = AppTheme.DARK if self._current == AppTheme.LIGHT else AppTheme.LIGHT
        self.set_theme(new_theme, theme_name=theme_name)
        return new_theme

    def set_theme_by_name(self, name: str) -> AppTheme:
        """Set a ttkbootstrap theme by name. Auto-detects light vs dark."""
        is_dark = name in _BOOT_DARK_THEMES or "dark" in name.casefold()
        theme = AppTheme.DARK if is_dark else AppTheme.LIGHT
        self.set_theme(theme, theme_name=name)
        return theme

    # ------------------------------------------------------------------
    #  Available themes
    # ------------------------------------------------------------------

    @staticmethod
    def available_themes() -> list[str]:
        """Return list of all available ttkbootstrap themes."""
        if _ttkbootstrap_available:
            try:
                temp = _ttkbootstrap_Style()
                return sorted(
                    t for t in temp.theme_names()
                    if t not in ("default", "name")
                )
            except Exception:
                pass
        return []

    @staticmethod
    def available_light_themes() -> list[str]:
        return [t for t in ThemeManager.available_themes() if t in _BOOT_LIGHT_THEMES] or list(_BOOT_LIGHT_THEMES)

    @staticmethod
    def available_dark_themes() -> list[str]:
        return [t for t in ThemeManager.available_themes() if t in _BOOT_DARK_THEMES] or list(_BOOT_DARK_THEMES)

    # ------------------------------------------------------------------
    #  Style configuration
    # ------------------------------------------------------------------

    def _configure_custom_styles(self) -> None:
        """Configure custom ttk style names for semantic buttons."""
        if not self._has_bootstrap:
            return

    def _configure_menu_colors(self, dark: bool) -> None:
        pal = PALETTE_DARK if dark else PALETTE
        try:
            self._root.option_add("*Menu.background", pal.menu_bg)
            self._root.option_add("*Menu.foreground", pal.menu_fg)
            self._root.option_add("*Menu.activeBackground", pal.accent)
            self._root.option_add("*Menu.activeForeground", "#ffffff")
        except tk.TclError:
            pass

    def _apply_fallback_styles(self) -> None:
        """Apply manual theme when ttkbootstrap is unavailable."""
        if self.is_dark:
            self._style.theme_use("clam")
        p = PALETTE_DARK if self.is_dark else PALETTE

        bg_color = "#1e1e1e" if self.is_dark else "#f6f5f4"
        fg_color = "#d4d4d4" if self.is_dark else "#2e3436"
        btn_bg = "#3c3c3c" if self.is_dark else "#e8e8e7"
        btn_active = "#505050" if self.is_dark else "#dfdfde"
        disabled_bg = "#333333" if self.is_dark else "#f0f0f0"
        disabled_fg = "#606060" if self.is_dark else "#909090"
        entry_bg = "#2d2d2d" if self.is_dark else "#ffffff"
        tree_bg = "#1e1e1e" if self.is_dark else "#ffffff"
        tree_fg = "#cccccc" if self.is_dark else "#2e3436"
        header_bg = "#2d2d2d" if self.is_dark else "#ebebeb"
        header_fg = "#d4d4d4" if self.is_dark else "#2e3436"
        sel_bg = "#264f78" if self.is_dark else "#3584e4"
        sel_fg = "#ffffff"

        self._style.configure(".", background=bg_color, foreground=fg_color)
        self._style.configure("TButton", padding=8, relief="flat",
                              background=btn_bg, foreground=fg_color, borderwidth=1)
        self._style.map("TButton",
                        background=[("active", btn_active), ("disabled", disabled_bg)],
                        foreground=[("disabled", disabled_fg)])

        self._style.configure("Accent.TButton", background=p.accent, foreground="#ffffff")
        self._style.map("Accent.TButton",
                        background=[("active", p.accent), ("disabled", "#f0f0f0")],
                        foreground=[("disabled", "#909090")])

        self._style.configure("Secondary.TButton", background=p.success, foreground="#ffffff")
        self._style.configure("Danger.TButton", background=p.danger, foreground="#ffffff")

        self._style.configure("TEntry", fieldbackground=entry_bg, foreground=fg_color, padding=5)
        self._style.configure("TCombobox", fieldbackground=entry_bg, foreground=fg_color, padding=5)

        self._style.configure("Treeview", background=tree_bg, fieldbackground=tree_bg,
                              foreground=tree_fg, rowheight=32, borderwidth=1, relief="flat")
        self._style.configure("Treeview.Heading", background=header_bg, foreground=header_fg,
                              relief="flat", padding=5)
        self._style.map("Treeview",
                        background=[("selected", sel_bg)],
                        foreground=[("selected", sel_fg)])

        self._style.configure("Toolbar.TFrame", background=p.toolbar_bg)
        self._style.configure("Status.TFrame", background=p.status_bg)
        self._style.configure("Status.TLabel", background=p.status_bg, foreground=p.status_fg)

    # ------------------------------------------------------------------
    #  Helpers for other modules
    # ------------------------------------------------------------------

    def apply_to_toplevel(self, window: tk.Toplevel) -> None:
        """Apply current theme background to a newly created Toplevel window."""
        if self._has_bootstrap:
            window.configure(bg=self._style.colors.bg)
        else:
            p = PALETTE_DARK if self.is_dark else PALETTE
            window.configure(bg=p.toolbar_bg)

    def get_font(self) -> Tuple[Any, ...]:
        return (11,)

    def get_font_family(self) -> str:
        return "Inter, Roboto, Ubuntu, DejaVu Sans, Segoe UI, sans-serif"

    # ------------------------------------------------------------------
    #  Persistence
    # ------------------------------------------------------------------

    def save_preference(self) -> None:
        """Persist theme preference to disk."""
        config_path = Path.home() / ".product_manager" / "config.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if config_path.exists():
            try:
                with open(config_path, encoding="utf-8") as f:
                    existing = json.load(f)
                if not isinstance(existing, dict):
                    existing = {}
            except Exception:
                existing = {}
        existing["theme"] = self._current.value
        existing["theme_name"] = self._current_theme_name
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)


def load_theme_preference() -> dict:
    """Load persisted theme preference. Returns dict with 'theme' and 'theme_name'."""
    config_path = Path.home() / ".product_manager" / "config.json"
    if config_path.exists():
        try:
            with open(config_path, encoding="utf-8") as f:
                data = json.load(f)
            theme_val = data.get("theme", "light")
            theme_name = data.get("theme_name", DEFAULT_LIGHT_THEME if theme_val == "light" else DEFAULT_DARK_THEME)
            return {"theme": theme_val, "theme_name": theme_name}
        except Exception:
            pass
    return {"theme": "light", "theme_name": DEFAULT_LIGHT_THEME}
