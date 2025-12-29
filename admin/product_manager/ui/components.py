import tkinter as tk
from tkinter import ttk, messagebox
from typing import List, Optional, Callable, Dict, Any, TypeVar
import threading
from queue import Queue, Empty
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')

@dataclass
class UIConfig:
    """Configuration for UI elements."""
    font_size: int = 10
    window_size: tuple[int, int] = (1000, 600)
    enable_animations: bool = True
    locale: str = 'es'


class UIState:
    """Manages UI state with change notifications."""

    def __init__(self):
        self._state: Dict[str, Any] = {}
        self._observers: Dict[str, List[Callable[[Any], None]]] = {}

    def update(self, key: str, value: Any) -> None:
        """Update state and notify observers."""
        self._state[key] = value
        for callback in self._observers.get(key, []):
            callback(value)

    def get(self, key: str, default: T = None) -> T:
        """Get state value with default."""
        return self._state.get(key, default)

    def subscribe(self, key: str, callback: Callable[[Any], None]) -> None:
        """Subscribe to state changes."""
        if key not in self._observers:
            self._observers[key] = []
        self._observers[key].append(callback)

    def unsubscribe(self, key: str, callback: Callable[[Any], None]) -> None:
        """Unsubscribe from state changes."""
        if key in self._observers:
            self._observers[key].remove(callback)


class AsyncOperation:
    """Handles asynchronous operations with UI feedback."""

    def __init__(self, parent: tk.Widget):
        self.parent = parent
        self.queue: Queue = Queue()
        self.progress_var = tk.DoubleVar(value=0)
        self.status_var = tk.StringVar(value="")

    def start(self, operation: Callable, on_complete: Optional[Callable] = None):
        """Start async operation with progress dialog."""
        dialog = self._create_progress_dialog()

        def worker():
            try:
                result = operation()
                self.queue.put(("success", result))
            except Exception as e:
                self.queue.put(("error", str(e)))

        def check_queue():
            try:
                status, result = self.queue.get_nowait()
                dialog.destroy()
                if status == "success" and on_complete:
                    on_complete(result)
                elif status == "error":
                    messagebox.showerror("Error", str(result))
            except Empty:
                dialog.after(100, check_queue)

        threading.Thread(target=worker, daemon=True).start()
        check_queue()

    def _create_progress_dialog(self) -> tk.Toplevel:
        """Create progress dialog window."""
        dialog = tk.Toplevel(self.parent)
        dialog.title("Procesando...")
        dialog.transient(self.parent)
        dialog.grab_set()

        ttk.Label(dialog, textvariable=self.status_var).pack(pady=10)
        ttk.Progressbar(dialog, variable=self.progress_var,
                        maximum=100).pack(pady=10, padx=20, fill=tk.X)

        return dialog


class TreeviewManager:
    """Manages Treeview widget operations."""

    def __init__(self, tree: ttk.Treeview, columns: Dict[str, Dict[str, Any]]):
        self.tree = tree
        self.columns = columns
        self.sort_order: Dict[str, bool] = {}
        self.setup_columns()

    def setup_columns(self) -> None:
        """Set up treeview columns."""
        self.tree["columns"] = tuple(self.columns.keys())
        for col, config in self.columns.items():
            self.tree.heading(
                col,
                text=config["text"],
                command=lambda c=col: self.sort_by_column(c)
            )
            self.tree.column(
                col,
                width=config["width"],
                anchor=config.get("anchor", tk.W)
            )

    def sort_by_column(self, col: str) -> None:
        """Sort treeview by column."""
        for column in self.tree["columns"]:
            if column != col and column in self.sort_order:
                del self.sort_order[column]
        self.sort_order[col] = not self.sort_order.get(col, False)
        reverse = self.sort_order[col]
        items = [(self.tree.set(k, col), k)
                 for k in self.tree.get_children("")]
        if col in ("price", "discount"):
            items.sort(key=lambda x: self._parse_number(x[0]), reverse=reverse)
        elif col == "stock":
            items.sort(key=lambda x: x[0] == "☑", reverse=reverse)
        else:
            items.sort(key=lambda x: x[0].lower(), reverse=reverse)
        for index, (_, k) in enumerate(items):
            self.tree.move(k, "", index)
        self.update_sort_indicators()

    def _parse_number(self, value: str) -> int:
        """Parse number from string, handling formatting."""
        try:
            return int(value.replace(".", "").replace(",", ""))
        except (ValueError, AttributeError):
            return 0

    def update_sort_indicators(self) -> None:
        """Update sort indicators in column headers."""
        for col in self.tree["columns"]:
            heading_text = self.columns[col]["text"]
            if col in self.sort_order:
                arrow = " ▲" if self.sort_order[col] else " ▼"
                self.tree.heading(col, text=f"{heading_text}{arrow}")
            else:
                self.tree.heading(col, text=heading_text)


class DragDropMixin:
    """Mixin to add drag & drop functionality to Treeview."""

    def setup_drag_and_drop(self, tree: ttk.Treeview):
        self.tree = tree # Ensure tree is accessible
        self._drag_data = {"item": None, "start_index": -1}
        tree.bind("<ButtonPress-1>", self._on_drag_start)
        tree.bind("<B1-Motion>", self._on_drag_motion)
        tree.bind("<ButtonRelease-1>", self._on_drag_release)

    def _on_drag_start(self, event: tk.Event) -> None:
        item = self.tree.identify_row(event.y)
        if item:
            self._drag_data["item"] = item
            self._drag_data["start_index"] = self.tree.index(item)

    def _on_drag_motion(self, event: tk.Event) -> None:
        item = self._drag_data.get("item")
        if item:
            moved_to = self.tree.index(self.tree.identify_row(event.y))
            if moved_to != self.tree.index(item):
                self.tree.move(item, '', moved_to)

    def _on_drag_release(self, event: tk.Event) -> None:
        try:
            item = self._drag_data.get("item")
            if item:
                end_index = self.tree.index(self.tree.identify_row(event.y))
                if end_index != self._drag_data["start_index"]:
                    # Expecting implementer to have reorder_products
                    if hasattr(self, 'reorder_products'):
                        self.reorder_products(end_index)
                self._drag_data = {"item": None, "start_index": -1}
            
            # Stock toggle logic check
            region = self.tree.identify("region", event.x, event.y)
            column = self.tree.identify_column(event.x)
            clicked_item = self.tree.identify_row(event.y)
            
            # This part interacts with product_service which might not be present in the Mixin itself
            # Ideally this logic should be in the main class using the Mixin, or the Mixin should access it via self
            if region == "cell" and column == "#5" and clicked_item:
                 if hasattr(self, 'toggle_stock_by_click'):
                     self.toggle_stock_by_click(clicked_item)

        except Exception as e:
            if hasattr(self, 'logger'):
                self.logger.error(f"Error in drag & drop handling: {str(e)}")
            messagebox.showerror(
                "Error", f"Error al actualizar el estado: {str(e)}")
