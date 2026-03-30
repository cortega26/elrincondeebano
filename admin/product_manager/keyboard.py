"""Keyboard binding helpers for Product Manager."""

from __future__ import annotations

from typing import Any, Callable, Protocol


class BindableWidget(Protocol):
    """Minimal protocol for widgets that expose Tk-style key bindings."""

    def bind(self, sequence: str, func: Callable[..., Any]) -> Any:
        """Register a callback for the given event sequence."""


ENTER_SUBMIT_SEQUENCES = ("<Return>", "<KP_Enter>")


def bind_submit_keys(
    widget: BindableWidget, handler: Callable[..., Any]
) -> None:
    """Bind both main Enter and keypad Enter to the same submit handler."""

    for sequence in ENTER_SUBMIT_SEQUENCES:
        widget.bind(sequence, handler)
