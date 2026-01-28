"""Datetime helpers for product manager modules."""

from __future__ import annotations

from datetime import datetime
from typing import Optional


def parse_iso_datetime(
    value: Optional[str], *, default: Optional[datetime] = None
) -> Optional[datetime]:
    """Parse ISO-8601 datetime strings, falling back to the provided default."""
    if not value:
        return default
    normalized = value.replace("Z", "+00:00")
    parser = getattr(datetime, "fromisoformat", None)
    if parser is not None:
        try:
            return parser(normalized)
        except ValueError:
            pass
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue
    return default
