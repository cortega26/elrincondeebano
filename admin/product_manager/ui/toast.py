"""Non-blocking toast notifications for the Product Manager UI."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Callable, Dict, List, Optional, Tuple

import tkinter as tk

logger = logging.getLogger(__name__)

TOAST_HEIGHT = 44
TOAST_SPACING = 8
TOAST_PAD_X = 16
TOAST_PAD_Y = 8
TOAST_LIFETIME = 4000  # ms
TOAST_FADE_STEPS = 6
TOAST_FADE_MS = 30


class ToastLevel(Enum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


COLOR_MAP_LIGHT: Dict[ToastLevel, Tuple[str, str, str]] = {
    ToastLevel.INFO: ("#2980b9", "#ffffff", "#1a5c87"),
    ToastLevel.SUCCESS: ("#27ae60", "#ffffff", "#1a7340"),
    ToastLevel.WARNING: ("#e67e22", "#ffffff", "#b0601a"),
    ToastLevel.ERROR: ("#c0392b", "#ffffff", "#922b21"),
}

COLOR_MAP_DARK: Dict[ToastLevel, Tuple[str, str, str]] = {
    ToastLevel.INFO: ("#61afef", "#000000", "#4d8cbf"),
    ToastLevel.SUCCESS: ("#98c379", "#000000", "#7aa061"),
    ToastLevel.WARNING: ("#d19a66", "#000000", "#a77b52"),
    ToastLevel.ERROR: ("#e06c75", "#000000", "#b3565e"),
}


class Toast:
    """Animated toast notification widget."""

    def __init__(
        self,
        master: tk.Misc,
        message: str,
        level: ToastLevel = ToastLevel.INFO,
        lifetime_ms: int = TOAST_LIFETIME,
        on_dismiss: Optional[Callable[[], None]] = None,
        dark_mode: bool = False,
    ):
        self.master = master
        self.message = message
        self.level = level
        self.lifetime_ms = lifetime_ms
        self.on_dismiss = on_dismiss
        self._dismissed = False
        self._alpha = 1.0
        self._after_id: Optional[str] = None
        self._fade_after_ids: List[str] = []

        color_map = COLOR_MAP_DARK if dark_mode else COLOR_MAP_LIGHT
        bg_color, fg_color, _ = color_map[level]

        self._frame = tk.Frame(
            master,
            bg=bg_color,
            highlightthickness=0,
            bd=0,
        )

        self._label = tk.Label(
            self._frame,
            text=message,
            bg=bg_color,
            fg=fg_color,
            font=("sans-serif", 10),
            padx=TOAST_PAD_X,
            pady=TOAST_PAD_Y,
            anchor="w",
            wraplength=400,
        )
        self._label.pack(side=tk.LEFT, fill=tk.X, expand=True)

        close_btn = tk.Label(
            self._frame,
            text="✕",
            bg=bg_color,
            fg=fg_color,
            font=("sans-serif", 12),
            padx=8,
            pady=4,
            cursor="hand2",
        )
        close_btn.pack(side=tk.RIGHT)
        close_btn.bind("<Button-1>", lambda _e: self.dismiss())

        self._label.bind("<Button-1>", lambda _e: self.dismiss())

        self._schedule_dismiss()

    def _schedule_dismiss(self) -> None:
        try:
            self._after_id = self.master.after(self.lifetime_ms, self._fade_out)
        except Exception:
            pass

    def _fade_out(self) -> None:
        if self._dismissed:
            return
        self._alpha -= 1.0 / TOAST_FADE_STEPS
        if self._alpha <= 0:
            self.dismiss()
            return
        try:
            fade_id = self.master.after(
                TOAST_FADE_MS, self._fade_out
            )
            self._fade_after_ids.append(fade_id)
        except Exception:
            self.dismiss()

    def dismiss(self) -> None:
        if self._dismissed:
            return
        self._dismissed = True
        for aid in self._fade_after_ids:
            try:
                self.master.after_cancel(aid)
            except Exception:
                pass
        if self._after_id:
            try:
                self.master.after_cancel(self._after_id)
            except Exception:
                pass
        self._fade_after_ids.clear()
        try:
            self._frame.destroy()
        except Exception:
            pass
        if self.on_dismiss:
            try:
                self.on_dismiss()
            except Exception:
                pass


class ToastManager:
    """Manages toast notifications stacking at the bottom-right of the window."""

    def __init__(
        self,
        master: tk.Misc,
        *,
        max_toasts: int = 5,
        dark_mode: bool = False,
    ):
        self.master = master
        self.max_toasts = max_toasts
        self.dark_mode = dark_mode
        self._toasts: List[Toast] = []

    def show(
        self,
        message: str,
        level: ToastLevel = ToastLevel.INFO,
        lifetime_ms: int = TOAST_LIFETIME,
    ) -> Toast:
        """Display a toast notification. Excess toasts are dismissed oldest-first."""
        self._prune_excess()

        toast = Toast(
            self.master,
            message=message,
            level=level,
            lifetime_ms=lifetime_ms,
            on_dismiss=lambda: self._remove_toast(toast),
            dark_mode=self.dark_mode,
        )
        self._toasts.append(toast)
        self._reposition_toasts()
        return toast

    def _remove_toast(self, toast: Toast) -> None:
        if toast in self._toasts:
            self._toasts.remove(toast)
        self._reposition_toasts()

    def _prune_excess(self) -> None:
        while len(self._toasts) >= self.max_toasts:
            oldest = self._toasts[0]
            oldest.dismiss()

    def _reposition_toasts(self) -> None:
        try:
            master_w = self.master.winfo_width()
            master_h = self.master.winfo_height()
        except tk.TclError:
            return

        x = master_w - 380
        base_y = master_h - 60

        for i, toast in enumerate(reversed(self._toasts)):
            if toast._dismissed:
                continue
            y = base_y - i * (TOAST_HEIGHT + TOAST_SPACING)
            try:
                toast._frame.place(x=x, y=y, width=360, height=TOAST_HEIGHT)
                toast._frame.lift()
            except tk.TclError:
                pass

    def set_dark_mode(self, dark: bool) -> None:
        self.dark_mode = dark


def show_toast(
    master: tk.Misc,
    message: str,
    level: ToastLevel = ToastLevel.INFO,
    lifetime_ms: int = TOAST_LIFETIME,
    dark_mode: bool = False,
) -> Toast:
    """Convenience: show a single toast without a manager."""
    return Toast(master, message=message, level=level, lifetime_ms=lifetime_ms, dark_mode=dark_mode)
