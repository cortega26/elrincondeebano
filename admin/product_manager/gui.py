import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from typing import List, Optional, Callable, Dict, Any, TypeVar, Protocol
import os
from pathlib import Path
from .models import Product
from .services import ProductService, ProductNotFoundError, ProductServiceError
try:
    from PIL import Image, ImageTk, features  # type: ignore
    PIL_AVAILABLE = True
    PIL_WEBP = features.check('webp')
except Exception:
    PIL_AVAILABLE = False
    PIL_WEBP = False
import logging
import shutil
import threading
from queue import Queue, Empty
import json
from dataclasses import dataclass, fields

# Se asume que la configuración centralizada del logging se realiza en el arranque de la aplicación.
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
        ttk.Progressbar(dialog, variable=self.progress_var, maximum=100).pack(pady=10, padx=20, fill=tk.X)
        
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
        items = [(self.tree.set(k, col), k) for k in self.tree.get_children("")]
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
                    self.reorder_products(end_index)
                self._drag_data = {"item": None, "start_index": -1}
            region = self.tree.identify("region", event.x, event.y)
            column = self.tree.identify_column(event.x)
            clicked_item = self.tree.identify_row(event.y)
            if region == "cell" and column == "#5" and clicked_item:
                product = self.get_product_by_tree_item(clicked_item)
                if not product:
                    return
                self.logger.debug(f"Toggling stock for product: {product.name} (current: {product.stock})")
                updated_product = Product(
                    name=product.name,
                    description=product.description,
                    price=product.price,
                    discount=product.discount,
                    stock=not product.stock,
                    category=product.category,
                    image_path=product.image_path,
                    order=product.order
                )
                self.product_service.update_product(product.name, updated_product)
                self.tree.set(clicked_item, "stock", "☑" if updated_product.stock else "☐")
                self.logger.info(
                    f"Stock updated for '{product.name}': "
                    f"{'En stock' if updated_product.stock else 'Sin stock'}"
                )
                self.update_status(
                    f"Stock de '{product.name}' actualizado: "
                    f"{'En stock' if updated_product.stock else 'Sin stock'}"
                )
        except Exception as e:
            self.logger.error(f"Error in drag & drop handling: {str(e)}")
            messagebox.showerror("Error", f"Error al actualizar el estado de stock: {str(e)}")

class ProductGUI(DragDropMixin):
    """Main Product Manager GUI."""
    def __init__(self, master: tk.Tk, product_service: ProductService):
        self.master = master
        self.product_service = product_service
        self.logger = logging.getLogger(__name__)
        self.state = UIState()
        self.config = self._load_config()
        self._cell_editor: Optional[tk.Widget] = None
        self._cell_editor_info: Dict[str, Any] = {}
        # Undo/Redo stacks for bulk operations only
        self._undo_stack: List[Dict[str, Any]] = []
        self._redo_stack: List[Dict[str, Any]] = []
        self._undo_max = 20
        
        self.setup_gui()
        self.bind_shortcuts()
        # Configure drag & drop after treeview has been created in setup_treeview()
        self.setup_drag_and_drop(self.tree)

    def _load_config(self) -> UIConfig:
        """Load UI configuration from file."""
        config_path = Path.home() / ".product_manager" / "config.json"
        try:
            if config_path.exists():
                with open(config_path) as f:
                    data = json.load(f)
                    valid_fields = {field.name for field in fields(UIConfig)}
                    filtered_data = {k: v for k, v in data.items() if k in valid_fields}
                    return UIConfig(**filtered_data)
        except Exception as e:
            logger.warning(f"Error loading config: {e}")
        return UIConfig()

    def setup_gui(self) -> None:
        """Set up the main GUI components."""
        self.master.title("Gestor de Productos")
        self.master.geometry(f"{self.config.window_size[0]}x{self.config.window_size[1]}")
        
        self.create_menu()
        self.setup_treeview()
        self.setup_controls()
        self.setup_status_bar()
        
        self.async_operation = AsyncOperation(self.master)
        self.async_operation.start(self.product_service.get_all_products, self.populate_tree)

    def create_menu(self) -> None:
        """Create application menu."""
        menubar = tk.Menu(self.master)
        
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Importar Productos...", command=self.import_products)
        file_menu.add_command(label="Exportar Productos...", command=self.export_products)
        file_menu.add_separator()
        file_menu.add_command(label="Salir", command=self.master.quit)
        menubar.add_cascade(label="Archivo", menu=file_menu)
        
        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Preferencias...", command=self.show_preferences)
        menubar.add_cascade(label="Editar", menu=edit_menu)
        
        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Manual de Usuario", command=self.show_help)
        help_menu.add_command(label="Acerca de", command=self.show_about)
        menubar.add_cascade(label="Ayuda", menu=help_menu)
        
        self.master.config(menu=menubar)

    def setup_treeview(self) -> None:
        """Set up the treeview component."""
        tree_frame = ttk.Frame(self.master)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.columns = {
            "name": {"text": "Nombre", "width": 300},
            "description": {"text": "Descripción", "width": 250},
            "price": {"text": "Precio", "width": 80, "anchor": tk.E},
            "discount": {"text": "Descuento", "width": 80, "anchor": tk.E},
            "stock": {"text": "Stock", "width": 60, "anchor": tk.CENTER},
            "category": {"text": "Categoría", "width": 150},
        }
        
        self.tree = ttk.Treeview(tree_frame, show="headings")
        self.treeview_manager = TreeviewManager(self.tree, self.columns)
        
        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.tree.bind("<<TreeviewSelect>>", self.handle_selection)
        # Faster stock toggle: double-click the Stock column
        self.tree.bind("<Double-1>", self.handle_double_click)

    def setup_controls(self) -> None:
        """Set up control buttons and search."""
        controls_frame = ttk.Frame(self.master)
        controls_frame.pack(fill=tk.X, padx=10, pady=5)
        
        ttk.Button(controls_frame, text="Agregar", command=self.add_product).pack(side=tk.LEFT, padx=5)
        
        self.edit_button = ttk.Button(controls_frame, text="Editar", command=self.edit_product, state=tk.DISABLED)
        self.edit_button.pack(side=tk.LEFT, padx=5)
        
        self.delete_button = ttk.Button(controls_frame, text="Eliminar", command=self.delete_product, state=tk.DISABLED)
        self.delete_button.pack(side=tk.LEFT, padx=5)
        
        search_frame = ttk.Frame(controls_frame)
        search_frame.pack(side=tk.LEFT, padx=20, fill=tk.X, expand=True)
        
        ttk.Label(search_frame, text="Buscar:").pack(side=tk.LEFT, padx=5)
        self.search_var = tk.StringVar()
        self.search_var.trace("w", self.handle_search)
        ttk.Entry(search_frame, textvariable=self.search_var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        ttk.Label(search_frame, text="Categoría:").pack(side=tk.LEFT, padx=5)
        self.category_var = tk.StringVar(value="Todas")
        self.category_combobox = ttk.Combobox(search_frame, textvariable=self.category_var, state="readonly")
        self.category_combobox.pack(side=tk.LEFT, padx=5)
        self.update_categories()
        self.category_combobox.bind("<<ComboboxSelected>>", self.handle_search)

        # Advanced filters
        filters_frame = ttk.Frame(controls_frame)
        filters_frame.pack(side=tk.LEFT, padx=10)

        self.only_discount_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(filters_frame, text="Solo descuento", variable=self.only_discount_var,
                        command=self.refresh_products).pack(side=tk.LEFT, padx=5)

        self.only_out_of_stock_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(filters_frame, text="Solo sin stock", variable=self.only_out_of_stock_var,
                        command=self.refresh_products).pack(side=tk.LEFT, padx=5)

        # Price range filters
        price_frame = ttk.Frame(filters_frame)
        price_frame.pack(side=tk.LEFT, padx=5)
        ttk.Label(price_frame, text="Precio:").pack(side=tk.LEFT)
        self.min_price_var = tk.StringVar()
        self.max_price_var = tk.StringVar()
        min_entry = ttk.Entry(price_frame, width=8, textvariable=self.min_price_var)
        max_entry = ttk.Entry(price_frame, width=8, textvariable=self.max_price_var)
        ttk.Label(price_frame, text="min").pack(side=tk.LEFT, padx=(4, 2))
        min_entry.pack(side=tk.LEFT)
        ttk.Label(price_frame, text="max").pack(side=tk.LEFT, padx=(6, 2))
        max_entry.pack(side=tk.LEFT)

        def _on_price_change(*_):
            self.refresh_products()
        self.min_price_var.trace("w", _on_price_change)
        self.max_price_var.trace("w", _on_price_change)

        # Quick views
        quick_frame = ttk.Frame(controls_frame)
        quick_frame.pack(side=tk.LEFT, padx=10)
        ttk.Label(quick_frame, text="Vista:").pack(side=tk.LEFT)
        self.quick_view_var = tk.StringVar(value="Todos")
        self.quick_view_combobox = ttk.Combobox(quick_frame, textvariable=self.quick_view_var, state="readonly",
                                                values=[
                                                    "Todos",
                                                    "Descuentos activos",
                                                    "Sin stock",
                                                    "En stock",
                                                    "Precio >= 10000",
                                                    "Precio <= 2000"
                                                ], width=18)
        self.quick_view_combobox.pack(side=tk.LEFT, padx=5)
        self.quick_view_combobox.bind("<<ComboboxSelected>>", self.apply_quick_view)

        # Bulk actions for faster workflows
        bulk_frame = ttk.Frame(controls_frame)
        bulk_frame.pack(side=tk.RIGHT)

        ttk.Button(bulk_frame, text="% Desc.", width=8, command=self.bulk_percentage_discount).pack(side=tk.LEFT, padx=3)
        ttk.Button(bulk_frame, text="Desc. fijo", width=10, command=self.bulk_fixed_discount).pack(side=tk.LEFT, padx=3)
        ttk.Button(bulk_frame, text="Stock ON", width=10, command=lambda: self.bulk_set_stock(True)).pack(side=tk.LEFT, padx=3)
        ttk.Button(bulk_frame, text="Stock OFF", width=10, command=lambda: self.bulk_set_stock(False)).pack(side=tk.LEFT, padx=3)
        ttk.Button(bulk_frame, text="Precio +%", width=10, command=lambda: self.bulk_adjust_price(True)).pack(side=tk.LEFT, padx=3)
        ttk.Button(bulk_frame, text="Precio -%", width=10, command=lambda: self.bulk_adjust_price(False)).pack(side=tk.LEFT, padx=3)

        # Undo/Redo controls
        history_frame = ttk.Frame(controls_frame)
        history_frame.pack(side=tk.RIGHT, padx=6)
        self.undo_btn = ttk.Button(history_frame, text="Deshacer", width=10, command=self.undo_last, state=tk.DISABLED)
        self.redo_btn = ttk.Button(history_frame, text="Rehacer", width=10, command=self.redo_last, state=tk.DISABLED)
        self.undo_btn.pack(side=tk.LEFT, padx=3)
        self.redo_btn.pack(side=tk.LEFT, padx=3)

    def setup_status_bar(self) -> None:
        """Set up the status bar with version info."""
        status_frame = ttk.Frame(self.master)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)
        
        self.status_var = tk.StringVar()
        status_label = ttk.Label(status_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_label.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        self.version_var = tk.StringVar()
        version_label = ttk.Label(status_frame, textvariable=self.version_var, relief=tk.SUNKEN, anchor=tk.E, width=50)
        version_label.pack(side=tk.RIGHT, padx=(5, 0))
        
        self.update_version_info()

    def update_version_info(self) -> None:
        """Update version information display."""
        try:
            version_info = self.product_service.get_version_info()
            self.version_var.set(
                f"v{version_info.version} | Actualizado: {version_info.last_updated.strftime('%Y-%m-%d %H:%M')}"
            )
        except Exception as e:
            logger.error(f"Error updating version info: {e}")
            self.version_var.set("Versión: desconocida")
        self.master.after(60000, self.update_version_info)

    def bind_shortcuts(self) -> None:
        """Bind keyboard shortcuts."""
        self.master.bind("<Control-n>", lambda e: self.add_product())
        self.master.bind("<Control-e>", lambda e: self.edit_product())
        self.master.bind("<Delete>", lambda e: self.delete_product())
        self.master.bind("<Control-f>", self.focus_search)

    def add_product(self) -> None:
        """Open dialog to add new product."""
        ProductFormDialog(self.master, "Agregar Producto", self.product_service, on_save=self.refresh_products)

    def edit_product(self) -> None:
        """Open dialog to edit selected product."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Advertencia", "Por favor seleccione un producto para editar.")
            return
        product = self.get_product_by_tree_item(selected[0])
        if product:
            ProductFormDialog(self.master, "Editar Producto", self.product_service, product, on_save=self.refresh_products)

    def delete_product(self) -> None:
        """Delete selected product(s)."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Advertencia", "Por favor seleccione uno o más productos para eliminar.")
            return

        products = [self.get_product_by_tree_item(item) for item in selected if self.get_product_by_tree_item(item) is not None]

        if not products:
            return

        if not messagebox.askyesno("Confirmar Eliminación", f"¿Está seguro de que desea eliminar {len(products)} producto(s)?"):
            return

        try:
            for product in products:
                self.product_service.delete_product(product.name)
            self.refresh_products()
            self.update_status(f"{len(products)} producto(s) eliminado(s)")
        except ProductServiceError as e:
            messagebox.showerror("Error", str(e))

    def refresh_products(self) -> None:
        """Refresh the product list."""
        query = self.search_var.get().lower()
        category = self.category_var.get()

        try:
            products = self.product_service.get_all_products()
            if category != "Todas":
                products = [p for p in products if p.category.lower() == category.lower()]
            if query:
                products = [p for p in products if query in p.name.lower() or query in p.description.lower()]
            # Apply advanced filters
            if hasattr(self, 'only_discount_var') and self.only_discount_var.get():
                products = [p for p in products if (p.discount or 0) > 0]
            if hasattr(self, 'only_out_of_stock_var') and self.only_out_of_stock_var.get():
                products = [p for p in products if not p.stock]

            # Price range
            def _parse_int(val: str):
                try:
                    return int(val)
                except Exception:
                    return None
            min_p = _parse_int(self.min_price_var.get()) if hasattr(self, 'min_price_var') else None
            max_p = _parse_int(self.max_price_var.get()) if hasattr(self, 'max_price_var') else None
            if min_p is not None:
                products = [p for p in products if p.price >= min_p]
            if max_p is not None:
                products = [p for p in products if p.price <= max_p]

            self.populate_tree(products)
            self.update_categories()
            self.update_status(f"Mostrando {len(products)} productos")
        except ProductServiceError as e:
            messagebox.showerror("Error", f"Error al cargar productos: {str(e)}")

    def apply_quick_view(self, *_):
        """Apply quick view presets by adjusting filters and refreshing."""
        view = self.quick_view_var.get()
        # Reset base filters
        if hasattr(self, 'only_discount_var'):
            self.only_discount_var.set(False)
        if hasattr(self, 'only_out_of_stock_var'):
            self.only_out_of_stock_var.set(False)
        if hasattr(self, 'min_price_var'):
            self.min_price_var.set("")
        if hasattr(self, 'max_price_var'):
            self.max_price_var.set("")

        if view == "Descuentos activos":
            self.only_discount_var.set(True)
        elif view == "Sin stock":
            self.only_out_of_stock_var.set(True)
        elif view == "En stock":
            # No explicit flag; leaving both toggles off shows all, but we can emulate by clearing "Solo sin stock"
            pass
        elif view == "Precio >= 10000":
            self.min_price_var.set("10000")
        elif view == "Precio <= 2000":
            self.max_price_var.set("2000")

        self.refresh_products()

    def populate_tree(self, products: List[Product]) -> None:
        """Populate treeview with products."""
        self.tree.delete(*self.tree.get_children())
        for product in products:
            self.tree.insert(
                "",
                "end",
                values=(
                    product.name,
                    product.description,
                    f"{product.price:,}",
                    f"{product.discount:,}" if product.discount else "",
                    "☑" if product.stock else "☐",
                    product.category,
                )
            )
        self.treeview_manager.update_sort_indicators()

    def update_categories(self) -> None:
        """Update category filter choices."""
        try:
            current_category = self.category_var.get()
            categories = ["Todas"] + sorted(self.product_service.get_categories())
            self.category_combobox["values"] = categories
            if current_category != "Todas" and current_category.lower() not in [cat.lower() for cat in categories]:
                self.category_var.set("Todas")
        except ProductServiceError as e:
            messagebox.showerror("Error", f"Error al cargar categorías: {str(e)}")

    def get_product_by_tree_item(self, item: str) -> Optional[Product]:
        """Get Product object from treeview item."""
        values = self.tree.item(item)["values"]
        try:
            return next(p for p in self.product_service.get_all_products() if p.name == values[0])
        except (StopIteration, IndexError):
            return None

    def update_status(self, message: str) -> None:
        """Update status bar message."""
        self.status_var.set(message)
        self.logger.debug(f"Status: {message}")

    def handle_selection(self, event: Optional[tk.Event] = None) -> None:
        """Handle selection in treeview."""
        selected = self.tree.selection()
        if selected:
            self.edit_button.config(state=tk.NORMAL)
            self.delete_button.config(state=tk.NORMAL)
            if len(selected) == 1:
                product = self.get_product_by_tree_item(selected[0])
                if product:
                    self.update_status(f"Seleccionado: {product.name} - Precio: ${product.price:,} - Categoría: {product.category}")
            else:
                self.update_status(f"{len(selected)} productos seleccionados")
        else:
            self.edit_button.config(state=tk.DISABLED)
            self.delete_button.config(state=tk.DISABLED)
            self.update_status("No hay productos seleccionados")

    def handle_search(self, *args) -> None:
        """Handle search and category filter changes."""
        self.refresh_products()

    def focus_search(self, event: Optional[tk.Event] = None) -> None:
        """Focus the search entry."""
        search_entry = self.master.focus_get()
        if isinstance(search_entry, tk.Entry):
            search_entry.select_range(0, tk.END)

    def reorder_products(self, new_index: int) -> None:
        """Reorder products after drag and drop."""
        products = self.product_service.get_all_products()
        item = products.pop(self._drag_data["start_index"])
        products.insert(new_index, item)
        
        try:
            self.product_service.reorder_products(products)
            self.update_status("Productos reordenados exitosamente")
        except Exception as e:
            messagebox.showerror("Error", f"Error al reordenar productos: {str(e)}")
            self.refresh_products()

    def _get_selected_products(self) -> List[Product]:
        selected = self.tree.selection()
        products: List[Product] = []
        for item in selected:
            p = self.get_product_by_tree_item(item)
            if p:
                products.append(p)
        return products

    def _ask_number(self, title: str, prompt: str, min_val: Optional[int] = None, max_val: Optional[int] = None) -> Optional[float]:
        dialog = tk.Toplevel(self.master)
        dialog.title(title)
        dialog.transient(self.master)
        dialog.grab_set()
        ttk.Label(dialog, text=prompt).pack(padx=10, pady=10)
        var = tk.StringVar()
        entry = ttk.Entry(dialog, textvariable=var)
        entry.pack(padx=10, pady=5)
        entry.focus_set()
        result: Dict[str, Optional[float]] = {"value": None}

        def on_ok():
            try:
                val = float(var.get())
                if min_val is not None and val < min_val:
                    raise ValueError
                if max_val is not None and val > max_val:
                    raise ValueError
                result["value"] = val
                dialog.destroy()
            except ValueError:
                messagebox.showerror("Valor inválido", f"Ingrese un número válido{f' entre {min_val} y {max_val}' if max_val is not None else ''}.")

        def on_cancel():
            dialog.destroy()

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)
        ttk.Button(btn_frame, text="Aceptar", command=on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancelar", command=on_cancel).pack(side=tk.LEFT, padx=5)
        dialog.wait_window()
        return result["value"]

    def bulk_percentage_discount(self) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo("Acción masiva", "Seleccione uno o más productos.")
            return
        pct = self._ask_number("Aplicar descuento %", "Porcentaje (0-100):", min_val=0, max_val=100)
        if pct is None:
            return
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_p = Product(
                name=p.name,
                description=p.description,
                price=p.price,
                discount=int(p.price * (pct/100)),
                stock=p.stock,
                category=p.category,
                image_path=p.image_path,
                order=p.order
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(f"Descuento {pct}% a {len(products)} producto(s)", pairs)

    def bulk_fixed_discount(self) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo("Acción masiva", "Seleccione uno o más productos.")
            return
        amount = self._ask_number("Descuento fijo", "Monto a descontar:", min_val=0)
        if amount is None:
            return
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            d = min(int(amount), p.price-1) if p.price>0 else 0
            new_p = Product(
                name=p.name,
                description=p.description,
                price=p.price,
                discount=d,
                stock=p.stock,
                category=p.category,
                image_path=p.image_path,
                order=p.order
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(f"Descuento fijo ${int(amount):,} a {len(products)} producto(s)", pairs)

    def bulk_set_stock(self, value: bool) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo("Acción masiva", "Seleccione uno o más productos.")
            return
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_p = Product(
                name=p.name,
                description=p.description,
                price=p.price,
                discount=p.discount,
                stock=value,
                category=p.category,
                image_path=p.image_path,
                order=p.order
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(f"Stock {'ON' if value else 'OFF'} para {len(products)} producto(s)", pairs)

    def bulk_adjust_price(self, increase: bool) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo("Acción masiva", "Seleccione uno o más productos.")
            return
        pct = self._ask_number("Ajustar precio %", "Porcentaje (0-100):", min_val=0, max_val=100)
        if pct is None:
            return
        factor = 1 + (pct/100) if increase else 1 - (pct/100)
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_price = max(1, int(round(p.price * factor)))
            new_discount = min(p.discount, new_price-1) if new_price>0 else 0
            new_p = Product(
                name=p.name,
                description=p.description,
                price=new_price,
                discount=new_discount,
                stock=p.stock,
                category=p.category,
                image_path=p.image_path,
                order=p.order
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(f"Precio {'+' if increase else '-'}{pct}% a {len(products)} producto(s)", pairs)

    def _preview_and_apply_operation(self, description: str, pairs: List[tuple[Product, Product]]) -> None:
        """Show a preview for bulk updates and apply with undo support if confirmed."""
        if not pairs:
            return
        # Build summary
        lines = []
        changed_count = 0
        for old, new in pairs:
            changes = []
            if old.price != new.price:
                changes.append(f"Precio: {old.price:,} → {new.price:,}")
            if old.discount != new.discount:
                changes.append(f"Desc.: {old.discount:,} → {new.discount:,}")
            if old.stock != new.stock:
                changes.append(f"Stock: {'☑' if old.stock else '☐'} → {'☑' if new.stock else '☐'}")
            if changes:
                changed_count += 1
                lines.append(f"• {old.name} — " + "; ".join(changes))
        preview_text = f"{description}\n\nCambios: {changed_count} de {len(pairs)} productos\n\n" + "\n".join(lines[:50])

        if not self._show_preview_dialog(preview_text):
            return

        # Build do/undo updates
        do_updates: List[tuple[str, Product]] = [(old.name, new) for old, new in pairs]
        undo_updates: List[tuple[str, Product]] = [(new.name, old) for old, new in pairs]
        try:
            self.product_service.batch_update(do_updates)
            # Push to undo history
            op = {"description": description, "do": do_updates, "undo": undo_updates}
            self._undo_stack.append(op)
            if len(self._undo_stack) > self._undo_max:
                self._undo_stack.pop(0)
            self._redo_stack.clear()
            self._update_history_buttons()
            self.refresh_products()
            self.update_status(f"{description} — aplicado")
        except ProductServiceError as e:
            messagebox.showerror("Error", str(e))

    def _show_preview_dialog(self, content: str) -> bool:
        dialog = tk.Toplevel(self.master)
        dialog.title("Previsualización de cambios")
        dialog.transient(self.master)
        dialog.grab_set()
        dialog.geometry("720x520")

        txt = tk.Text(dialog, wrap=tk.WORD)
        txt.insert("1.0", content)
        txt.configure(state=tk.DISABLED)
        txt.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)
        result = {"ok": False}

        def on_ok():
            result["ok"] = True
            dialog.destroy()

        def on_cancel():
            dialog.destroy()

        ttk.Button(btn_frame, text="Confirmar", command=on_ok).pack(side=tk.LEFT, padx=6)
        ttk.Button(btn_frame, text="Cancelar", command=on_cancel).pack(side=tk.LEFT, padx=6)
        dialog.wait_window()
        return result["ok"]

    def _update_history_buttons(self) -> None:
        if hasattr(self, 'undo_btn'):
            self.undo_btn.config(state=tk.NORMAL if len(self._undo_stack) > 0 else tk.DISABLED)
        if hasattr(self, 'redo_btn'):
            self.redo_btn.config(state=tk.NORMAL if len(self._redo_stack) > 0 else tk.DISABLED)

    def undo_last(self) -> None:
        if not self._undo_stack:
            return
        op = self._undo_stack.pop()
        try:
            self.product_service.batch_update(op["undo"])
            # Prepare for redo
            self._redo_stack.append(op)
            self._update_history_buttons()
            self.refresh_products()
            self.update_status(f"Deshecho: {op['description']}")
        except ProductServiceError as e:
            messagebox.showerror("Error", f"No se pudo deshacer: {str(e)}")

    def redo_last(self) -> None:
        if not self._redo_stack:
            return
        op = self._redo_stack.pop()
        try:
            self.product_service.batch_update(op["do"])
            # Return to undo stack
            self._undo_stack.append(op)
            self._update_history_buttons()
            self.refresh_products()
            self.update_status(f"Rehecho: {op['description']}")
        except ProductServiceError as e:
            messagebox.showerror("Error", f"No se pudo rehacer: {str(e)}")

    def handle_double_click(self, event: tk.Event) -> None:
        # On double-click: inline edit for price/discount, toggle stock on stock column,
        # otherwise open edit dialog for that product
        region = self.tree.identify("region", event.x, event.y)
        col = self.tree.identify_column(event.x)
        row = self.tree.identify_row(event.y)
        if region != "cell" or not row:
            return

        # Map column index to column key
        try:
            col_index = int(col[1:]) - 1
            col_key = self.tree["columns"][col_index]
        except Exception:
            col_key = None

        if col_key == "stock":
            # Toggle stock state
            product = self.get_product_by_tree_item(row)
            if not product:
                return
            try:
                updated = Product(
                    name=product.name,
                    description=product.description,
                    price=product.price,
                    discount=product.discount,
                    stock=not product.stock,
                    category=product.category,
                    image_path=product.image_path,
                    order=product.order
                )
                self.product_service.update_product(product.name, updated)
                self.tree.set(row, "stock", "☑" if updated.stock else "☐")
                self.update_status(f"Stock de '{product.name}' actualizado: {'En stock' if updated.stock else 'Sin stock'}")
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo actualizar el stock: {str(e)}")
        elif col_key in ("price", "discount"):
            # Start inline editor for numeric fields
            self._begin_inline_edit(row, col, col_key)
        else:
            # Open edit dialog for the double-clicked row
            try:
                self.tree.selection_set(row)
                self.tree.focus(row)
                self.edit_product()
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo abrir el editor: {str(e)}")

    def _begin_inline_edit(self, item: str, col_id: str, field: str) -> None:
        # Close any existing editor
        self._end_inline_edit()

        # Get cell bbox
        try:
            x, y, w, h = self.tree.bbox(item, col_id)
        except Exception:
            return

        product = self.get_product_by_tree_item(item)
        if not product:
            return

        # Determine initial value (raw integer)
        initial_value = str(getattr(product, field) or 0)

        # Create entry editor
        entry = ttk.Entry(self.tree)
        entry.insert(0, initial_value)
        entry.select_range(0, tk.END)
        entry.focus_set()
        entry.place(x=x, y=y, width=w, height=h)

        self._cell_editor = entry
        self._cell_editor_info = {"item": item, "col_id": col_id, "field": field, "original": product}

        def commit(_evt=None):
            self._commit_inline_edit()

        def cancel(_evt=None):
            self._end_inline_edit()

        entry.bind("<Return>", commit)
        entry.bind("<FocusOut>", commit)
        entry.bind("<Escape>", cancel)

    def _commit_inline_edit(self) -> None:
        if not self._cell_editor:
            return
        try:
            value_str = self._cell_editor.get().strip()
            info = self._cell_editor_info
            item = info.get("item")
            field = info.get("field")
            product = self.get_product_by_tree_item(item)
            if not product:
                self._end_inline_edit()
                return

            # Parse integer
            try:
                new_val = int(value_str)
            except ValueError:
                messagebox.showerror("Valor inválido", "Ingrese un número entero válido.")
                self._cell_editor.focus_set()
                return

            if field == "price" and new_val <= 0:
                messagebox.showerror("Valor inválido", "El precio debe ser mayor que cero.")
                self._cell_editor.focus_set()
                return
            if field == "discount" and new_val < 0:
                messagebox.showerror("Valor inválido", "El descuento no puede ser negativo.")
                self._cell_editor.focus_set()
                return

            # Build updated product with validated values
            updated_kwargs = dict(
                name=product.name,
                description=product.description,
                price=product.price,
                discount=product.discount,
                stock=product.stock,
                category=product.category,
                image_path=product.image_path,
                order=product.order,
            )
            updated_kwargs[field] = new_val

            # Validate discount < price
            if updated_kwargs["discount"] >= updated_kwargs["price"]:
                messagebox.showerror("Valor inválido", "El descuento no puede ser mayor o igual al precio.")
                self._cell_editor.focus_set()
                return

            updated = Product(**updated_kwargs)

            # Persist change
            self.product_service.update_product(product.name, updated)

            # Update tree cell display (formatted)
            if field == "price":
                self.tree.set(item, "price", f"{updated.price:,}")
            elif field == "discount":
                self.tree.set(item, "discount", f"{updated.discount:,}" if updated.discount else "")

            self.update_status(f"{field.capitalize()} de '{product.name}' actualizado.")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo guardar el cambio: {str(e)}")
        finally:
            self._end_inline_edit()

    def _end_inline_edit(self) -> None:
        if self._cell_editor:
            try:
                self._cell_editor.place_forget()
                self._cell_editor.destroy()
            except Exception:
                pass
        self._cell_editor = None
        self._cell_editor_info = {}

    def import_products(self) -> None:
        """Import products from JSON file."""
        file_path = filedialog.askopenfilename(filetypes=[("Archivos JSON", "*.json")])
        if not file_path:
            return

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            products = [Product.from_dict(item) for item in data]
            for product in products:
                self.product_service.add_product(product)
            self.refresh_products()
            self.update_status(f"Se importaron {len(products)} productos")
        except Exception as e:
            messagebox.showerror("Error de Importación", str(e))

    def export_products(self) -> None:
        """Export products to JSON file."""
        file_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("Archivos JSON", "*.json")])
        if not file_path:
            return

        try:
            products = self.product_service.get_all_products()
            data = [p.to_dict() for p in products]
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.update_status(f"Se exportaron {len(products)} productos")
        except Exception as e:
            messagebox.showerror("Error de Exportación", str(e))

    def show_preferences(self) -> None:
        """Show preferences dialog."""
        def on_preferences_saved():
            self.config = self._load_config()
        PreferencesDialog(self.master, self.config, on_save=on_preferences_saved)

    def show_help(self) -> None:
        """Show help dialog."""
        HelpDialog(self.master)

    def show_about(self) -> None:
        """Show about dialog."""
        AboutDialog(self.master)

class ProductFormDialog(tk.Toplevel):
    """Dialog for adding/editing products."""
    def __init__(self, parent: tk.Tk, title: str, product_service: ProductService, product: Optional[Product] = None, on_save: Optional[Callable[[], None]] = None):
        super().__init__(parent)
        self.title(title)
        self.product_service = product_service
        self.product = product
        self.on_save = on_save

        temp_entry = ttk.Entry(self)
        self.default_font = temp_entry.cget('font')
        temp_entry.destroy()
        
        self.setup_dialog()
        self.populate_fields()

    def setup_dialog(self) -> None:
        """Set up dialog window."""
        # Make the dialog large enough and resizable so all content fits
        self.geometry("760x620")
        self.minsize(700, 520)
        self.resizable(True, True)
        self.transient(self.master)
        self.grab_set()
        self.main_frame = ttk.Frame(self, padding="10")
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        # Let the input column expand when the window grows
        try:
            self.main_frame.columnconfigure(1, weight=1)
        except Exception:
            pass
        self.create_widgets()
        self.create_buttons()

    def create_widgets(self) -> None:
        """Create form widgets."""
        self.entries: Dict[str, tk.Widget] = {}
        fields = [
            ("name", "Nombre:", ttk.Entry, {"width": 40}),
            ("description", "Descripción:", tk.Text, {"width": 40, "height": 3}),
            ("price", "Precio:", ttk.Entry, {"width": 40}),
            ("discount", "Descuento:", ttk.Entry, {"width": 40}),
            ("stock", "En Stock:", tk.Checkbutton, {}),
            ("category", "Categoría:", ttk.Combobox, {"width": 39}),
            ("image_path", "Ruta de Imagen:", ttk.Entry, {"width": 40}),
        ]
        for i, (field, label, widget_class, widget_opts) in enumerate(fields):
            label_widget = ttk.Label(self.main_frame, text=label)
            label_widget.grid(row=i, column=0, sticky=tk.W, padx=(0, 10), pady=5)
            if widget_class == tk.Checkbutton:
                var = tk.BooleanVar(value=True)
                widget = widget_class(self.main_frame, variable=var)
                self.entries[field] = var
                widget.grid(row=i, column=1, sticky=tk.W, pady=5)
            elif widget_class == ttk.Combobox:
                widget = widget_class(self.main_frame, values=sorted(self.product_service.get_categories()), **widget_opts)
                self.entries[field] = widget
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
            elif widget_class == tk.Text:
                widget = widget_class(self.main_frame, font=self.default_font, **widget_opts)
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
                widget.bind("<Tab>", self._focus_next)  # Agrega este binding
                self.entries[field] = widget
            else:
                widget = widget_class(self.main_frame, **widget_opts)
                self.entries[field] = widget
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
            if field == "image_path":
                ttk.Button(self.main_frame, text="Explorar...", command=self.browse_image, width=10).grid(row=i, column=2, padx=(5, 0), pady=5)
                # Update preview when typing a path
                widget.bind("<KeyRelease>", lambda _e: self._update_image_preview())

        # Image processing options
        options_row = len(fields)
        self.convert_webp_var = tk.BooleanVar(value=False)
        self.resize_opt_var = tk.BooleanVar(value=True)
        opts_frame = ttk.Frame(self.main_frame)
        opts_frame.grid(row=options_row, column=0, columnspan=3, sticky=tk.W, pady=(0, 6))
        ttk.Checkbutton(opts_frame, text="Convertir a WebP", variable=self.convert_webp_var,
                        state=(tk.NORMAL if PIL_AVAILABLE else tk.DISABLED)).pack(side=tk.LEFT, padx=(0, 10))
        ttk.Checkbutton(opts_frame, text="Optimizar tamaño (máx 1000px)", variable=self.resize_opt_var,
                        state=(tk.NORMAL if PIL_AVAILABLE else tk.DISABLED)).pack(side=tk.LEFT)

        # Preview area (fixed-size canvas to avoid stretching on resize)
        self.preview_label = ttk.Label(self.main_frame, text="Vista previa")
        self.preview_label.grid(row=options_row+1, column=0, sticky=tk.W)
        self._preview_w, self._preview_h = 260, 195
        self.preview_canvas = tk.Canvas(
            self.main_frame,
            width=self._preview_w,
            height=self._preview_h,
            bg="#fafafa",
            highlightthickness=1,
            relief=tk.SOLID,
            bd=1,
        )
        self.preview_canvas.grid(row=options_row+1, column=1, sticky=tk.W, pady=4)
        # Quick-open image in OS viewer
        open_btn = ttk.Button(self.main_frame, text="Abrir imagen…", command=self._open_image_file)
        open_btn.grid(row=options_row+1, column=2, sticky=tk.W)
        self._preview_photo = None
        self._update_image_preview()

    def _focus_next(self, event):
        """Transfiere el foco al siguiente widget y evita la inserción de un tabulador."""
        event.widget.tk_focusNext().focus()
        return "break"


    def create_buttons(self) -> None:
        """Create dialog buttons."""
        button_frame = ttk.Frame(self)
        button_frame.pack(side=tk.BOTTOM, pady=(0, 10))
        ttk.Button(button_frame, text="Guardar", command=self.save_product, width=10).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancelar", command=self.destroy, width=10).pack(side=tk.LEFT, padx=5)

    def populate_fields(self) -> None:
        """Populate form fields with product data."""
        if not self.product:
            return
        for field, widget in self.entries.items():
            value = getattr(self.product, field)
            if isinstance(widget, tk.BooleanVar):
                widget.set(value)
            elif isinstance(widget, tk.Text):
                widget.delete("1.0", tk.END)
                widget.insert("1.0", str(value))
            elif isinstance(widget, ttk.Combobox):
                widget.set(value)
            else:
                widget.delete(0, tk.END)
                widget.insert(0, str(value))
        # Ensure image preview syncs with populated image_path
        try:
            self._update_image_preview()
        except Exception:
            pass

    def browse_image(self) -> None:
        """Open file dialog to select image."""
        file_path = filedialog.askopenfilename(filetypes=[("Archivos de imagen", "*.png *.jpg *.jpeg *.gif *.webp")])
        if not file_path:
            return
        try:
            abs_base_dir = self._assets_images_root()
            # Use category to choose destination subfolder
            cat_widget = self.entries.get("category")
            category = cat_widget.get() if isinstance(cat_widget, ttk.Combobox) else ""
            subdir = self._category_subdir(str(category))
            dest_dir = os.path.join(abs_base_dir, subdir)
            os.makedirs(dest_dir, exist_ok=True)

            filename = os.path.basename(file_path)
            name_no_ext, ext = os.path.splitext(filename)

            # Optional image optimization
            if PIL_AVAILABLE and (self.convert_webp_var.get() or self.resize_opt_var.get()):
                target_ext = '.webp' if self.convert_webp_var.get() else ext
                dest_path = os.path.join(dest_dir, f"{name_no_ext}{target_ext}")
                try:
                    img = Image.open(file_path)
                    if self.resize_opt_var.get():
                        img.thumbnail((1000, 1000))
                    save_params = {}
                    if target_ext.lower() == '.webp':
                        save_params = {"format": "WEBP", "quality": 85}
                    img.save(dest_path, **save_params)
                except Exception:
                    dest_path = os.path.join(dest_dir, filename)
                    shutil.copy2(file_path, dest_path)
            else:
                dest_path = os.path.join(dest_dir, filename)
                if os.path.abspath(file_path) != os.path.abspath(dest_path):
                    shutil.copy2(file_path, dest_path)

            rel_path = os.path.relpath(dest_path, abs_base_dir).replace('\\', '/')
            rel_path = 'assets/images/' + rel_path
            self.entries["image_path"].delete(0, tk.END)
            self.entries["image_path"].insert(0, rel_path)
            self._update_image_preview()
        except Exception as e:
            messagebox.showerror("Error", f"Error al copiar la imagen: {str(e)}")

    def save_product(self) -> None:
        """Save product data."""
        try:
            data = self.validate_and_get_data()
            product = Product(**data)
            if self.product:
                self.product_service.update_product(self.product.name, product)
            else:
                self.product_service.add_product(product)
            if self.on_save:
                self.on_save()
            self.destroy()
        except (ValueError, ProductServiceError) as e:
            messagebox.showerror("Error", str(e))

    def validate_and_get_data(self) -> Dict[str, Any]:
        """Validate and collect form data."""
        data = {}
        for field, widget in self.entries.items():
            if isinstance(widget, tk.BooleanVar):
                data[field] = widget.get()
            elif isinstance(widget, tk.Text):
                data[field] = widget.get("1.0", tk.END).strip()
            else:
                data[field] = widget.get().strip()
        if not data["name"]:
            raise ValueError("El nombre es obligatorio")
        try:
            data["price"] = int(data["price"])
            if data["price"] <= 0:
                raise ValueError("El precio debe ser mayor que cero")
        except ValueError:
            raise ValueError("El precio debe ser un número válido mayor que cero")
        try:
            data["discount"] = int(data["discount"] or "0")
            if data["discount"] < 0:
                raise ValueError("El descuento no puede ser negativo")
            if data["discount"] >= data["price"]:
                raise ValueError("El descuento no puede ser mayor que el precio")
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError("El descuento debe ser un número válido")
            raise
        if data["image_path"]:
            if not data["image_path"].startswith("assets/images/"):
                raise ValueError("La ruta de la imagen debe comenzar con 'assets/images/'")
        return data

    # Helpers for image paths and preview
    def _assets_images_root(self) -> str:
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        return os.path.join(project_root, 'assets', 'images')

    def _category_subdir(self, category: str) -> str:
        mapping = {
            'Limpiezayaseo': 'limpieza_y_aseo',
            'Despensa': 'despensa',
            'Lacteos': 'lacteos',
            'Cervezas': 'cervezas',
            'Vinos': 'vinos',
            'Espumantes': 'espumantes',
            'Piscos': 'piscos',
            'Aguas': 'bebidas',
            'Bebidas': 'bebidas',
            'Jugos': 'jugos',
            'Mascotas': 'mascotas',
            'Llaveros': 'llaveros',
            'Chocolates': 'chocolates',
            'SnacksDulces': 'snacks_dulces',
            'SnacksSalados': 'snacks_salados',
            'Energeticaseisotonicas': 'energeticaseisotonicas',
            'Carnesyembutidos': 'carnes_y_embutidos',
            'Juegos': 'juegos',
            'Software': 'software',
        }
        return mapping.get(category, category.strip().lower().replace(' ', '_'))

    def _update_image_preview(self) -> None:
        try:
            entry = self.entries.get('image_path')
            if not isinstance(entry, ttk.Entry):
                return
            rel_path = entry.get().strip()
            cv = self.preview_canvas
            w, h = getattr(self, '_preview_w', 260), getattr(self, '_preview_h', 195)
            cv.delete("all")
            cv.create_rectangle(0, 0, w, h, fill="#fafafa", outline="#cccccc")
            if not rel_path:
                cv.create_text(w//2, h//2, text='Sin imagen', fill='#666666')
                self._preview_photo = None
                return
            abs_base_dir = self._assets_images_root()
            abs_path = os.path.join(abs_base_dir, rel_path.replace('assets/images/', '').replace('/', os.sep))
            if os.path.exists(abs_path) and PIL_AVAILABLE:
                _, ext = os.path.splitext(abs_path)
                ext = ext.lower()
                if ext == '.webp' and not PIL_WEBP:
                    cv.create_text(w//2, h//2, text='Pillow sin soporte WebP', fill='#666666')
                    self._preview_photo = None
                else:
                    try:
                        img = Image.open(abs_path)
                        img.thumbnail((w-10, h-10))
                        self._preview_photo = ImageTk.PhotoImage(img)
                        cv.create_image(w//2, h//2, image=self._preview_photo, anchor='center')
                    except Exception:
                        cv.create_text(w//2, h//2, text='(Vista previa no disponible)', fill='#666666')
                        self._preview_photo = None
            else:
                if not PIL_AVAILABLE:
                    cv.create_text(w//2, h//2, text='Instale Pillow para vista previa', fill='#666666')
                else:
                    cv.create_text(w//2, h//2, text='(Vista previa no disponible)', fill='#666666')
                self._preview_photo = None
        except Exception:
            cv = self.preview_canvas
            w, h = getattr(self, '_preview_w', 260), getattr(self, '_preview_h', 195)
            cv.delete("all")
            cv.create_rectangle(0, 0, w, h, fill="#fafafa", outline="#cccccc")
            cv.create_text(w//2, h//2, text='(Vista previa no disponible)', fill='#666666')
            self._preview_photo = None

    def _open_image_file(self) -> None:
        try:
            entry = self.entries.get('image_path')
            if not isinstance(entry, ttk.Entry):
                return
            rel_path = entry.get().strip()
            if not rel_path:
                return
            abs_base_dir = self._assets_images_root()
            abs_path = os.path.join(abs_base_dir, rel_path.replace('assets/images/', '').replace('/', os.sep))
            if not os.path.exists(abs_path):
                messagebox.showerror('Imagen', 'El archivo de imagen no existe en disco.')
                return
            if os.name == 'nt':
                os.startfile(abs_path)  # type: ignore[attr-defined]
            elif sys.platform == 'darwin':
                import subprocess
                subprocess.Popen(['open', abs_path])
            else:
                import subprocess
                subprocess.Popen(['xdg-open', abs_path])
        except Exception as e:
            messagebox.showerror('Imagen', f'No se pudo abrir la imagen: {e}')

class PreferencesDialog(tk.Toplevel):
    """Dialog for application preferences."""
    def __init__(self, parent: tk.Tk, config: UIConfig, on_save: Optional[Callable] = None):
        super().__init__(parent)
        self.title("Preferencias")
        self.config = config
        self.on_save = on_save
        self.setup_dialog()

    def setup_dialog(self) -> None:
        """Set up the preferences dialog."""
        self.geometry("400x300")
        self.resizable(False, False)
        self.transient(self.master)
        self.grab_set()
        ttk.Label(self, text="Tamaño de Fuente:").grid(row=1, column=0, padx=10, pady=5, sticky=tk.W)
        self.font_var = tk.IntVar(value=self.config.font_size)
        font_spin = ttk.Spinbox(self, from_=8, to=16, textvariable=self.font_var, width=5)
        font_spin.grid(row=1, column=1, padx=10, pady=5, sticky=tk.W)
        ttk.Label(self, text="Habilitar Animaciones:").grid(row=2, column=0, padx=10, pady=5, sticky=tk.W)
        self.anim_var = tk.BooleanVar(value=self.config.enable_animations)
        ttk.Checkbutton(self, variable=self.anim_var).grid(row=2, column=1, padx=10, pady=5, sticky=tk.W)
        button_frame = ttk.Frame(self)
        button_frame.grid(row=3, column=0, columnspan=2, pady=20)
        ttk.Button(button_frame, text="Guardar", command=self.save_preferences).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancelar", command=self.destroy).pack(side=tk.LEFT, padx=5)

    def save_preferences(self) -> None:
        """Save preferences to configuration."""
        try:
            self.config.font_size = self.font_var.get()
            self.config.enable_animations = self.anim_var.get()
            config_path = Path.home() / ".product_manager" / "config.json"
            config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(config_path, 'w') as f:
                json.dump({
                    "font_size": self.config.font_size,
                    "enable_animations": self.config.enable_animations,
                    "window_size": self.config.window_size,
                    "locale": self.config.locale
                }, f, indent=2)
            if self.on_save:
                self.on_save()
            self.destroy()
            messagebox.showinfo("Éxito", "Preferencias guardadas y aplicadas.")
        except Exception as e:
            messagebox.showerror("Error", f"Error al guardar preferencias: {str(e)}")

class HelpDialog(tk.Toplevel):
    """Dialog for application help."""
    def __init__(self, parent: tk.Tk):
        super().__init__(parent)
        self.title("Ayuda")
        self.setup_dialog()

    def setup_dialog(self) -> None:
        """Set up the help dialog."""
        self.geometry("600x400")
        self.resizable(True, True)
        help_text = tk.Text(self, wrap=tk.WORD, padx=10, pady=10)
        help_text.pack(fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(help_text, orient="vertical", command=help_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        help_text.configure(yscrollcommand=scrollbar.set)
        help_content = """
Gestor de Productos - Ayuda

Atajos de Teclado:
• Ctrl+N: Agregar nuevo producto
• Ctrl+E: Editar producto seleccionado
• Supr: Eliminar producto(s) seleccionado(s)
• Ctrl+F: Enfocar búsqueda

Características:
• Agregar, editar y eliminar productos
• Ordenar por cualquier columna
• Buscar productos por nombre o descripción
• Filtrar por categoría
• Arrastrar y soltar para reordenar productos
• Importar/Exportar productos
• Personalizar preferencias

Para más información, consulte el manual de usuario o contacte con soporte.
        """
        help_text.insert("1.0", help_content)
        help_text.configure(state="disabled")

class AboutDialog(tk.Toplevel):
    """Dialog for application information."""
    def __init__(self, parent: tk.Tk):
        super().__init__(parent)
        self.title("Acerca de Gestor de Productos")
        self.setup_dialog()

    def setup_dialog(self) -> None:
        """Set up the about dialog."""
        self.geometry("400x300")
        self.resizable(False, False)
        about_text = """
            Gestor de Productos
            Versión 2.0.0

            Una solución potente para la gestión 
            de productos de su negocio.

            Características:
            • Gestión intuitiva de productos
            • Organización por categorías
            • Capacidades de búsqueda y filtrado
            • Funcionalidad de Importación/Exportación
            • Interfaz personalizable

            © 2024 El Rincón de Ébano
            Todos los derechos reservados.
        """
        label = ttk.Label(self, text=about_text, justify=tk.CENTER, padding=20)
        label.pack(expand=True)
        ttk.Button(self, text="Cerrar", command=self.destroy).pack(pady=10)

if __name__ == "__main__":
    root = tk.Tk()
    # Para propósitos de prueba, se requiere pasar una instancia de ProductService.
    # Aquí se omite su creación ya que la aplicación se lanza desde el módulo principal.
    app = ProductGUI(root, None)
    root.mainloop()
