"""History store for product changes."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


class HistoryStore:
    """Persist product change history to a separate JSON file."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or (Path.home() / ".product_manager" / "product_history.json")

    def load_history(self) -> Dict[str, List[Dict[str, Any]]]:
        """Load history from disk; return empty on error."""
        if not self.path.exists():
            return {}
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return {}
            history: Dict[str, List[Dict[str, Any]]] = {}
            for key, value in data.items():
                if isinstance(key, str) and isinstance(value, list):
                    history[key] = [
                        entry for entry in value if isinstance(entry, dict)
                    ]
            return history
        except Exception:
            return {}

    def save_history(self, history: Dict[str, List[Dict[str, Any]]]) -> None:
        """Atomically save history to disk."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, self.path)

    def append_entry(
        self, product_key: str, entry: Dict[str, Any], cap: int = 20
    ) -> None:
        """Append an entry to the product history."""
        history = self.load_history()
        entries = history.get(product_key, [])
        entries.append(entry)
        history[product_key] = entries[-cap:]
        self.save_history(history)
