import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from typing import List, Optional, Callable, Dict, Any, TypeVar, Protocol
import os
from pathlib import Path
from models import Product
from services import ProductService, ProductNotFoundError, ProductServiceError
import logging
from functools import partial
import shutil
import threading
from queue import Queue
import json
from dataclasses import dataclass, fields

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Type variables for generic types
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
            except Queue.Empty:
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
        ttk.Progressbar(
            dialog, 
            variable=self.progress_var,
            maximum=100
        ).pack(pady=10, padx=20, fill=tk.X)
        
        return dialog

class TreeviewManager:
    """Manages Treeview widget operations."""
    
    def __init__(self, tree: ttk.Treeview, columns: Dict[str, Dict[str, Any]]):
        self.tree = tree
        self.columns = columns
        self.setup_columns()
        self.sort_order: Dict[str, bool] = {}

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
        # Reset other columns' sort order
        for column in self.tree["columns"]:
            if column != col and column in self.sort_order:
                del self.sort_order[column]

        # Toggle sort order for current column
        self.sort_order[col] = not self.sort_order.get(col, False)
        reverse = self.sort_order[col]

        # Get items to sort
        items = [(self.tree.set(k, col), k) for k in self.tree.get_children("")]

        # Sort based on column type
        if col in ("price", "discount"):
            items.sort(key=lambda x: self._parse_number(x[0]), reverse=reverse)
        elif col == "stock":
            items.sort(key=lambda x: x[0] == "☑", reverse=reverse)
        else:
            items.sort(key=lambda x: x[0].lower(), reverse=reverse)

        # Rearrange items
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

class ProductGUI:
    """Main Product Manager GUI."""

    def __init__(self, master: tk.Tk, product_service: ProductService):
        self.master = master
        self.product_service = product_service
        self.state = UIState()
        self.config = self._load_config()
        
        self.setup_gui()
        self.bind_shortcuts()
        self.setup_drag_and_drop()

    def _load_config(self) -> UIConfig:
        """Load UI configuration from file."""
        config_path = Path.home() / ".product_manager" / "config.json"
        try:
            if config_path.exists():
                with open(config_path) as f:
                    data = json.load(f)
                    # Filter out unexpected arguments
                    valid_fields = {
                        field.name for field in fields(UIConfig)
                    }
                    filtered_data = {
                        k: v for k, v in data.items() 
                        if k in valid_fields
                    }
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
        
        # Initial data load
        self.async_operation = AsyncOperation(self.master)
        self.async_operation.start(
            self.product_service.get_all_products,
            self.populate_tree
        )

    def create_menu(self) -> None:
        """Create application menu."""
        menubar = tk.Menu(self.master)
        
        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Importar Productos...", command=self.import_products)
        file_menu.add_command(label="Exportar Productos...", command=self.export_products)
        file_menu.add_separator()
        file_menu.add_command(label="Salir", command=self.master.quit)
        menubar.add_cascade(label="Archivo", menu=file_menu)
        
        # Edit menu
        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Preferencias...", command=self.show_preferences)
        menubar.add_cascade(label="Editar", menu=edit_menu)
        
        # Help menu
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

        # Scrollbar
        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Bindings
        self.tree.bind("<<TreeviewSelect>>", self.handle_selection)

    def setup_controls(self) -> None:
        """Set up control buttons and search."""
        controls_frame = ttk.Frame(self.master)
        controls_frame.pack(fill=tk.X, padx=10, pady=5)

        # Buttons
        ttk.Button(
            controls_frame,
            text="Agregar",
            command=self.add_product
        ).pack(side=tk.LEFT, padx=5)

        self.edit_button = ttk.Button(
            controls_frame,
            text="Editar",
            command=self.edit_product,
            state=tk.DISABLED
        )
        self.edit_button.pack(side=tk.LEFT, padx=5)

        self.delete_button = ttk.Button(
            controls_frame,
            text="Eliminar",
            command=self.delete_product,
            state=tk.DISABLED
        )
        self.delete_button.pack(side=tk.LEFT, padx=5)

        # Search
        search_frame = ttk.Frame(controls_frame)
        search_frame.pack(side=tk.LEFT, padx=20, fill=tk.X, expand=True)

        ttk.Label(search_frame, text="Buscar:").pack(side=tk.LEFT, padx=5)
        self.search_var = tk.StringVar()
        self.search_var.trace("w", self.handle_search)
        ttk.Entry(
            search_frame,
            textvariable=self.search_var
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

        # Category filter
        ttk.Label(search_frame, text="Categoría:").pack(side=tk.LEFT, padx=5)
        self.category_var = tk.StringVar(value="Todas")
        self.category_combobox = ttk.Combobox(
            search_frame,
            textvariable=self.category_var,
            state="readonly"
        )
        self.category_combobox.pack(side=tk.LEFT, padx=5)
        self.update_categories()
        self.category_combobox.bind("<<ComboboxSelected>>", self.handle_search)

    def setup_status_bar(self) -> None:
        """Set up the status bar with version info."""
        status_frame = ttk.Frame(self.master)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)

        # Left side - main status
        self.status_var = tk.StringVar()
        status_label = ttk.Label(
            status_frame,
            textvariable=self.status_var,
            relief=tk.SUNKEN,
            anchor=tk.W
        )
        status_label.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Right side - version info
        self.version_var = tk.StringVar()
        version_label = ttk.Label(
            status_frame,
            textvariable=self.version_var,
            relief=tk.SUNKEN,
            anchor=tk.E,
            width=50
        )
        version_label.pack(side=tk.RIGHT, padx=(5, 0))
        
        # Update version info periodically
        self.update_version_info()

    def update_version_info(self) -> None:
        """Update version information display."""
        try:
            version_info = self.product_service.get_version_info()
            self.version_var.set(
                f"v{version_info.version} | "
                f"Actualizado: {version_info.last_updated.strftime('%Y-%m-%d %H:%M')}"
            )
        except Exception as e:
            logger.error(f"Error updating version info: {e}")
            self.version_var.set("Versión: desconocida")
        
        # Schedule next update
        self.master.after(60000, self.update_version_info)  # Update every minute

    def bind_shortcuts(self) -> None:
        """Bind keyboard shortcuts."""
        self.master.bind("<Control-n>", lambda e: self.add_product())
        self.master.bind("<Control-e>", lambda e: self.edit_product())
        self.master.bind("<Delete>", lambda e: self.delete_product())
        self.master.bind("<Control-f>", self.focus_search)

    def setup_drag_and_drop(self) -> None:
        """Set up drag and drop functionality."""
        self.tree.bind("<ButtonPress-1>", self.start_drag)
        self.tree.bind("<B1-Motion>", self.handle_drag)
        self.tree.bind("<ButtonRelease-1>", self.end_drag)
        self._drag_data = {"item": None, "start_index": -1}

    def start_drag(self, event: tk.Event) -> None:
        """Handle start of drag operation."""
        item = self.tree.identify_row(event.y)
        if item:
            self._drag_data["item"] = item
            self._drag_data["start_index"] = self.tree.index(item)

    def handle_drag(self, event: tk.Event) -> None:
        """Handle drag motion."""
        item = self._drag_data.get("item")
        if item:
            moved_to = self.tree.index(self.tree.identify_row(event.y))
            if moved_to != self.tree.index(item):
                self.tree.move(item, '', moved_to)

    def end_drag(self, event: tk.Event) -> None:
        """Handle end of drag operation and stock toggle."""
        try:
            # Handle drag end
            item = self._drag_data.get("item")
            if item:
                end_index = self.tree.index(self.tree.identify_row(event.y))
                if end_index != self._drag_data["start_index"]:
                    self.reorder_products(end_index)
                self._drag_data = {"item": None, "start_index": -1}

            # Handle stock toggle
            region = self.tree.identify("region", event.x, event.y)
            column = self.tree.identify_column(event.x)
            clicked_item = self.tree.identify_row(event.y)

            if region == "cell" and column == "#5" and clicked_item:
                product = self.get_product_by_tree_item(clicked_item)
                if not product:
                    return

                # Log the current state
                logger.debug(f"Toggling stock for product: {product.name} (current: {product.stock})")

                # Create updated product with toggled stock
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

                # Update in service
                self.product_service.update_product(product.name, updated_product)
                
                # Update display
                self.tree.set(clicked_item, "stock", "☑" if updated_product.stock else "☐")
                
                # Log the update
                logger.info(
                    f"Stock updated for '{product.name}': "
                    f"{'En stock' if updated_product.stock else 'Sin stock'}"
                )
                
                # Update status
                self.update_status(
                    f"Stock de '{product.name}' actualizado: "
                    f"{'En stock' if updated_product.stock else 'Sin stock'}"
                )

        except Exception as e:
            logger.error(f"Error in stock toggle: {str(e)}")
            print(f"Error in end_drag: {e}")
            messagebox.showerror(
                "Error",
                f"Error al actualizar el estado de stock: {str(e)}"
            )

    def reorder_products(self, new_index: int) -> None:
        """Reorder products after drag and drop."""
        products = self.product_service.get_all_products()
        item = products.pop(self._drag_data["start_index"])
        products.insert(new_index, item)
        
        try:
            self.product_service.reorder_products(products)
            self.update_status("Productos reordenados exitosamente")
        except ProductServiceError as e:
            messagebox.showerror("Error", f"Error al reordenar productos: {str(e)}")
            self.refresh_products()

    def handle_selection(self, event: Optional[tk.Event] = None) -> None:
        """Handle selection in treeview."""
        selected = self.tree.selection()
        if selected:
            self.edit_button.config(state=tk.NORMAL)
            self.delete_button.config(state=tk.NORMAL)
            if len(selected) == 1:
                product = self.get_product_by_tree_item(selected[0])
                self.update_status(
                    f"Seleccionado: {product.name} - "
                    f"Precio: ${product.price:,} - "
                    f"Categoría: {product.category}"
                )
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

    def add_product(self) -> None:
        """Open dialog to add new product."""
        ProductFormDialog(
            self.master,
            "Agregar Producto",
            self.product_service,
            on_save=self.refresh_products
        )

    def edit_product(self) -> None:
        """Open dialog to edit selected product."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning(
                "Advertencia",
                "Por favor seleccione un producto para editar."
            )
            return

        product = self.get_product_by_tree_item(selected[0])
        if product:
            ProductFormDialog(
                self.master,
                "Editar Producto",
                self.product_service,
                product,
                on_save=self.refresh_products
            )

    def delete_product(self) -> None:
        """Delete selected product(s)."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning(
                "Advertencia",
                "Por favor seleccione uno o más productos para eliminar."
            )
            return

        products = [
            self.get_product_by_tree_item(item)
            for item in selected
        ]
        products = [p for p in products if p is not None]

        if not products:
            return

        if not messagebox.askyesno(
            "Confirmar Eliminación",
            f"¿Está seguro de que desea eliminar {len(products)} producto(s)?"
        ):
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
            
            # Only filter by category if not "Todas"
            if category != "Todas":
                products = [p for p in products if p.category.lower() == category.lower()]
            
            if query:
                products = [
                    p for p in products
                    if query in p.name.lower() or
                    query in p.description.lower()
                ]

            self.populate_tree(products)
            self.update_categories()
            self.update_status(f"Mostrando {len(products)} productos")
        except ProductServiceError as e:
            messagebox.showerror("Error", f"Error al cargar productos: {str(e)}")

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
            
            # Preserve current selection if it exists (case-insensitive comparison)
            if current_category != "Todas" and current_category.lower() not in [cat.lower() for cat in categories]:
                self.category_var.set("Todas")
            
        except ProductServiceError as e:
            messagebox.showerror("Error", f"Error al cargar categorías: {str(e)}")

    def get_product_by_tree_item(self, item: str) -> Optional[Product]:
        """Get Product object from treeview item."""
        values = self.tree.item(item)["values"]
        try:
            return next(
                p for p in self.product_service.get_all_products()
                if p.name == values[0]
            )
        except (StopIteration, IndexError):
            return None

    def update_status(self, message: str) -> None:
        """Update status bar message."""
        self.status_var.set(message)
        logger.debug(f"Status: {message}")

    def import_products(self) -> None:
        """Import products from JSON file."""
        file_path = filedialog.askopenfilename(
            filetypes=[("Archivos JSON", "*.json")]
        )
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
        file_path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("Archivos JSON", "*.json")]
        )
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

    def __init__(
        self,
        parent: tk.Tk,
        title: str,
        product_service: ProductService,
        product: Optional[Product] = None,
        on_save: Optional[Callable[[], None]] = None
    ):
        super().__init__(parent)
        self.title(title)
        self.product_service = product_service
        self.product = product
        self.on_save = on_save

        # Create a temporary ttk.Entry to get its exact font configuration
        temp_entry = ttk.Entry(self)
        self.default_font = temp_entry.cget('font')
        temp_entry.destroy()
        
        self.setup_dialog()
        self.populate_fields()

    def setup_dialog(self) -> None:
        """Set up dialog window."""
        self.geometry("500x330")  # Increased height to accommodate all fields
        self.resizable(False, False)
        self.transient(self.master)
        self.grab_set()

        # Create main frame with padding
        self.main_frame = ttk.Frame(self, padding="10")
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        self.create_widgets()
        self.create_buttons()

    def create_widgets(self) -> None:
        """Create form widgets."""
        self.entries: Dict[str, tk.Widget] = {}
        
        # Define field configurations
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
            # Create label
            label_widget = ttk.Label(self.main_frame, text=label)
            label_widget.grid(row=i, column=0, sticky=tk.W, padx=(0, 10), pady=5)

            # Create input widget
            if widget_class == tk.Checkbutton:
                var = tk.BooleanVar(value=True)
                widget = widget_class(self.main_frame, variable=var)
                self.entries[field] = var
                widget.grid(row=i, column=1, sticky=tk.W, pady=5)
            elif widget_class == ttk.Combobox:
                widget = widget_class(
                    self.main_frame,
                    values=sorted(self.product_service.get_categories()),
                    **widget_opts
                )
                self.entries[field] = widget
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
            elif widget_class == tk.Text:
                # Special handling for Text widget with exact font matching
                widget = widget_class(
                    self.main_frame,
                    font=self.default_font,  # Use exact font configuration from ttk.Entry
                    **widget_opts
                )
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
                self.entries[field] = widget
            else:
                widget = widget_class(self.main_frame, **widget_opts)
                self.entries[field] = widget
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)

            if field == "image_path":
                ttk.Button(
                    self.main_frame,
                    text="Explorar...",
                    command=self.browse_image,
                    width=10
                ).grid(row=i, column=2, padx=(5, 0), pady=5)

    def create_buttons(self) -> None:
        """Create dialog buttons."""
        button_frame = ttk.Frame(self)
        button_frame.pack(side=tk.BOTTOM, pady=(0, 10))

        ttk.Button(
            button_frame,
            text="Guardar",
            command=self.save_product,
            width=10
        ).pack(side=tk.LEFT, padx=5)

        ttk.Button(
            button_frame,
            text="Cancelar",
            command=self.destroy,
            width=10
        ).pack(side=tk.LEFT, padx=5)

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

    def browse_image(self) -> None:
        """Open file dialog to select image."""
        file_path = filedialog.askopenfilename(
            filetypes=[
                ("Archivos de imagen", "*.png *.jpg *.jpeg *.gif *.webp")
            ]
        )
        if not file_path:
            return

        try:
            # Get base directory for images
            abs_base_dir = os.path.abspath(
                os.path.join(
                    os.path.dirname(__file__),
                    '..',
                    'assets',
                    'images'
                )
            )

            # Get the current folder name from the selected file path
            # This preserves the exact folder name as it exists in the filesystem
            file_dir = os.path.dirname(file_path)
            current_folder = os.path.basename(file_dir)
            
            # Create destination path maintaining the original folder structure
            dest_dir = os.path.join(abs_base_dir, current_folder)
            os.makedirs(dest_dir, exist_ok=True)
            
            dest_path = os.path.join(
                dest_dir,
                os.path.basename(file_path)
            )
            
            # Copy file if it's not already in place
            if os.path.abspath(file_path) != os.path.abspath(dest_path):
                shutil.copy2(file_path, dest_path)
            
            # Set relative path using forward slashes
            rel_path = os.path.relpath(dest_path, abs_base_dir)
            rel_path = 'assets/images/' + rel_path.replace('\\', '/')
            
            self.entries["image_path"].delete(0, tk.END)
            self.entries["image_path"].insert(0, rel_path)
            
        except Exception as e:
            messagebox.showerror("Error", f"Error al copiar la imagen: {str(e)}")

    def save_product(self) -> None:
        """Save product data."""
        try:
            data = self.validate_and_get_data()
            product = Product(**data)
            
            if self.product:
                self.product_service.update_product(
                    self.product.name,
                    product
                )
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
        
        # Get values from widgets
        for field, widget in self.entries.items():
            if isinstance(widget, tk.BooleanVar):
                data[field] = widget.get()
            elif isinstance(widget, tk.Text):
                data[field] = widget.get("1.0", tk.END).strip()
            else:
                data[field] = widget.get().strip()

        # Validate required fields
        if not data["name"]:
            raise ValueError("El nombre es obligatorio")
        
        # Validate price
        try:
            data["price"] = int(data["price"])
            if data["price"] <= 0:
                raise ValueError("El precio debe ser mayor que cero")
        except ValueError:
            raise ValueError("El precio debe ser un número válido mayor que cero")

        # Validate discount
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

        # Validate image path
        if data["image_path"]:
            if not data["image_path"].startswith("assets/images/"):
                raise ValueError(
                    "La ruta de la imagen debe comenzar con 'assets/images/'"
                )

        return data


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

        # Font size
        ttk.Label(self, text="Tamaño de Fuente:").grid(
            row=1, column=0, padx=10, pady=5, sticky=tk.W
        )
        self.font_var = tk.IntVar(value=self.config.font_size)
        font_spin = ttk.Spinbox(
            self,
            from_=8,
            to=16,
            textvariable=self.font_var,
            width=5
        )
        font_spin.grid(row=1, column=1, padx=10, pady=5, sticky=tk.W)

        # Animations
        ttk.Label(self, text="Habilitar Animaciones:").grid(
            row=2, column=0, padx=10, pady=5, sticky=tk.W
        )
        self.anim_var = tk.BooleanVar(value=self.config.enable_animations)
        ttk.Checkbutton(
            self,
            variable=self.anim_var
        ).grid(row=2, column=1, padx=10, pady=5, sticky=tk.W)

        # Buttons
        button_frame = ttk.Frame(self)
        button_frame.grid(
            row=3, column=0, columnspan=2, pady=20
        )
        ttk.Button(
            button_frame,
            text="Guardar",
            command=self.save_preferences
        ).pack(side=tk.LEFT, padx=5)
        ttk.Button(
            button_frame,
            text="Cancelar",
            command=self.destroy
        ).pack(side=tk.LEFT, padx=5)

    def save_preferences(self) -> None:
        """Save preferences to configuration."""
        try:
            self.config.font_size = self.font_var.get()
            self.config.enable_animations = self.anim_var.get()
            
            config_path = Path.home() / ".product_manager" / "config.json"
            config_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(config_path, 'w') as f:
                json.dump(
                    {
                        "font_size": self.config.font_size,
                        "enable_animations": self.config.enable_animations,
                        "window_size": self.config.window_size,
                        "locale": self.config.locale
                    },
                    f,
                    indent=2
                )
            
            if self.on_save:
                self.on_save()
                
            self.destroy()
            messagebox.showinfo(
                "Éxito",
                "Preferencias guardadas y aplicadas."
            )
        except Exception as e:
            messagebox.showerror(
                "Error",
                f"Error al guardar preferencias: {str(e)}"
            )


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
        
        scrollbar = ttk.Scrollbar(
            help_text,
            orient="vertical",
            command=help_text.yview
        )
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

        label = ttk.Label(
            self,
            text=about_text,
            justify=tk.CENTER,
            padding=20
        )
        label.pack(expand=True)

        ttk.Button(
            self,
            text="Cerrar",
            command=self.destroy
        ).pack(pady=10)


if __name__ == "__main__":
    root = tk.Tk()
    app = ProductGUI(root)
    root.mainloop()