import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from typing import List, Optional, Callable, Dict, Any, Tuple
import json
import logging
from pathlib import Path
import webbrowser

from models import Product
from services import ProductService, ProductServiceError
from category_service import CategoryService, CategoryServiceError
from category_gui import CategoryManagerDialog

from .components import UIConfig, UIState, AsyncOperation, TreeviewManager, DragDropMixin
from .gallery import GalleryFrame
from .dialogs import PreferencesDialog, HelpDialog, AboutDialog
from .product_form import ProductFormDialog

logger = logging.getLogger(__name__)


class MainWindow(DragDropMixin):
    """Main Product Manager GUI Window."""

    def __init__(
        self,
        master: tk.Tk,
        product_service: ProductService,
        category_service: Optional[CategoryService] = None,
        project_root: Optional[Path] = None
    ):
        self.master = master
        self.product_service = product_service
        self.category_service = category_service
        self.project_root = project_root
        self.logger = logger
        self.state = UIState()
        self.config = self._load_config()
        self.view_mode = "list" # list | gallery
        self.image_cache: Dict[str, Any] = {}
        self.state.update("view_mode", "list")
        self._cell_editor: Optional[tk.Widget] = None
        self._cell_editor_info: Dict[str, Any] = {}
        # Undo/Redo stacks for bulk operations only
        self._undo_stack: List[Dict[str, Any]] = []
        self._redo_stack: List[Dict[str, Any]] = []
        self._undo_max = 20
        self.category_label_by_key: Dict[str, str] = {}
        self.category_value_by_label: Dict[str, str] = {}

        self._configure_styles()
        self.setup_gui()
        self.bind_shortcuts()
        # Configure drag & drop after treeview has been created in setup_treeview()
        self.setup_drag_and_drop(self.tree)

    def _configure_styles(self) -> None:
        """Configure application styles."""
        style = ttk.Style()
        theme = "clam" if "clam" in style.theme_names() else "alt"
        style.theme_use(theme)

        # Colors
        bg_color = "#f5f5f5"
        fg_color = "#333333"
        accent_color = "#007acc"
        header_bg = "#e1e1e1"
        
        style.configure(".", background=bg_color, foreground=fg_color, font=("Segoe UI", 9))
        style.configure("TFrame", background=bg_color)
        style.configure("TLabel", background=bg_color, foreground=fg_color)
        style.configure("TButton", padding=6, relief="flat", background="#e1e1e1")
        style.map("TButton",
                  background=[("active", "#d4d4d4"), ("disabled", "#f0f0f0")],
                  foreground=[("disabled", "#a0a0a0")])

        # Treeview Styles
        style.configure("Treeview", 
                        background="white",
                        fieldbackground="white",
                        foreground="#333333",
                        rowheight=30,
                        font=("Segoe UI", 9))
        style.configure("Treeview.Heading", 
                        font=("Segoe UI", 9, "bold"),
                        background=header_bg,
                        foreground="#333333",
                        relief="flat")
        style.map("Treeview", background=[("selected", accent_color)], foreground=[("selected", "white")])
        
        # Custom styles for specific widgets
        style.configure("Accent.TButton", background=accent_color, foreground="white")
        style.map("Accent.TButton", background=[("active", "#005f9e")])

    def _load_config(self) -> UIConfig:
        """Load UI configuration from file."""
        from dataclasses import fields
        config_path = Path.home() / ".product_manager" / "config.json"
        try:
            if config_path.exists():
                with open(config_path) as f:
                    data = json.load(f)
                    valid_fields = {field.name for field in fields(UIConfig)}
                    filtered_data = {k: v for k,
                                     v in data.items() if k in valid_fields}
                    return UIConfig(**filtered_data)
        except Exception as e:
            logger.warning(f"Error loading config: {e}")
        return UIConfig()

    def setup_gui(self) -> None:
        """Set up the main GUI components."""
        self.master.title("Gestor de Productos")
        self.master.geometry(
            f"{self.config.window_size[0]}x{self.config.window_size[1]}")

        self.create_menu()
        
        # Packing Order (Outer to Inner)
        self.setup_status_bar()     # 1. Bottom
        self.setup_bottom_bar()     # 2. Bottom (Above Status)
        self.setup_top_bar()        # 3. Top
        
        # 4. Center (Fill Remaining)
        self.view_container = ttk.Frame(self.master)
        self.view_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.setup_treeview()

        self.async_operation = AsyncOperation(self.master)
        self.async_operation.start(
            self.product_service.get_all_products, self.populate_tree)

    def create_menu(self) -> None:
        """Create application menu."""
        menubar = tk.Menu(self.master)

        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Importar Productos...",
                              command=self.import_products)
        file_menu.add_command(label="Exportar Productos...",
                              command=self.export_products)
        file_menu.add_separator()
        file_menu.add_command(label="Salir", command=self.master.quit)
        menubar.add_cascade(label="Archivo", menu=file_menu)

        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Preferencias...",
                              command=self.show_preferences)
        edit_menu.add_separator()
        edit_menu.add_command(label="Gestionar Categorías...",
                              command=self.manage_categories)
        menubar.add_cascade(label="Editar", menu=edit_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Manual de Usuario",
                              command=self.show_help)
        help_menu.add_command(label="Acerca de", command=self.show_about)
        menubar.add_cascade(label="Ayuda", menu=help_menu)

        self.master.config(menu=menubar)

    def setup_treeview(self) -> None:
        """Set up the treeview component."""
        tree_frame = ttk.Frame(self.view_container)
        tree_frame.pack(fill=tk.BOTH, expand=True)

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

        scrollbar = ttk.Scrollbar(
            tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.tree.bind("<<TreeviewSelect>>", self.handle_selection)
        # Faster stock toggle: double-click the Stock column
        self.tree.bind("<Double-1>", self.handle_double_click)
        
        # Initialize Gallery Frame (hidden by default)
        self.gallery = GalleryFrame(self.view_container, self._on_gallery_edit, self.image_cache, project_root=self.project_root)

    def setup_top_bar(self) -> None:
        """Set up the top bar with browsing and filtering controls."""
        top_frame = ttk.Frame(self.master)
        top_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)

        # 1. View Switcher
        self.btn_toggle_view = ttk.Button(top_frame, text="Vista: Galería", command=self.toggle_view)
        self.btn_toggle_view.pack(side=tk.LEFT, padx=5)

        # 2. Search & Categories
        search_frame = ttk.Frame(top_frame)
        search_frame.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)

        ttk.Label(search_frame, text="Buscar:").pack(side=tk.LEFT, padx=5)
        self.search_var = tk.StringVar()
        self.search_var.trace("w", self.handle_search)
        ttk.Entry(search_frame, textvariable=self.search_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=5)

        ttk.Label(search_frame, text="Categoría:").pack(side=tk.LEFT, padx=5)
        self.category_var = tk.StringVar(value="Todas")
        self.category_combobox = ttk.Combobox(
            search_frame, textvariable=self.category_var, state="readonly")
        self.category_combobox.pack(side=tk.LEFT, padx=5)
        self.update_categories()
        self.category_combobox.bind("<<ComboboxSelected>>", self.handle_search)

        # 3. Filters
        filters_frame = ttk.Frame(top_frame)
        filters_frame.pack(side=tk.LEFT, padx=10)

        self.only_discount_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(filters_frame, text="Solo descuento", variable=self.only_discount_var,
                        command=self.refresh_products).pack(side=tk.LEFT, padx=5)

        self.only_out_of_stock_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(filters_frame, text="Solo sin stock", variable=self.only_out_of_stock_var,
                        command=self.refresh_products).pack(side=tk.LEFT, padx=5)

        # Price range
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

        # Quick View
        quick_frame = ttk.Frame(top_frame)
        quick_frame.pack(side=tk.LEFT, padx=10)
        ttk.Label(quick_frame, text="Vista Rápida:").pack(side=tk.LEFT)
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

    def setup_bottom_bar(self) -> None:
        """Set up the bottom bar with CRUD and bulk actions."""
        bottom_frame = ttk.Frame(self.master)
        bottom_frame.pack(side=tk.BOTTOM, fill=tk.X, padx=10, pady=5)

        # 1. CRUD Actions (Left)
        crud_frame = ttk.Frame(bottom_frame)
        crud_frame.pack(side=tk.LEFT)

        ttk.Button(crud_frame, text="Agregar", command=self.add_product).pack(side=tk.LEFT, padx=2)
        
        self.edit_button = ttk.Button(crud_frame, text="Editar", command=self.edit_product, state=tk.DISABLED)
        self.edit_button.pack(side=tk.LEFT, padx=2)

        self.delete_button = ttk.Button(crud_frame, text="Eliminar", command=self.delete_product, state=tk.DISABLED)
        self.delete_button.pack(side=tk.LEFT, padx=2)

        # 2. Bulk Actions (Right - Inner)
        bulk_frame = ttk.Frame(bottom_frame)
        bulk_frame.pack(side=tk.RIGHT, padx=10)

        ttk.Button(bulk_frame, text="% Desc.", width=8,
                   command=self.bulk_percentage_discount).pack(side=tk.LEFT, padx=2)
        ttk.Button(bulk_frame, text="Desc. fijo", width=10,
                   command=self.bulk_fixed_discount).pack(side=tk.LEFT, padx=2)
        ttk.Button(bulk_frame, text="Stock ON", width=10,
                   command=lambda: self.bulk_set_stock(True)).pack(side=tk.LEFT, padx=2)
        ttk.Button(bulk_frame, text="Stock OFF", width=10,
                   command=lambda: self.bulk_set_stock(False)).pack(side=tk.LEFT, padx=2)
        ttk.Button(bulk_frame, text="Precio +%", width=10,
                   command=lambda: self.bulk_adjust_price(True)).pack(side=tk.LEFT, padx=2)
        ttk.Button(bulk_frame, text="Precio -%", width=10,
                   command=lambda: self.bulk_adjust_price(False)).pack(side=tk.LEFT, padx=2)

        # 3. History (Right - Outer)
        history_frame = ttk.Frame(bottom_frame)
        history_frame.pack(side=tk.RIGHT, padx=5)
        
        self.undo_btn = ttk.Button(history_frame, text="Deshacer", width=10, command=self.undo_last, state=tk.DISABLED)
        self.redo_btn = ttk.Button(history_frame, text="Rehacer", width=10, command=self.redo_last, state=tk.DISABLED)
        self.undo_btn.pack(side=tk.LEFT, padx=2)
        self.redo_btn.pack(side=tk.LEFT, padx=2)

    def setup_status_bar(self) -> None:
        """Set up the status bar with version info."""
        status_frame = ttk.Frame(self.master)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)

        self.status_var = tk.StringVar()
        status_label = ttk.Label(
            status_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_label.pack(side=tk.LEFT, fill=tk.X, expand=True)

        self.conflict_button = ttk.Button(
            status_frame,
            text="Conflictos (0)",
            width=16,
            command=self.show_sync_conflicts,
            state=tk.DISABLED
        )
        self.conflict_button.pack(side=tk.RIGHT, padx=(5, 0))

        self.sync_var = tk.StringVar(value="Sincronizado")
        sync_label = ttk.Label(
            status_frame, textvariable=self.sync_var, relief=tk.SUNKEN, anchor=tk.E, width=24)
        sync_label.pack(side=tk.RIGHT, padx=(5, 0))

        self.version_var = tk.StringVar()
        version_label = ttk.Label(
            status_frame, textvariable=self.version_var, relief=tk.SUNKEN, anchor=tk.E, width=50)
        version_label.pack(side=tk.RIGHT, padx=(5, 0))

        self.update_version_info()
        self.refresh_sync_status()

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

    def refresh_sync_status(self) -> None:
        """Refresh synchronization indicators."""
        status_summary = {"pending": 0, "waiting": 0, "errors": 0}
        if hasattr(self.product_service, "get_sync_status"):
            try:
                status_summary = self.product_service.get_sync_status()
            except Exception:  # pylint: disable=broad-except
                status_summary = {"pending": 0, "waiting": 0, "errors": 0}
        elif hasattr(self.product_service, "get_sync_pending_count"):
            try:
                pending = int(self.product_service.get_sync_pending_count())
                status_summary["pending"] = pending
            except Exception:  # pylint: disable=broad-except
                status_summary["pending"] = 0
        pending = int(status_summary.get("pending", 0) or 0)
        waiting = int(status_summary.get("waiting", 0) or 0)
        errors = int(status_summary.get("errors", 0) or 0)
        conflicts = []
        try:
            conflicts = self.product_service.get_conflicts()
        except Exception:  # pylint: disable=broad-except
            conflicts = []
        engine = getattr(self.product_service, "sync_engine", None)
        engine_enabled = bool(getattr(engine, "enabled", False)) if engine else False
        if pending:
            self.sync_var.set(f"Cambios pendientes: {pending}")
        elif waiting:
            self.sync_var.set(f"En espera de red: {waiting}")
        elif errors:
            self.sync_var.set(f"Errores de sincronización: {errors}")
        else:
            if engine and engine_enabled:
                self.sync_var.set("Sincronizado")
            else:
                self.sync_var.set("Sincronización deshabilitada")
        if conflicts:
            self.conflict_button.configure(
                text=f"Conflictos ({len(conflicts)})", state=tk.NORMAL)
        else:
            self.conflict_button.configure(
                text="Conflictos (0)", state=tk.DISABLED)
        self.master.after(5000, self.refresh_sync_status)

    def show_sync_conflicts(self) -> None:
        """Display conflict details to the user."""
        try:
            conflicts = self.product_service.consume_conflicts()
        except Exception:  # pylint: disable=broad-except
            conflicts = None
        if not conflicts:
            messagebox.showinfo("Conflictos", "No hay conflictos pendientes.")
            self.refresh_sync_status()
            return
        lines = []
        for conflict in conflicts:
            product = conflict.get("product_id", "Producto desconocido")
            lines.append(f"{product}:")
            for detail in conflict.get("fields", []):
                field = detail.get("field", "?")
                server_value = detail.get("server_value")
                client_value = detail.get("client_value")
                reason = detail.get("reason", "conflicto")
                lines.append(
                    f"  • {field}: servidor={server_value} | local={client_value} ({reason})"
                )
        messagebox.showwarning("Conflictos de sincronización", "".join(lines))
        self.refresh_sync_status()

    def bind_shortcuts(self) -> None:
        """Bind keyboard shortcuts."""
        self.master.bind("<Control-n>", lambda e: self.add_product())
        self.master.bind("<Control-e>", lambda e: self.edit_product())
        self.master.bind("<Delete>", lambda e: self.delete_product())
        self.master.bind("<Control-f>", self.focus_search)

    def add_product(self) -> None:
        """Open dialog to add new product."""
        self.update_categories()
        selected_category = getattr(self, "category_var", None)
        default_category = None
        if isinstance(selected_category, tk.StringVar):
            current = selected_category.get().strip()
            if current and current.lower() != "todas":
                default_category = self.category_value_by_label.get(current, current)
        category_choices = self._get_category_choices_for_form()
        ProductFormDialog(
            self.master,
            "Agregar Producto",
            self.product_service,
            on_save=self.refresh_products,
            default_category=default_category,
            category_choices=category_choices,
        )

    def edit_product(self) -> None:
        """Open dialog to edit selected product."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning(
                "Advertencia", "Por favor seleccione un producto para editar.")
            return
        product = self.get_product_by_tree_item(selected[0])
        if product:
            category_choices = self._get_category_choices_for_form()
            ProductFormDialog(
                self.master,
                "Editar Producto",
                self.product_service,
                product,
                on_save=self.refresh_products,
                category_choices=category_choices,
            )

    def delete_product(self) -> None:
        """Delete selected product(s)."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning(
                "Advertencia", "Por favor seleccione uno o más productos para eliminar.")
            return

        products = [self.get_product_by_tree_item(
            item) for item in selected if self.get_product_by_tree_item(item) is not None]

        if not products:
            return

        if not messagebox.askyesno("Confirmar Eliminación", f"¿Está seguro de que desea eliminar {len(products)} producto(s)?"):
            return

        try:
            for product in products:
                self.product_service.delete_product(
                    product.name, product.description)
            self.refresh_products()
            self.update_status(f"{len(products)} producto(s) eliminado(s)")
        except ProductServiceError as e:
            messagebox.showerror("Error", str(e))

    def refresh_products(self) -> None:
        """Refresh the product list."""
        query = self.search_var.get().lower()
        self.update_categories()
        category_label = self.category_var.get()

        try:
            products = self.product_service.get_all_products()
            if category_label != "Todas":
                category_key = self.category_value_by_label.get(
                    category_label, category_label)
                normalized = (category_key or "").strip().lower()
                products = [
                    p for p in products
                    if (p.category or "").strip().lower() == normalized
                ]
            if query:
                products = [p for p in products if query in p.name.lower(
                ) or query in p.description.lower()]
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
            min_p = _parse_int(self.min_price_var.get()) if hasattr(
                self, 'min_price_var') else None
            max_p = _parse_int(self.max_price_var.get()) if hasattr(
                self, 'max_price_var') else None
            if min_p is not None:
                products = [p for p in products if p.price >= min_p]
            if max_p is not None:
                products = [p for p in products if p.price <= max_p]

            self.populate_tree(products)
            self.update_status(f"Mostrando {len(products)} productos")
        except ProductServiceError as e:
            messagebox.showerror(
                "Error", f"Error al cargar productos: {str(e)}")

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
        """Populate treeview or gallery with products."""
        self._current_products = products # Store for switching views
        
        if self.view_mode == "list":
            if self.gallery.winfo_ismapped():
                self.gallery.pack_forget()
            if not self.tree.master.winfo_ismapped():
                self.tree.master.pack(fill=tk.BOTH, expand=True)
                
            self.tree.delete(*self.tree.get_children())
            for product in products:
                category_display = self._category_display_label(product.category)
                self.tree.insert(
                    "",
                    "end",
                    values=(
                        product.name,
                        product.description,
                        f"{product.price:,}",
                        f"{product.discount:,}" if product.discount else "",
                        "☑" if product.stock else "☐",
                        category_display,
                    )
                )
            self.treeview_manager.update_sort_indicators()
            
        else: # Gallery
            if self.tree.master.winfo_ismapped():
                self.tree.master.pack_forget()
            if not self.gallery.winfo_ismapped():
                self.gallery.pack(fill=tk.BOTH, expand=True)
            
            self.gallery.render_products(products)

    def toggle_view(self) -> None:
        if self.view_mode == "list":
            self.view_mode = "gallery"
            self.btn_toggle_view.config(text="Vista: Lista")
        else:
            self.view_mode = "list"
            self.btn_toggle_view.config(text="Vista: Galería")
        
        # Refresh current view with last known products
        if hasattr(self, '_current_products'):
            self.populate_tree(self._current_products)
        else:
            self.refresh_products()

    def _on_gallery_edit(self, product: Product):
        # Select item in tree (hidden) to keep state consistent if possible, then open dialog
        category_choices = self._get_category_choices_for_form()
        ProductFormDialog(
            self.master,
            "Editar Producto",
            self.product_service,
            product,
            on_save=self.refresh_products,
            category_choices=category_choices,
        )

    def _category_display_label(self, category_value: str) -> str:
        """Return human readable category label for the given product key."""
        if not category_value:
            return ""
        return self.category_label_by_key.get(
            category_value.strip().lower(),
            category_value
        )

    def _get_category_choices_for_form(self) -> List[Tuple[str, str]]:
        """Return category choices suitable for the product form dialog."""
        try:
            return self.product_service.get_category_choices()
        except ProductServiceError as exc:
            messagebox.showerror(
                "Error",
                f"No se pudieron cargar las categorías disponibles: {exc}",
            )
            return []

    def update_categories(self) -> None:
        """Update category filter choices."""
        try:
            current_selection = self.category_var.get()
            choices = self.product_service.get_category_choices()
            self.category_label_by_key = {
                (value or "").strip().lower(): label
                for label, value in choices if value
            }
            self.category_value_by_label = {
                label: value for label, value in choices
            }
            display_values = ["Todas"] + [label for label, _ in choices]
            if hasattr(self, "category_combobox"):
                self.category_combobox["values"] = display_values
            if current_selection != "Todas":
                if current_selection in self.category_value_by_label:
                    pass
                else:
                    mapped_label = self.category_label_by_key.get(
                        current_selection.lower())
                    if mapped_label and mapped_label in display_values:
                        self.category_var.set(mapped_label)
                    else:
                        self.category_var.set("Todas")
        except (ProductServiceError, CategoryServiceError) as e:
            messagebox.showerror(
                "Error", f"Error al cargar categorías: {str(e)}")

    def manage_categories(self) -> None:
        """Open the category management dialog."""
        if not self.category_service:
            messagebox.showinfo(
                "Categorías",
                "La gestión de categorías no está disponible en esta instalación.",
            )
            return
        dialog = CategoryManagerDialog(
            self.master,
            self.category_service,
            on_catalog_updated=self._on_categories_updated,
        )
        self.master.wait_window(dialog)

    def _on_categories_updated(self) -> None:
        """Refresh local caches after category catalog updates."""
        try:
            if self.category_service:
                self.category_service.reload()
            self.refresh_products()
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def get_product_by_tree_item(self, item: str) -> Optional[Product]:
        """Get Product object from treeview item."""
        values = self.tree.item(item)["values"]
        try:
            name = values[0]
            description = values[1] if len(values) > 1 else ""
        except (TypeError, IndexError):
            return None

        try:
            return self.product_service.get_product_by_name(name, description)
        except ProductServiceError:
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
                    self.update_status(
                        f"Seleccionado: {product.name} - Precio: ${product.price:,} - Categoría: {product.category}")
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
            messagebox.showerror(
                "Error", f"Error al reordenar productos: {str(e)}")
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
                messagebox.showerror(
                    "Valor inválido", f"Ingrese un número válido{f' entre {min_val} y {max_val}' if max_val is not None else ''}.")

        def on_cancel():
            dialog.destroy()

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)
        ttk.Button(btn_frame, text="Aceptar", command=on_ok).pack(
            side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancelar",
                   command=on_cancel).pack(side=tk.LEFT, padx=5)
        dialog.wait_window()
        return result["value"]

    def bulk_percentage_discount(self) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo(
                "Acción masiva", "Seleccione uno o más productos.")
            return
        pct = self._ask_number("Aplicar descuento %",
                               "Porcentaje (0-100):", min_val=0, max_val=100)
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
        self._preview_and_apply_operation(
            f"Descuento {pct}% a {len(products)} producto(s)", pairs)

    def bulk_fixed_discount(self) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo(
                "Acción masiva", "Seleccione uno o más productos.")
            return
        amount = self._ask_number(
            "Descuento fijo", "Monto a descontar:", min_val=0)
        if amount is None:
            return
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            d = min(int(amount), p.price-1) if p.price > 0 else 0
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
        self._preview_and_apply_operation(
            f"Descuento fijo ${int(amount):,} a {len(products)} producto(s)", pairs)

    def bulk_set_stock(self, value: bool) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo(
                "Acción masiva", "Seleccione uno o más productos.")
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
        self._preview_and_apply_operation(
            f"Stock {'ON' if value else 'OFF'} para {len(products)} producto(s)", pairs)

    def bulk_adjust_price(self, increase: bool) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo(
                "Acción masiva", "Seleccione uno o más productos.")
            return
        pct = self._ask_number(
            "Ajustar precio %", "Porcentaje (0-100):", min_val=0, max_val=100)
        if pct is None:
            return
        factor = 1 + (pct/100) if increase else 1 - (pct/100)
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_price = max(1, int(round(p.price * factor)))
            new_discount = min(p.discount, new_price-1) if new_price > 0 else 0
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
        self._preview_and_apply_operation(
            f"Precio {'+' if increase else '-'}{pct}% a {len(products)} producto(s)", pairs)

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
                changes.append(
                    f"Stock: {'☑' if old.stock else '☐'} → {'☑' if new.stock else '☐'}")
            if changes:
                changed_count += 1
                lines.append(f"• {old.name} — " + "; ".join(changes))
        preview_text = f"{description}\n\nCambios: {changed_count} de {len(pairs)} productos\n\n" + "\n".join(
            lines[:50])

        if not self._show_preview_dialog(preview_text):
            return

        # Build do/undo updates
        do_updates: List[tuple[str, str, Product]] = [
            (old.name, old.description, new) for old, new in pairs]
        undo_updates: List[tuple[str, str, Product]] = [
            (new.name, new.description, old) for old, new in pairs]
        try:
            self.product_service.batch_update(do_updates)
            # Push to undo history
            op = {"description": description,
                  "do": do_updates, "undo": undo_updates}
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

        ttk.Button(btn_frame, text="Confirmar",
                   command=on_ok).pack(side=tk.LEFT, padx=6)
        ttk.Button(btn_frame, text="Cancelar",
                   command=on_cancel).pack(side=tk.LEFT, padx=6)
        dialog.wait_window()
        return result["ok"]

    def _update_history_buttons(self) -> None:
        if hasattr(self, 'undo_btn'):
            self.undo_btn.config(state=tk.NORMAL if len(
                self._undo_stack) > 0 else tk.DISABLED)
        if hasattr(self, 'redo_btn'):
            self.redo_btn.config(state=tk.NORMAL if len(
                self._redo_stack) > 0 else tk.DISABLED)

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
                    image_avif_path=product.image_avif_path,
                    order=product.order
                )
                self.product_service.update_product(
                    product.name, updated, product.description)
                self.tree.set(row, "stock", "☑" if updated.stock else "☐")
                self.update_status(
                    f"Stock de '{product.name}' actualizado: {'En stock' if updated.stock else 'Sin stock'}")
            except Exception as e:
                messagebox.showerror(
                    "Error", f"No se pudo actualizar el stock: {str(e)}")
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
                messagebox.showerror(
                    "Error", f"No se pudo abrir el editor: {str(e)}")

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
        self._cell_editor_info = {
            "item": item, "col_id": col_id, "field": field, "original": product}

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
                messagebox.showerror(
                    "Valor inválido", "Ingrese un número entero válido.")
                self._cell_editor.focus_set()
                return

            if field == "price" and new_val <= 0:
                messagebox.showerror(
                    "Valor inválido", "El precio debe ser mayor que cero.")
                self._cell_editor.focus_set()
                return
            if field == "discount" and new_val < 0:
                messagebox.showerror(
                    "Valor inválido", "El descuento no puede ser negativo.")
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
                image_avif_path=product.image_avif_path,
                order=product.order,
            )
            updated_kwargs[field] = new_val

            # Validate discount < price
            if updated_kwargs["discount"] >= updated_kwargs["price"]:
                messagebox.showerror(
                    "Valor inválido", "El descuento no puede ser mayor o igual al precio.")
                self._cell_editor.focus_set()
                return

            updated = Product(**updated_kwargs)

            # Persist change
            self.product_service.update_product(
                product.name, updated, product.description)

            # Update tree cell display (formatted)
            if field == "price":
                self.tree.set(item, "price", f"{updated.price:,}")
            elif field == "discount":
                self.tree.set(
                    item, "discount", f"{updated.discount:,}" if updated.discount else "")

            self.update_status(
                f"{field.capitalize()} de '{product.name}' actualizado.")
        except Exception as e:
            messagebox.showerror(
                "Error", f"No se pudo guardar el cambio: {str(e)}")
        finally:
            self._end_inline_edit()

    def _end_inline_edit(self) -> None:
      if self._cell_editor:
          try:
              self._cell_editor.place_forget()
              self._cell_editor.destroy()
          except Exception as exc:
              self.logger.debug("No se pudo limpiar el editor en línea: %s", exc)
      self._cell_editor = None
      self._cell_editor_info = {}

    def import_products(self) -> None:
        """Import products from JSON file."""
        file_path = filedialog.askopenfilename(
            filetypes=[("Archivos JSON", "*.json")])
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
        file_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[
                                                 ("Archivos JSON", "*.json")])
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
        PreferencesDialog(self.master, self.config,
                          on_save=on_preferences_saved)

    def show_help(self) -> None:
        """Show help dialog."""
        HelpDialog(self.master)

    def show_about(self) -> None:
        """Show about dialog."""
        AboutDialog(self.master)
