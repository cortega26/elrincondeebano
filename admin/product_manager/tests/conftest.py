import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple
from unittest.mock import MagicMock

# Add the project root to sys.path so tests can import modules like 'models'
root_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(root_dir))

# Mock portalocker since it might not be installed in the test environment
sys.modules["portalocker"] = MagicMock()

# --- Headless UI Fakes ---


class FakeStringVar:
    """Fake tk.StringVar for headless testing."""

    def __init__(self, value: str = ""):
        self._value = value
        self._trace_callbacks: List[Any] = []

    def get(self) -> str:
        return self._value

    def set(self, value: str) -> None:
        self._value = value

    def trace(self, _mode: str, _callback: Any) -> str:
        return "trace_id"


class FakeBooleanVar:
    """Fake tk.BooleanVar for headless testing."""

    def __init__(self, value: bool = False):
        self._value = value

    def get(self) -> bool:
        return self._value

    def set(self, value: bool) -> None:
        self._value = value


class FakeIntVar:
    """Fake tk.IntVar for headless testing."""

    def __init__(self, value: int = 0):
        self._value = value

    def get(self) -> int:
        return self._value

    def set(self, value: int) -> None:
        self._value = value


class FakeDoubleVar:
    """Fake tk.DoubleVar for headless testing."""

    def __init__(self, value: float = 0.0):
        self._value = value

    def get(self) -> float:
        return self._value

    def set(self, value: float) -> None:
        self._value = value


class FakeWidget:
    """Minimal fake widget with config/cget/pack/state support."""

    def __init__(self) -> None:
        self._config: Dict[str, Any] = {"state": "normal", "text": ""}
        self._packed = False

    def config(self, **kwargs: Any) -> None:
        self._config.update(kwargs)

    def cget(self, key: str) -> Any:
        return self._config.get(key, "")

    def pack(self, **_kwargs: Any) -> None:
        self._packed = True

    def pack_forget(self) -> None:
        self._packed = False

    def winfo_ismapped(self) -> bool:
        return self._packed


class FakeTk:
    """Fake Tk root for headless testing."""

    def __init__(self) -> None:
        self._after_jobs: Dict[str, Any] = {}
        self._next_job_id = 0
        self._protocols: Dict[str, Any] = {}
        self.quit_called = False

    def after(self, ms: int, callback: Any = None, *args: Any) -> str:
        job_id = f"after_{self._next_job_id}"
        self._next_job_id += 1
        self._after_jobs[job_id] = (ms, callback, args)
        return job_id

    def after_cancel(self, job_id: str) -> None:
        self._after_jobs.pop(job_id, None)

    def protocol(self, event: str, callback: Any) -> None:
        self._protocols[event] = callback

    def quit(self) -> None:
        self.quit_called = True

    def winfo_children(self) -> List[Any]:
        return []


class FakeEntry:
    """Fake ttk.Entry for headless testing."""

    def __init__(self, parent: Any = None) -> None:
        self._value = ""
        self._deleted = False

    def delete(self, first: Any, last: Any = None) -> None:
        self._deleted = True
        self._value = ""

    def insert(self, index: Any, text: str) -> None:
        self._value = text

    def cget(self, key: str) -> Any:
        return "TkDefaultFont"

    def get(self) -> str:
        return self._value


class FakeCombobox:
    """Fake ttk.Combobox for headless testing."""

    def __init__(self, parent: Any = None, **kwargs: Any) -> None:
        self._value = kwargs.get("textvariable", FakeStringVar())
        self._values: List[str] = []

    def get(self) -> str:
        if isinstance(self._value, FakeStringVar):
            return self._value.get()
        return str(self._value)

    def set(self, value: str) -> None:
        if isinstance(self._value, FakeStringVar):
            self._value.set(value)

    def pack(self, **_kwargs: Any) -> None:
        pass


class FakeText:
    """Fake tk.Text for headless testing."""

    def __init__(self, parent: Any = None, **kwargs: Any) -> None:
        self._content = ""

    def get(self, start: str, end: str) -> str:
        return self._content

    def insert(self, index: str, text: str) -> None:
        self._content = text

    def delete(self, start: str, end: str) -> None:
        self._content = ""


class FakeTreeview:
    """Fake ttk.Treeview for headless testing."""

    def __init__(self, parent: Any = None, show: str = "", **kwargs: Any) -> None:
        self._items: Dict[str, Dict[str, Any]] = {}
        self._children: List[str] = []
        self._selected: List[str] = []
        self._next_id = 0
        self.columns_list: List[str] = list(kwargs.get("columns", []))
        self._column_widths: Dict[str, int] = {}
        self._binds: Dict[str, Any] = {}
        self._packed = False

    def selection(self) -> Tuple[str, ...]:
        return tuple(self._selected)

    def selection_set(self, *items: str) -> None:
        self._selected = list(items)

    def get_children(self, item: str = "") -> Tuple[str, ...]:
        if item:
            return tuple()
        return tuple(self._children)

    def delete(self, *items: str) -> None:
        for item in items:
            self._items.pop(item, None)
            if item in self._children:
                self._children.remove(item)

    def insert(self, parent: str, index: Any, **values: Any) -> str:
        if isinstance(parent, str) and parent.startswith("I"):
            iid = parent
        else:
            iid = f"I{self._next_id:03d}"
            self._next_id += 1
        self._items[iid] = dict(values)
        if not parent:
            self._children.append(iid)
        return iid

    def set(self, item: str, column: Any = None, value: Any = None) -> Any:
        if column is not None and value is not None:
            self._items.setdefault(item, {})[column] = value
            return None
        if column is not None:
            return self._items.get(item, {}).get(column, "")
        return self._items.get(item, {})

    def item(self, item: str, option: Any = None) -> Any:
        entry_values = self._items.get(item, {})
        if option == "values":
            ordered = [str(entry_values.get(col, "")) for col in self.columns_list]
            return tuple(ordered)
        if option == "tags":
            return entry_values.get("tags", [])
        values = tuple(str(entry_values.get(col, "")) for col in self.columns_list)
        return {"values": values, **entry_values}

    def column(self, col: str, option: Any = None, **_kwargs: Any) -> Any:
        if option is not None:
            return self._column_widths.get(col, 0)
        return {"width": self._column_widths.get(col, 0)}

    def identify(self, element: str, x: int, y: int) -> str:
        return "cell"

    def identify_column(self, x: int) -> str:
        return "#1"

    def identify_row(self, y: int) -> str:
        if self._children:
            return self._children[0]
        return ""

    def focus(self, item: str) -> None:
        pass

    def see(self, item: str) -> None:
        pass

    def bind(self, sequence: str, callback: Any, add: Any = None) -> str:
        self._binds[sequence] = callback
        return "bind_id"

    def winfo_ismapped(self) -> bool:
        return self._packed

    def pack(self, **_kwargs: Any) -> None:
        self._packed = True

    def pack_forget(self) -> None:
        self._packed = False

    def configure(self, **kwargs: Any) -> None:
        pass

    def __getitem__(self, key: str) -> Any:
        if key == "columns":
            return self.columns_list
        raise KeyError(key)


# --- Test Product Helper ---


def create_test_product(
    name: str = "Test Product",
    description: str = "A test product",
    price: int = 1000,
    discount: int = 0,
    stock: bool = False,
    category: str = "TestCat",
    image_path: str = "",
    order: int = 0,
    is_archived: bool = False,
    **kwargs: Any,
) -> Any:
    """Create a Product instance for tests, importing lazily."""
    from admin.product_manager.models import Product

    return Product(
        name=name,
        description=description,
        price=price,
        discount=discount,
        stock=stock,
        category=category,
        image_path=image_path,
        order=order,
        is_archived=is_archived,
        **kwargs,
    )
