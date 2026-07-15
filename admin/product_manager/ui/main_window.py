"""Main window UI for product manager."""

from __future__ import annotations

import json
import logging
from dataclasses import fields
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import tkinter as tk
from tkinter import messagebox, ttk

from ..models import Product
from ..keyboard import bind_submit_keys
from ..services import (
    ProductService,
    ProductServiceError,
    ProductFilterCriteria,
    DuplicateProductError,
)
from ..category_service import CategoryService, CategoryServiceError
from ..category_gui import CategoryManagerDialog
from ..storefront_service import (
    StorefrontBundleError,
    StorefrontBundleService,
    FeaturedStaplesError,
    FeaturedStaplesService,
)

from .bulk_operations_mixin import BulkOperationsMixin
from .import_export_mixin import ImportExportMixin
from .deploy_panel import DeployPanelMixin
from .components import (
    UIConfig,
    UIState,
    AsyncOperation,
    TreeviewManager,
    DragDropMixin,
    ContextMenuBuilder,
    StatsDashboard,
)
from .theme import ThemeManager, AppTheme, load_theme_preference
from .toast import ToastLevel
from .utils import CategoryHelper
from .gallery import GalleryFrame
from .dialogs import PreferencesDialog, HelpDialog, AboutDialog
from .product_form import ProductFormDialog
from .storefront_dialogs import StorefrontBundlesDialog, FeaturedStaplesDialog

logger = logging.getLogger(__name__)

# pylint: disable=too-many-lines
# UI event handlers are self-explanatory; docstrings would add noise.
# pylint: disable=missing-function-docstring
# UI handlers catch broad exceptions to keep the app responsive.
# pylint: disable=broad-exception-caught


class MainWindow(DragDropMixin, BulkOperationsMixin, ImportExportMixin, DeployPanelMixin):
    """Main Product Manager GUI Window."""
    # Large UI controller with many widget references and handlers.
    # pylint: disable=too-many-instance-attributes,too-many-public-methods
    # pylint: disable=attribute-defined-outside-init

    def __init__(
        self,
        master: tk.Tk,
        product_service: ProductService,
        category_service: Optional[CategoryService] = None,
        project_root: Optional[Path] = None,
        deploy_pipeline: Optional[Any] = None,
        git_sync: Optional[Any] = None,
    ):
        self.master = master
        self.product_service = product_service
        self.category_service = category_service
        self.project_root = project_root
        self.logger = logger
        self.state = UIState()
        self.config = self._load_config()
        self.view_mode = "list"  # list | gallery

        self.setup_deploy_integration()
        self.init_deploy_services(
            deploy_pipeline=deploy_pipeline,
            git_sync=git_sync,
            dark_mode=False,
        )

        self._theme_manager = ThemeManager(master)
        saved_prefs = load_theme_preference()
        saved_theme = AppTheme(saved_prefs["theme"])
        saved_theme_name = saved_prefs.get("theme_name")
        if saved_theme_name:
            self._theme_manager.set_theme(saved_theme, theme_name=saved_theme_name)
        else:
            self._theme_manager.set_theme(saved_theme)
        if saved_theme == AppTheme.DARK:
            self.init_deploy_services(
                deploy_pipeline=deploy_pipeline,
                git_sync=git_sync,
                dark_mode=True,
            )
        configured_mode = getattr(self.config, "view_mode", "list")
        if configured_mode in ("list", "gallery"):
            self.view_mode = configured_mode
        self.config.view_mode = self.view_mode
        self.image_cache: Dict[str, Any] = {}
        self.state.update("view_mode", self.view_mode)
        self._cell_editor: Optional[ttk.Entry] = None
        self._cell_editor_info: Dict[str, Any] = {}
        # Undo/Redo stacks for bulk operations only
        self._undo_stack: List[Dict[str, Any]] = []
        self._redo_stack: List[Dict[str, Any]] = []
        self._undo_max = 20
        self.category_helper: Optional[CategoryHelper] = None
        self.tree_frame: Optional[ttk.Frame] = None
        self._config_save_job: Optional[str] = None
        self._config_save_delay_ms = 500
        self._last_window_size: Optional[tuple[int, int]] = None
        self._only_in_stock_override: bool = False
        self._pending_import_plan: Optional[Dict[str, Any]] = None
        self._pending_import_merge: Optional[Dict[str, bool]] = None
        self._import_file_menu: Optional[tk.Menu] = None
        self._import_apply_index: int = -1
        self.storefront_bundle_service = self._create_storefront_bundle_service()
        self.featured_staples_service = self._create_featured_staples_service()

        self._configure_styles()
        self.setup_gui()
        self.bind_shortcuts()
        # Configure drag & drop after treeview has been created in setup_treeview()
        self.setup_drag_and_drop(self.tree)
        self.master.protocol("WM_DELETE_WINDOW", self._on_closing)

    def _create_storefront_bundle_service(self) -> Optional[StorefrontBundleService]:
        project_root = self.project_root or Path(__file__).resolve().parents[3]
        bundles_path = (
            project_root / "astro-poc" / "src" / "data" / "storefront-bundles.json"
        )
        return StorefrontBundleService(bundles_path)

    def _create_featured_staples_service(self) -> Optional[FeaturedStaplesService]:
        project_root = self.project_root or Path(__file__).resolve().parents[3]
        experience_path = (
            project_root / "astro-poc" / "src" / "data" / "storefront-experience.json"
        )
        return FeaturedStaplesService(experience_path)

    def _configure_styles(self) -> None:
        """Configure application styles."""
        style = ttk.Style()
        theme = "clam" if "clam" in style.theme_names() else "alt"
        style.theme_use(theme)

        # Colors - Modern Linux Palette (Mint-Y/Adwaita inspired)
        bg_color = "#f6f5f4"  # Very light gray
        fg_color = "#2e3436"  # Dark charcoal
        accent_color = "#3584e4"  # Adwaita Blue (classic)
        secondary_accent = "#41855a"  # Mint Green
        header_bg = "#ebebeb"
        border_color = "#c0c0c0"  # Slightly darker for better contours

        # Font Stack
        font_stack = ("Inter", "Roboto", "Ubuntu", "DejaVu Sans", "Segoe UI", "sans-serif")
        base_font = (font_stack, 10)
        bold_font = (font_stack, 10, "bold")

        style.configure(
            ".", background=bg_color, foreground=fg_color, font=base_font
        )
        style.configure("TFrame", background=bg_color)
        style.configure("TLabel", background=bg_color, foreground=fg_color)
        
        # Modern Button Style with clearer contours
        style.configure(
            "TButton", 
            padding=8, 
            relief="flat", 
            background="#e8e8e7",
            borderwidth=1,
            bordercolor=border_color,
            lightcolor="#ffffff",
            darkcolor=border_color
        )
        style.map(
            "TButton",
            background=[("active", "#dfdfde"), ("disabled", "#f0f0f0")],
            foreground=[("disabled", "#909090")],
            bordercolor=[("active", "#a0a0a0")]
        )

        # Entry and Combobox styles with defined contours
        style.configure(
            "TEntry",
            fieldbackground="white",
            bordercolor=border_color,
            lightcolor=border_color,
            darkcolor=border_color,
            padding=5
        )
        style.configure(
            "TCombobox",
            fieldbackground="white",
            bordercolor=border_color,
            lightcolor=border_color,
            darkcolor=border_color,
            padding=5
        )

        # Treeview Styles - Increased legibility
        style.configure(
            "Treeview",
            background="white",
            fieldbackground="white",
            foreground=fg_color,
            rowheight=32,
            font=base_font,
            borderwidth=1,
            relief="flat"
        )
        style.configure(
            "Treeview.Heading",
            font=bold_font,
            background=header_bg,
            foreground=fg_color,
            relief="flat",
            padding=5
        )
        style.map(
            "Treeview",
            background=[("selected", accent_color)],
            foreground=[("selected", "white")],
        )

        # Custom styles for specific widgets
        style.configure("Accent.TButton", background=secondary_accent, foreground="white", bordercolor="#36704b")
        style.map("Accent.TButton", background=[("active", "#36704b")])

        # Toolbars and Wrappers
        style.configure("Toolbar.TFrame", background=bg_color, borderwidth=1, relief="flat")
        style.configure("Status.TFrame", background="#eeeeee")
        style.configure("InputWrapper.TFrame", background="white", borderwidth=1, relief="solid")

    def _load_config(self) -> UIConfig:
        """Load UI configuration from file."""
        config_path = Path.home() / ".product_manager" / "config.json"
        try:
            if config_path.exists():
                with open(config_path, encoding="utf-8") as f:
                    data = json.load(f)
                    valid_fields = {field.name for field in fields(UIConfig)}
                    filtered_data = {k: v for k, v in data.items() if k in valid_fields}
                    window_size = filtered_data.get("window_size")
                    if not (
                        isinstance(window_size, (list, tuple))
                        and len(window_size) == 2
                    ):
                        filtered_data.pop("window_size", None)
                    return UIConfig(**filtered_data)
        except Exception as exc:
            logger.warning("Error al cargar configuración: %s", exc)
        return UIConfig()

    @staticmethod
    def _get_config_path() -> Path:
        return Path.home() / ".product_manager" / "config.json"

    def _sync_view_toggle_label(self) -> None:
        if hasattr(self, "btn_toggle_view"):
            if self.view_mode == "list":
                self.btn_toggle_view.config(text="Vista: Galería")
            else:
                self.btn_toggle_view.config(text="Vista: Lista")

    def _schedule_config_save(self) -> None:
        if self._config_save_job:
            try:
                self.master.after_cancel(self._config_save_job)
            except tk.TclError as exc:
                self.logger.debug(
                    "No se pudo cancelar guardado de configuración pendiente: %s", exc
                )
        self._config_save_job = self.master.after(
            self._config_save_delay_ms, self._save_config
        )

    def _save_config(self) -> None:
        self._config_save_job = None
        self._capture_column_widths()
        payload = {
            "font_size": self.config.font_size,
            "enable_animations": self.config.enable_animations,
            "window_size": self.config.window_size,
            "locale": self.config.locale,
            "view_mode": self.view_mode,
            "column_widths": self.config.column_widths,
        }
        config_path = self._get_config_path()
        existing: Dict[str, Any] = {}
        if config_path.exists():
            try:
                with open(config_path, encoding="utf-8") as f:
                    existing = json.load(f)
                if not isinstance(existing, dict):
                    existing = {}
            except Exception:
                existing = {}
        existing.update(payload)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

    def _on_closing(self) -> None:
        """Check for unsaved changes before closing."""
        if self.product_service.has_changes():
            response = messagebox.askyesno(
                title="Cambios sin sincronizar",
                message="Hay cambios locales que no se han sincronizado con el servidor.\n\n"
                        "¿Desea salir de todas formas?",
            )
            if not response:
                return
            self.product_service.mark_clean()
        self.cleanup_deploy()
        self.master.quit()

    def _capture_column_widths(self) -> None:
        if not hasattr(self, "tree"):
            return
        widths: Dict[str, int] = {}
        for col in self.tree["columns"]:
            try:
                width = int(self.tree.column(col, "width"))
            except (tk.TclError, TypeError, ValueError):
                continue
            if width > 0:
                widths[col] = width
        self.config.column_widths = widths

    def _apply_column_widths(self) -> None:
        if not hasattr(self, "tree"):
            return
        widths = getattr(self.config, "column_widths", {})
        if not isinstance(widths, dict):
            return
        for col, width in widths.items():
            if col not in self.columns:
                continue
            try:
                parsed = int(width)
            except (TypeError, ValueError):
                continue
            if parsed > 0:
                self.tree.column(col, width=parsed)

    def _on_window_configure(self, event: tk.Event) -> None:
        if event.widget is not self.master:
            return
        width = int(getattr(event, "width", 0) or 0)
        height = int(getattr(event, "height", 0) or 0)
        if width <= 0 or height <= 0:
            return
        current = (width, height)
        if self._last_window_size == current:
            return
        self._last_window_size = current
        self.config.window_size = current
        self._schedule_config_save()

    def _on_tree_mouse_release(self, _event: Optional[tk.Event] = None) -> None:
        self._schedule_config_save()

    def setup_gui(self) -> None:
        """Set up the main GUI components."""
        self.master.title("Gestor de Productos — El Rincón de Ébano")
        self.master.geometry(
            f"{self.config.window_size[0]}x{self.config.window_size[1]}"
        )
        try:
            self._last_window_size = (
                int(self.config.window_size[0]),
                int(self.config.window_size[1]),
            )
        except Exception:
            self._last_window_size = None
        self.master.bind("<Configure>", self._on_window_configure)

        self.create_menu()
        self.create_toast_manager()

        # Packing Order (Outer to Inner)
        self.setup_status_bar()  # 1. Bottom
        self.setup_bottom_bar()  # 2. Bottom (Above Status)
        self.setup_top_bar()  # 3. Top

        # 4. Center (Fill Remaining)
        self._setup_stats_dashboard()
        self.view_container = ttk.Frame(self.master)
        self.view_container.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        self.setup_treeview()
        self._apply_column_widths()
        self._setup_context_menu()

        self.async_operation = AsyncOperation(self.master)
        self.async_operation.start(
            self.product_service.get_all_products, self.populate_tree
        )

        self.start_git_status_polling()
        self._refresh_stats_dashboard()

    def _setup_stats_dashboard(self):
        self._stats_frame = ttk.Frame(self.master)
        self._stats_frame.pack(side=tk.TOP, fill=tk.X, padx=15, pady=(0, 5))

        self._stats_dashboard = StatsDashboard(self._stats_frame)
        self._stats_dashboard.pack(side=tk.LEFT)

        self._stats_dashboard.add_card("total", "Total Productos", "-", "#3584e4")
        self._stats_dashboard.add_card("discounts", "Con Descuento", "-", "#e67e22")
        self._stats_dashboard.add_card("out_of_stock", "Sin Stock", "-", "#c0392b")
        self._stats_dashboard.add_card("categories", "Categorías", "-", "#41855a")
        self._stats_dashboard.layout_horizontal(width=160, height=70, padx=8)

    def _refresh_stats_dashboard(self):
        try:
            products = self.product_service.get_all_products()
            active = [p for p in products if not p.is_archived]
            archived = [p for p in products if p.is_archived]

            self._stats_dashboard.update_value("total", f"{len(active)} (+{len(archived)})")
            self._stats_dashboard.update_value(
                "discounts",
                str(len([p for p in active if (p.discount or 0) > 0]))
            )
            self._stats_dashboard.update_value(
                "out_of_stock",
                str(len([p for p in active if not p.stock]))
            )
            self._stats_dashboard.update_value(
                "categories",
                str(len({p.category for p in active if p.category}))
            )
        except Exception as exc:
            logger.debug("Error al actualizar estadísticas: %s", exc)

    def create_menu(self) -> None:
        """Create application menu."""
        menubar = tk.Menu(self.master)

        self._import_file_menu = tk.Menu(menubar, tearoff=0)
        self._import_file_menu.add_command(
            label="Importar Productos...", command=self.import_products
        )
        self._import_file_menu.add_command(
            label="Aplicar importación aprobada...",
            command=self.apply_pending_import,
            state=tk.DISABLED,
        )
        self._import_apply_index = 1
        file_menu = self._import_file_menu
        file_menu.add_command(
            label="Exportar Productos...", command=self.export_products
        )
        file_menu.add_command(
            label="Exportar CSV...", command=self.export_filtered_csv
        )
        file_menu.add_command(
            label="Chequeo de integridad...", command=self.run_integrity_check
        )
        file_menu.add_separator()
        file_menu.add_command(label="Salir", command=self._on_closing)
        menubar.add_cascade(label="Archivo", menu=file_menu)

        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Preferencias...", command=self.show_preferences)
        edit_menu.add_separator()
        edit_menu.add_command(
            label="Gestionar Categorías...", command=self.manage_categories
        )
        edit_menu.add_command(
            label="Gestionar Combos Listos...", command=self.manage_storefront_bundles
        )
        edit_menu.add_command(
            label="Gestionar Favoritos...", command=self.manage_featured_staples
        )
        menubar.add_cascade(label="Editar", menu=edit_menu)

        # Deploy menu
        deploy_menu = tk.Menu(menubar, tearoff=0)
        deploy_menu.add_command(
            label="Publicar (commit + push)",
            command=self._on_deploy_click,
        )
        deploy_menu.add_command(
            label="Solo commit local",
            command=self._on_commit_click,
        )
        deploy_menu.add_separator()
        deploy_menu.add_command(
            label="Pull del remoto",
            command=self._on_pull_click,
        )
        deploy_menu.add_separator()
        deploy_menu.add_command(
            label="Modo oscuro",
            command=self._toggle_theme,
        )
        menubar.add_cascade(label="Publicar", menu=deploy_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Manual de Usuario", command=self.show_help)
        help_menu.add_command(label="Acerca de", command=self.show_about)
        menubar.add_cascade(label="Ayuda", menu=help_menu)

        self.master.config(menu=menubar)

    def setup_treeview(self) -> None:
        """Set up the treeview component."""
        tree_frame = ttk.Frame(self.view_container)
        tree_frame.pack(fill=tk.BOTH, expand=True)
        self.tree_frame = tree_frame

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
            tree_frame, orient="vertical", command=self.tree.yview
        )
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.tree.bind("<<TreeviewSelect>>", self.handle_selection)
        # Faster stock toggle: double-click the Stock column
        self.tree.bind("<Double-1>", self.handle_double_click)
        self.tree.bind("<ButtonRelease-1>", self._on_tree_mouse_release, add="+")

        # Initialize Gallery Frame (hidden by default)
        self.gallery = GalleryFrame(
            self.view_container,
            self._on_gallery_edit,
            self.image_cache,
            project_root=self.project_root,
        )

    def setup_top_bar(self) -> None:
        """Set up the top bar with browsing and filtering controls."""
        top_frame = ttk.Frame(self.master, style="Toolbar.TFrame")
        top_frame.pack(side=tk.TOP, fill=tk.X, padx=15, pady=(15, 5))

        # 1. View Switcher
        self.btn_toggle_view = ttk.Button(
            top_frame, text="Vista: Galería", command=self.toggle_view
        )
        self.btn_toggle_view.pack(side=tk.LEFT, padx=5)

        # 2. Search & Categories
        search_frame = ttk.Frame(top_frame)
        search_frame.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)

        ttk.Label(search_frame, text="Buscar:").pack(side=tk.LEFT, padx=5)
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self.handle_search)
        ttk.Entry(search_frame, textvariable=self.search_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=5
        )

        ttk.Label(search_frame, text="Categoría:").pack(side=tk.LEFT, padx=5)
        self.category_var = tk.StringVar(value="Todas")
        self.category_combobox = ttk.Combobox(
            search_frame, textvariable=self.category_var, state="readonly"
        )
        self.category_combobox.pack(side=tk.LEFT, padx=5)
        self.update_categories()
        self.category_combobox.bind("<<ComboboxSelected>>", self.handle_search)

        # 3. Filters
        filters_frame = ttk.Frame(top_frame)
        filters_frame.pack(side=tk.LEFT, padx=10)

        self.only_discount_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            filters_frame,
            text="Solo descuento",
            variable=self.only_discount_var,
            command=self.refresh_products,
        ).pack(side=tk.LEFT, padx=5)

        self.only_out_of_stock_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            filters_frame,
            text="Solo sin stock",
            variable=self.only_out_of_stock_var,
            command=self.refresh_products,
        ).pack(side=tk.LEFT, padx=5)

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

        self.min_price_var.trace_add("write", _on_price_change)
        self.max_price_var.trace_add("write", _on_price_change)

        # Quick View
        quick_frame = ttk.Frame(top_frame)
        quick_frame.pack(side=tk.LEFT, padx=10)
        ttk.Label(quick_frame, text="Vista Rápida:").pack(side=tk.LEFT)
        self.quick_view_var = tk.StringVar(value="Todos")
        self.quick_view_combobox = ttk.Combobox(
            quick_frame,
            textvariable=self.quick_view_var,
            state="readonly",
            values=[
                "Todos",
                "Descuentos activos",
                "Sin stock",
                "En stock",
                "Precio >= 10000",
                "Precio <= 2000",
            ],
            width=18,
        )
        self.quick_view_combobox.pack(side=tk.LEFT, padx=5)
        self.quick_view_combobox.bind("<<ComboboxSelected>>", self.apply_quick_view)

        # 4. Filter Actions + Indicator
        actions_frame = ttk.Frame(top_frame)
        actions_frame.pack(side=tk.RIGHT, padx=5)
        ttk.Button(actions_frame, text="Limpiar filtros", command=self.clear_filters).pack(
            side=tk.RIGHT, padx=5
        )
        self.filter_status_var = tk.StringVar(value="Sin filtros")
        ttk.Label(actions_frame, textvariable=self.filter_status_var).pack(
            side=tk.RIGHT, padx=5
        )
        self.update_filter_indicator()

        # 5. Archive toggle
        self.show_archived_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            filters_frame,
            text="Mostrar archivados",
            variable=self.show_archived_var,
            command=self.refresh_products,
        ).pack(side=tk.LEFT, padx=5)

        self._sync_view_toggle_label()

        # 6. Deploy toolbar (below top bar)
        self._deploy_toolbar = ttk.Frame(self.master, style="Status.TFrame")
        self._deploy_toolbar.pack(side=tk.TOP, fill=tk.X, padx=15, pady=(0, 5))
        self.create_deploy_toolbar(self._deploy_toolbar)

    def setup_bottom_bar(self) -> None:
        """Set up the bottom bar with CRUD and bulk actions."""
        # Visual separator
        ttk.Separator(self.master, orient=tk.HORIZONTAL).pack(side=tk.BOTTOM, fill=tk.X)
        
        bottom_frame = ttk.Frame(self.master, style="Toolbar.TFrame")
        bottom_frame.pack(side=tk.BOTTOM, fill=tk.X, padx=15, pady=(5, 15))

        # 1. CRUD Actions (Left)
        crud_frame = ttk.Frame(bottom_frame)
        crud_frame.pack(side=tk.LEFT)

        ttk.Button(crud_frame, text="Agregar", command=self.add_product).pack(
            side=tk.LEFT, padx=2
        )

        self.edit_button = ttk.Button(
            crud_frame, text="Editar", command=self.edit_product, state=tk.DISABLED
        )
        self.edit_button.pack(side=tk.LEFT, padx=2)

        self.delete_button = ttk.Button(
            crud_frame, text="Eliminar", command=self.delete_product, state=tk.DISABLED
        )
        self.delete_button.pack(side=tk.LEFT, padx=2)
        self.history_button = ttk.Button(
            crud_frame, text="Historial...", command=self.show_history, state=tk.DISABLED
        )
        self.history_button.pack(side=tk.LEFT, padx=2)
        self.restore_button = ttk.Button(
            crud_frame, text="Restaurar", command=self.restore_archived, state=tk.DISABLED
        )

        # 2. Bulk Actions (Right - Inner)
        bulk_frame = ttk.Frame(bottom_frame)
        bulk_frame.pack(side=tk.RIGHT, padx=10)

        ttk.Button(
            bulk_frame, text="% Desc.", width=8, command=self.bulk_percentage_discount
        ).pack(side=tk.LEFT, padx=2)
        ttk.Button(
            bulk_frame, text="Desc. fijo", width=10, command=self.bulk_fixed_discount
        ).pack(side=tk.LEFT, padx=2)
        ttk.Button(
            bulk_frame,
            text="Stock ON",
            width=10,
            command=lambda: self.bulk_set_stock(True),
        ).pack(side=tk.LEFT, padx=2)
        ttk.Button(
            bulk_frame,
            text="Stock OFF",
            width=10,
            command=lambda: self.bulk_set_stock(False),
        ).pack(side=tk.LEFT, padx=2)
        ttk.Button(
            bulk_frame,
            text="Precio +%",
            width=10,
            command=lambda: self.bulk_adjust_price(True),
        ).pack(side=tk.LEFT, padx=2)
        ttk.Button(
            bulk_frame,
            text="Precio -%",
            width=10,
            command=lambda: self.bulk_adjust_price(False),
        ).pack(side=tk.LEFT, padx=2)
        ttk.Button(
            bulk_frame,
            text="Cambiar categoría",
            width=14,
            command=self.bulk_change_category,
        ).pack(side=tk.LEFT, padx=2)

        # 3. History (Right - Outer)
        history_frame = ttk.Frame(bottom_frame)
        history_frame.pack(side=tk.RIGHT, padx=5)

        self.undo_btn = ttk.Button(
            history_frame,
            text="Deshacer",
            width=10,
            command=self.undo_last,
            state=tk.DISABLED,
        )
        self.redo_btn = ttk.Button(
            history_frame,
            text="Rehacer",
            width=10,
            command=self.redo_last,
            state=tk.DISABLED,
        )
        self.undo_btn.pack(side=tk.LEFT, padx=2)
        self.redo_btn.pack(side=tk.LEFT, padx=2)
        self._update_archive_controls()

    def setup_status_bar(self) -> None:
        """Set up the status bar with version info."""
        status_frame = ttk.Frame(self.master)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)

        self.status_var = tk.StringVar()
        status_label = ttk.Label(
            status_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W
        )
        status_label.pack(side=tk.LEFT, fill=tk.X, expand=True)

        self.conflict_button = ttk.Button(
            status_frame,
            text="Conflictos (0)",
            width=16,
            command=self.show_sync_conflicts,
            state=tk.DISABLED,
        )
        self.conflict_button.pack(side=tk.RIGHT, padx=(5, 0))

        self.sync_var = tk.StringVar(value="Sincronizado")
        sync_label = ttk.Label(
            status_frame,
            textvariable=self.sync_var,
            relief=tk.SUNKEN,
            anchor=tk.E,
            width=24,
        )
        sync_label.pack(side=tk.RIGHT, padx=(5, 0))

        self.version_var = tk.StringVar()
        version_label = ttk.Label(
            status_frame,
            textvariable=self.version_var,
            relief=tk.SUNKEN,
            anchor=tk.E,
            width=50,
        )
        version_label.pack(side=tk.RIGHT, padx=(5, 0))

        self.update_version_info()
        self.refresh_sync_status()

    def update_version_info(self) -> None:
        """Update version information display."""
        try:
            version_info = self.product_service.get_version_info()
            timestamp = version_info.last_updated.strftime("%Y-%m-%d %H:%M")
            self.version_var.set(
                f"v{version_info.version} | Actualizado: {timestamp}"
            )
        except Exception as exc:
            logger.error("Error al actualizar información de versión: %s", exc)
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
                text=f"Conflictos ({len(conflicts)})", state=tk.NORMAL
            )
        else:
            self.conflict_button.configure(text="Conflictos (0)", state=tk.DISABLED)
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
        self.master.bind("<Control-d>", lambda e: self.duplicate_product())
        self.master.bind("<Delete>", lambda e: self.delete_product())
        self.master.bind("<Control-f>", self.focus_search)
        self.master.bind("<Control-Shift-P>", lambda e: self._on_deploy_click())
        self.master.bind("<Control-Shift-C>", lambda e: self._on_commit_click())

    def add_product(self) -> None:
        """Open dialog to add new product."""
        self.update_categories()
        selected_category = getattr(self, "category_var", None)
        default_category = None
        if isinstance(selected_category, tk.StringVar):
            current = selected_category.get().strip()
            if current and current.lower() != "todas" and self.category_helper:
                default_category = self.category_helper.get_key_from_display(current)
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
                "Advertencia", "Por favor seleccione un producto para editar."
            )
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
        """Delete or purge selected product(s) based on current view mode."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning(
                "Advertencia", "Por favor seleccione uno o más productos."
            )
            return

        products: List[Product] = []
        for item in selected:
            product = self.get_product_by_tree_item(item)
            if product is not None:
                products.append(product)

        if not products:
            return

        show_archived = bool(
            getattr(self, "show_archived_var", tk.BooleanVar(value=False)).get()
        )
        if show_archived:
            action = "purgar"
        else:
            action = "archivar"

        if not messagebox.askyesno(
            "Confirmar",
            f"¿Está seguro de que desea {action} {len(products)} producto(s)?",
        ):
            return

        try:
            if show_archived:
                for product in products:
                    self.product_service.purge_product(
                        product.name, product.description
                    )
                    self._append_activity(
                        "purgar", product.name,
                        f"Precio: ${product.price:,} | Cat: {product.category}"
                    )
                self.update_status(f"{len(products)} producto(s) purgado(s)")
            else:
                for product in products:
                    self.product_service.delete_product(
                        product.name, product.description
                    )
                    self._append_activity(
                        "archivar", product.name,
                        f"Precio: ${product.price:,} | Cat: {product.category}"
                    )
                self.update_status(f"{len(products)} producto(s) archivado(s)")
            self.refresh_products()
        except ProductServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def restore_archived(self) -> None:
        """Restore selected archived products."""
        if not getattr(self, "show_archived_var", tk.BooleanVar(value=False)).get():
            messagebox.showinfo(
                "Restaurar", "La restauración solo está disponible en archivados."
            )
            return
        products = self._get_selected_products()
        if not products:
            messagebox.showwarning(
                "Restaurar", "Seleccione uno o más productos archivados."
            )
            return
        pairs: List[tuple[Product, Product]] = []
        for product in products:
            if not getattr(product, "is_archived", False):
                continue
            data = product.to_dict()
            data["is_archived"] = False
            updated = Product.from_dict(data)
            pairs.append((product, updated))
        if not pairs:
            messagebox.showinfo("Restaurar", "No hay productos archivados seleccionados.")
            return
        self._preview_and_apply_operation(
            f"Restaurar {len(pairs)} producto(s) archivado(s)",
            pairs,
            operation="restaurar",
        )

    def show_history(self) -> None:
        selected = self.tree.selection()
        if len(selected) != 1:
            messagebox.showinfo(
                "Historial", "Seleccione un solo producto para ver el historial."
            )
            return
        product = self.get_product_by_tree_item(selected[0])
        if not product:
            return
        entries = self.product_service.get_product_history(product)

        dialog = tk.Toplevel(self.master)
        dialog.title(f"Historial: {product.name}")
        dialog.transient(self.master)
        dialog.wait_visibility()
        dialog.grab_set()
        dialog.geometry("720x520")

        list_frame = ttk.Frame(dialog)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(12, 6))
        columns = ("ts", "operation")
        tree = ttk.Treeview(
            list_frame, columns=columns, show="headings", height=10, selectmode="browse"
        )
        tree.heading("ts", text="Fecha")
        tree.heading("operation", text="Operación")
        tree.column("ts", width=240, anchor=tk.W)
        tree.column("operation", width=160, anchor=tk.W)
        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=tree.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        tree.configure(yscrollcommand=scrollbar.set)

        if not entries:
            ttk.Label(dialog, text="Sin historial disponible.").pack(
                padx=12, pady=(0, 8), anchor=tk.W
            )
        else:
            for index, entry in enumerate(entries):
                tree.insert(
                    "",
                    "end",
                    iid=str(index),
                    values=(entry.get("ts", ""), entry.get("operation", "")),
                )

        diff_text = tk.Text(dialog, height=10, wrap=tk.WORD)
        diff_text.pack(fill=tk.BOTH, expand=False, padx=12, pady=(0, 8))
        diff_text.configure(state=tk.DISABLED)

        button_frame = ttk.Frame(dialog)
        button_frame.pack(pady=10)
        revert_btn = ttk.Button(
            button_frame, text="Revertir a este estado", state=tk.DISABLED
        )
        revert_btn.pack(side=tk.LEFT, padx=6)
        ttk.Button(button_frame, text="Cerrar", command=dialog.destroy).pack(
            side=tk.LEFT, padx=6
        )

        def _diff_summary(before: Dict[str, Any], after: Dict[str, Any]) -> str:
            ignored = {"field_last_modified", "rev", "order", "ts", "operation"}
            changes = []
            for key in sorted(set(before.keys()) | set(after.keys())):
                if key in ignored:
                    continue
                if before.get(key) != after.get(key):
                    changes.append(
                        f"{key}: {before.get(key)} → {after.get(key)}"
                    )
            if not changes:
                return "Sin cambios detectados."
            return "\n".join(changes)

        def on_select(_event=None):
            selection = tree.selection()
            if not selection:
                revert_btn.config(state=tk.DISABLED)
                return
            try:
                idx = int(selection[0])
            except (TypeError, ValueError):
                revert_btn.config(state=tk.DISABLED)
                return
            entry = entries[idx]
            before = entry.get("before")
            after = entry.get("after")
            if not isinstance(before, dict) or not isinstance(after, dict):
                diff_text.configure(state=tk.NORMAL)
                diff_text.delete("1.0", tk.END)
                diff_text.insert("1.0", "Entrada de historial inválida.")
                diff_text.configure(state=tk.DISABLED)
                revert_btn.config(state=tk.DISABLED)
                return
            diff_text.configure(state=tk.NORMAL)
            diff_text.delete("1.0", tk.END)
            diff_text.insert("1.0", _diff_summary(before, after))
            diff_text.configure(state=tk.DISABLED)
            revert_btn.config(state=tk.NORMAL)

        def on_revert():
            selection = tree.selection()
            if not selection:
                return
            idx = int(selection[0])
            entry = entries[idx]
            snapshot = entry.get("before")
            if not isinstance(snapshot, dict):
                messagebox.showerror("Historial", "Snapshot inválido.")
                return
            preview = (
                f"Revertir el producto al estado anterior a este cambio.\n"
                f"Fecha: {entry.get('ts', '')} | Operación: {entry.get('operation', '')}\n"
                "Esto sobrescribirá el producto actual."
            )
            if not messagebox.askyesno("Confirmar reversión", preview):
                return
            try:
                snapshot_product = Product.from_dict(snapshot)
                self.product_service.revert_product_to_snapshot(
                    product, snapshot_product
                )
            except DuplicateProductError as exc:
                messagebox.showerror("Historial", str(exc))
                return
            except ProductServiceError as exc:
                messagebox.showerror("Historial", str(exc))
                return
            self.refresh_products()
            self.update_status("Producto revertido")
            dialog.destroy()

        tree.bind("<<TreeviewSelect>>", on_select)
        revert_btn.config(command=on_revert)

    def _build_filter_criteria(self) -> ProductFilterCriteria:
        """Build filter criteria from current UI state."""
        criteria = ProductFilterCriteria()
        query = self.search_var.get().strip()
        category_label = self.category_var.get()

        if category_label != "Todas" and self.category_helper:
            key = self.category_helper.get_key_from_display(category_label)
            if key:
                criteria.category = key

        if query:
            criteria.query = query

        if hasattr(self, "only_discount_var") and self.only_discount_var.get():
            criteria.only_discount = True

        if (
            hasattr(self, "only_out_of_stock_var")
            and self.only_out_of_stock_var.get()
        ):
            criteria.only_out_of_stock = True

        if getattr(self, "_only_in_stock_override", False):
            criteria.only_in_stock = True

        if hasattr(self, "min_price_var"):
            try:
                criteria.min_price = float(self.min_price_var.get())
            except (ValueError, TypeError):
                pass
        if hasattr(self, "max_price_var"):
            try:
                criteria.max_price = float(self.max_price_var.get())
            except (ValueError, TypeError):
                pass
        if hasattr(self, "show_archived_var"):
            criteria.show_archived_only = bool(self.show_archived_var.get())

        return criteria

    def refresh_products(self) -> None:
        """Refresh the product list."""
        self.update_categories()
        try:
            criteria = self._build_filter_criteria()
            products = self.product_service.filter_products(criteria)

            self.populate_tree(products)
            self.update_status(f"Mostrando {len(products)} productos")
            self.update_filter_indicator()
            self._update_archive_controls()
            self._refresh_stats_dashboard()
        except ProductServiceError as exc:
            messagebox.showerror("Error", f"Error al cargar productos: {str(exc)}")

    def apply_quick_view(self, *_):
        """Apply quick view presets by adjusting filters and refreshing."""
        view = self.quick_view_var.get()
        # Reset base filters
        self._only_in_stock_override = False
        if hasattr(self, "only_discount_var"):
            self.only_discount_var.set(False)
        if hasattr(self, "only_out_of_stock_var"):
            self.only_out_of_stock_var.set(False)
        if hasattr(self, "min_price_var"):
            self.min_price_var.set("")
        if hasattr(self, "max_price_var"):
            self.max_price_var.set("")

        if view == "Descuentos activos":
            self.only_discount_var.set(True)
        elif view == "Sin stock":
            self.only_out_of_stock_var.set(True)
        elif view == "En stock":
            self._only_in_stock_override = True
        elif view == "Precio >= 10000":
            self.min_price_var.set("10000")
        elif view == "Precio <= 2000":
            self.max_price_var.set("2000")

        self.refresh_products()

    def populate_tree(self, products: List[Product]) -> None:
        """Populate treeview or gallery with products."""
        self._current_products = products  # Store for switching views

        if self.view_mode == "list":
            if self.gallery.winfo_ismapped():
                self.gallery.pack_forget()
            if self.tree_frame and not self.tree_frame.winfo_ismapped():
                self.tree_frame.pack(fill=tk.BOTH, expand=True)

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
                    ),
                )
            self.treeview_manager.update_sort_indicators()

        else:  # Gallery
            if self.tree_frame and self.tree_frame.winfo_ismapped():
                self.tree_frame.pack_forget()
            if not self.gallery.winfo_ismapped():
                self.gallery.pack(fill=tk.BOTH, expand=True)

            self.gallery.render_products(products)

    def toggle_view(self) -> None:
        if self.view_mode == "list":
            self.view_mode = "gallery"
        else:
            self.view_mode = "list"
        self.config.view_mode = self.view_mode
        self._sync_view_toggle_label()
        self._schedule_config_save()

        # Refresh current view with last known products
        if hasattr(self, "_current_products"):
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
        if not category_value or not self.category_helper:
            return ""
        return self.category_helper.get_display_for_key(category_value)

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

            if self.category_helper is None:
                self.category_helper = CategoryHelper(choices)
            else:
                self.category_helper.update_choices(choices)

            display_values = ["Todas"] + self.category_helper.display_values
            if hasattr(self, "category_combobox"):
                self.category_combobox["values"] = display_values

            if current_selection != "Todas":
                # Verify if current selection is still valid
                if current_selection in display_values:
                    pass
                else:
                    # Try to map key to display if value persists
                    key = self.category_helper.get_key_from_display(current_selection)
                    mapped_label = self.category_helper.get_display_for_key(key)
                    if mapped_label and mapped_label in display_values:
                        self.category_var.set(mapped_label)
                    else:
                        self.category_var.set("Todas")
        except (ProductServiceError, CategoryServiceError) as exc:
            messagebox.showerror("Error", f"Error al cargar categorías: {str(exc)}")

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
            project_root=self.project_root,
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

    def manage_storefront_bundles(self) -> None:
        """Open the storefront bundles management dialog."""
        if not self.storefront_bundle_service:
            messagebox.showinfo(
                "Combos listos",
                "La gestión de combos no está disponible en esta instalación.",
            )
            return
        try:
            products = self.product_service.get_all_products()
            dialog = StorefrontBundlesDialog(
                self.master,
                self.storefront_bundle_service,
                products,
                on_saved=lambda: self.update_status("Combos listos actualizados."),
            )
        except (ProductServiceError, StorefrontBundleError) as exc:
            messagebox.showerror("Combos listos", str(exc))
            return
        self.master.wait_window(dialog)

    def manage_featured_staples(self) -> None:
        """Open the featured staples management dialog."""
        if not self.featured_staples_service:
            messagebox.showinfo(
                "Favoritos",
                "La gestión de favoritos no está disponible en esta instalación.",
            )
            return
        try:
            products = self.product_service.get_all_products()
            dialog = FeaturedStaplesDialog(
                self.master,
                self.featured_staples_service,
                products,
                on_saved=lambda: self.update_status("Favoritos actualizados."),
            )
        except (ProductServiceError, FeaturedStaplesError) as exc:
            messagebox.showerror("Favoritos", str(exc))
            return
        self.master.wait_window(dialog)

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
        self.logger.debug("Status: %s", message)

    def _update_archive_controls(self) -> None:
        show_archived = bool(
            getattr(self, "show_archived_var", tk.BooleanVar(value=False)).get()
        )
        selected = bool(self.tree.selection()) if hasattr(self, "tree") else False
        if show_archived:
            if hasattr(self, "restore_button"):
                if not self.restore_button.winfo_ismapped():
                    self.restore_button.pack(side=tk.LEFT, padx=2)
                self.restore_button.config(
                    state=tk.NORMAL if selected else tk.DISABLED
                )
            if hasattr(self, "delete_button"):
                self.delete_button.config(
                    text="Purgar",
                    state=tk.NORMAL if selected else tk.DISABLED,
                )
        else:
            if hasattr(self, "restore_button") and self.restore_button.winfo_ismapped():
                self.restore_button.pack_forget()
            if hasattr(self, "delete_button"):
                self.delete_button.config(
                    text="Eliminar",
                    state=tk.NORMAL if selected else tk.DISABLED,
                )

    def handle_selection(self, _event: Optional[tk.Event] = None) -> None:
        """Handle selection in treeview."""
        selected = self.tree.selection()
        if selected:
            self.edit_button.config(state=tk.NORMAL)
            self.delete_button.config(state=tk.NORMAL)
            if hasattr(self, "history_button"):
                self.history_button.config(
                    state=tk.NORMAL if len(selected) == 1 else tk.DISABLED
                )
            if len(selected) == 1:
                product = self.get_product_by_tree_item(selected[0])
                if product:
                    self.update_status(
                        f"Seleccionado: {product.name} - Precio: ${product.price:,} - "
                        f"Categoría: {product.category}"
                    )
            else:
                self.update_status(f"{len(selected)} productos seleccionados")
        else:
            self.edit_button.config(state=tk.DISABLED)
            self.delete_button.config(state=tk.DISABLED)
            if hasattr(self, "history_button"):
                self.history_button.config(state=tk.DISABLED)
            self.update_status("No hay productos seleccionados")
        self._update_archive_controls()

    def handle_search(self, *_args) -> None:
        """Handle search and category filter changes."""
        self.refresh_products()

    def focus_search(self, _event: Optional[tk.Event] = None) -> None:
        """Focus the search entry."""
        search_entry = self.master.focus_get()
        if isinstance(search_entry, tk.Entry):
            search_entry.select_range(0, tk.END)

    def reorder_products(self, new_index: int) -> None:
        """Reorder products after drag and drop."""
        products = self.product_service.get_all_products()
        start_index = self._drag_data.get("start_index")
        if not isinstance(start_index, int) or start_index < 0:
            return
        item = products.pop(start_index)
        products.insert(new_index, item)

        try:
            self.product_service.reorder_products(products)
            self.update_status("Productos reordenados exitosamente")
        except Exception as exc:
            messagebox.showerror("Error", f"Error al reordenar productos: {str(exc)}")
            self.refresh_products()

    def clear_filters(self) -> None:
        """Reset all filters to their default values."""
        self._only_in_stock_override = False
        if hasattr(self, "search_var"):
            self.search_var.set("")
        if hasattr(self, "category_var"):
            self.category_var.set("Todas")
        if hasattr(self, "only_discount_var"):
            self.only_discount_var.set(False)
        if hasattr(self, "only_out_of_stock_var"):
            self.only_out_of_stock_var.set(False)
        if hasattr(self, "min_price_var"):
            self.min_price_var.set("")
        if hasattr(self, "max_price_var"):
            self.max_price_var.set("")
        if hasattr(self, "quick_view_var"):
            self.quick_view_var.set("Todos")
        self.refresh_products()

    def update_filter_indicator(self) -> None:
        """Update indicator showing whether filters are active."""
        active = False
        if hasattr(self, "search_var") and self.search_var.get().strip():
            active = True
        if hasattr(self, "category_var"):
            category_label = self.category_var.get().strip()
            if category_label and category_label != "Todas":
                active = True
        if hasattr(self, "only_discount_var") and self.only_discount_var.get():
            active = True
        if hasattr(self, "only_out_of_stock_var") and self.only_out_of_stock_var.get():
            active = True
        if getattr(self, "_only_in_stock_override", False):
            active = True
        if hasattr(self, "min_price_var") and self.min_price_var.get().strip():
            active = True
        if hasattr(self, "max_price_var") and self.max_price_var.get().strip():
            active = True
        if hasattr(self, "quick_view_var"):
            if self.quick_view_var.get().strip() and self.quick_view_var.get() != "Todos":
                active = True
        if hasattr(self, "filter_status_var"):
            self.filter_status_var.set("Filtros activos" if active else "Sin filtros")

    def _get_selected_products(self) -> List[Product]:
        selected = self.tree.selection()
        products: List[Product] = []
        for item in selected:
            p = self.get_product_by_tree_item(item)
            if p:
                products.append(p)
        return products


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
                    order=product.order,
                )
                self.product_service.update_product(
                    product.name, updated, product.description
                )
                self.tree.set(row, "stock", "☑" if updated.stock else "☐")
                stock_label = "En stock" if updated.stock else "Sin stock"
                self.update_status(
                    f"Stock de '{product.name}' actualizado: {stock_label}"
                )
                self._append_activity("stock", product.name, stock_label)
            except Exception as exc:
                messagebox.showerror(
                    "Error", f"No se pudo actualizar el stock: {str(exc)}"
                )
        elif col_key in ("price", "discount"):
            # Start inline editor for numeric fields
            self._begin_inline_edit(row, col, col_key)
        else:
            # Open edit dialog for the double-clicked row
            try:
                self.tree.selection_set(row)
                self.tree.focus(row)
                self.edit_product()
            except Exception as exc:
                messagebox.showerror("Error", f"No se pudo abrir el editor: {str(exc)}")

    def _begin_inline_edit(self, item: str, col_id: str, field: str) -> None:
        # Close any existing editor
        self._end_inline_edit()

        # Get cell bbox
        bbox = self.tree.bbox(item, col_id)
        if not bbox:
            return
        x, y, w, h = bbox

        product = self.get_product_by_tree_item(item)
        if not product:
            return

        # Determine initial value (format with thousands separator for price/discount)
        raw_value = getattr(product, field) or 0
        if field in ("price", "discount"):
            initial_value = f"{raw_value:,}"
        else:
            initial_value = str(raw_value)

        # Create entry editor
        entry = ttk.Entry(self.tree)
        entry.insert(0, initial_value)
        entry.select_range(0, tk.END)
        entry.focus_set()
        entry.place(x=x, y=y, width=w, height=h)

        self._cell_editor = entry
        self._cell_editor_info = {
            "item": item,
            "col_id": col_id,
            "field": field,
            "original": product,
        }

        def commit(_evt=None):
            self._commit_inline_edit()

        def cancel(_evt=None):
            self._end_inline_edit()

        bind_submit_keys(entry, commit)
        entry.bind("<FocusOut>", commit)
        entry.bind("<Escape>", cancel)

    def _commit_inline_edit(self) -> None:
        # Multiple early returns keep validation and UI feedback readable.
        # pylint: disable=too-many-return-statements
        if not self._cell_editor:
            return
        try:
            value_str = self._cell_editor.get().strip()
            info = self._cell_editor_info
            item = info.get("item")
            field = info.get("field")
            if not isinstance(item, str) or not isinstance(field, str):
                self._end_inline_edit()
                return
            product = self.get_product_by_tree_item(item)
            if not product:
                self._end_inline_edit()
                return

            # Parse integer (strip thousands separator before parsing)
            cleaned_str = value_str.replace(",", "")
            try:
                new_val = int(cleaned_str)
            except ValueError:
                messagebox.showerror(
                    "Valor inválido", "Ingrese un número entero válido."
                )
                self._cell_editor.focus_set()
                return

            if field == "price" and new_val <= 0:
                messagebox.showerror(
                    "Valor inválido", "El precio debe ser mayor que cero."
                )
                self._cell_editor.focus_set()
                return
            if field == "discount" and new_val < 0:
                messagebox.showerror(
                    "Valor inválido", "El descuento no puede ser negativo."
                )
                self._cell_editor.focus_set()
                return

            # Build updated product with validated values
            price = new_val if field == "price" else product.price
            discount = new_val if field == "discount" else product.discount

            # Validate discount < price
            if discount >= price:
                messagebox.showerror(
                    "Valor inválido",
                    "El descuento no puede ser mayor o igual al precio.",
                )
                self._cell_editor.focus_set()
                return
            updated = Product(
                name=product.name,
                description=product.description,
                price=price,
                discount=discount,
                stock=product.stock,
                category=product.category,
                image_path=product.image_path,
                image_avif_path=product.image_avif_path,
                order=product.order,
            )

            # Persist change
            self.product_service.update_product(
                product.name, updated, product.description
            )

            # Update tree cell display (formatted)
            if field == "price":
                self.tree.set(item, "price", f"{updated.price:,}")
            elif field == "discount":
                self.tree.set(
                    item,
                    "discount",
                    f"{updated.discount:,}" if updated.discount else "",
                )

            self.update_status(f"{field.capitalize()} de '{product.name}' actualizado.")
            self._append_activity(f"editar-{field}", product.name, f"{field.capitalize()}: {new_val}")
        except Exception as exc:
            messagebox.showerror("Error", f"No se pudo guardar el cambio: {str(exc)}")
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



    def run_integrity_check(self) -> None:
        """Run a read-only integrity check on product data."""
        try:
            products = self.product_service.get_all_products()
        except Exception as exc:
            messagebox.showerror("Chequeo de integridad", str(exc))
            return

        assets_root = None
        if self.project_root:
            assets_root = Path(self.project_root) / "assets" / "images"
        else:
            assets_root = Path(__file__).resolve().parents[3] / "assets" / "images"
        assets_root = assets_root.resolve()

        missing_images: list[str] = []
        invalid_categories: list[str] = []
        invalid_numbers: list[str] = []

        for product in products:
            for label, rel_path in (
                ("imagen", product.image_path),
                ("avif", product.image_avif_path),
            ):
                if not rel_path:
                    continue
                cleaned = str(rel_path).strip().replace("\\", "/")
                if not cleaned.startswith("assets/images/"):
                    missing_images.append(
                        f"{product.name}: {label} fuera de assets/images ({cleaned})"
                    )
                    continue
                relative = cleaned[len("assets/images/") :]
                abs_path = (assets_root / relative).resolve()
                try:
                    abs_path.relative_to(assets_root)
                except ValueError:
                    missing_images.append(
                        f"{product.name}: {label} fuera de assets/images ({cleaned})"
                    )
                    continue
                if not abs_path.exists():
                    missing_images.append(
                        f"{product.name}: {label} no encontrada ({cleaned})"
                    )

            if self.category_service and product.category:
                try:
                    match = self.category_service.find_category_by_product_key(
                        product.category
                    )
                except Exception:
                    match = None
                if not match:
                    invalid_categories.append(
                        f"{product.name}: categoría inválida ({product.category})"
                    )

            if product.price <= 0 or product.discount >= product.price:
                invalid_numbers.append(
                    f"{product.name}: precio={product.price}, descuento={product.discount}"
                )

        max_examples = 5
        sections = []
        if missing_images:
            sections.append(
                "Imágenes faltantes: "
                f"{len(missing_images)}\n"
                + "\n".join(f"- {item}" for item in missing_images[:max_examples])
            )
        if invalid_categories:
            sections.append(
                "Categorías inválidas: "
                f"{len(invalid_categories)}\n"
                + "\n".join(f"- {item}" for item in invalid_categories[:max_examples])
            )
        if invalid_numbers:
            sections.append(
                "Valores numéricos inválidos: "
                f"{len(invalid_numbers)}\n"
                + "\n".join(f"- {item}" for item in invalid_numbers[:max_examples])
            )

        if not sections:
            messagebox.showinfo(
                "Chequeo de integridad", "sin problemas encontrados"
            )
            return

        report = "\n\n".join(sections)
        messagebox.showwarning("Chequeo de integridad", report)

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

    # ------------------------------------------------------------------
    #  Context Menu (right-click)
    # ------------------------------------------------------------------

    def _setup_context_menu(self) -> None:
        """Bind right-click context menu to the treeview."""
        if not hasattr(self, "tree"):
            return
        self.tree.bind("<Button-3>" if not self._is_macos() else "<Button-2>", self._show_context_menu)

    @staticmethod
    def _is_macos() -> bool:
        import sys
        return sys.platform == "darwin"

    def _show_context_menu(self, event: tk.Event) -> None:
        """Display right-click context menu for selected products."""
        builder = ContextMenuBuilder(self.master)

        selected = list(self.tree.selection())
        item = self.tree.identify_row(event.y)
        if item:
            self.tree.selection_set(item)
            selected = [item]

        if not selected:
            builder.add_command("Agregar producto...", command=self.add_product)
            builder.build()
            builder.show(event.x_root, event.y_root)
            return

        builder.add_command(
            "Editar...", command=self.edit_product, accelerator="Ctrl+E"
        )
        builder.add_command(
            "Duplicar", command=self.duplicate_product, accelerator="Ctrl+D"
        )
        builder.add_command(
            "Alternar stock", command=self._toggle_stock_context,
        )
        builder.add_separator()

        show_archived = bool(
            getattr(self, "show_archived_var", tk.BooleanVar(value=False)).get()
        )
        if show_archived:
            builder.add_command(
                "Purgar permanentemente",
                command=self.delete_product,
                accelerator="Supr",
            )
            builder.add_command(
                "Restaurar", command=self.restore_archived,
            )
        else:
            builder.add_command(
                "Archivar", command=self.delete_product, accelerator="Supr",
            )

        builder.add_separator()
        builder.add_command(
            "Historial...", command=self.show_history,
        )
        builder.add_command(
            "Ver imagen", command=self._context_open_image,
        )

        builder.build()
        builder.show(event.x_root, event.y_root)

    def _toggle_stock_context(self) -> None:
        """Toggle stock state for selected product via context menu."""
        selected = self.tree.selection()
        if not selected:
            return
        for item in selected:
            product = self.get_product_by_tree_item(item)
            if not product:
                continue
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
                    order=product.order,
                )
                self.product_service.update_product(
                    product.name, updated, product.description
                )
                self.tree.set(item, "stock", "☑" if updated.stock else "☐")
                stock_label = "En stock" if updated.stock else "Sin stock"
                self.update_status(f"Stock de '{product.name}': {stock_label}")
                if self.toast_manager:
                    self.toast_manager.show(f"Stock actualizado: {stock_label}", ToastLevel.SUCCESS)
            except Exception as exc:
                messagebox.showerror("Error", f"No se pudo actualizar stock: {str(exc)}")
        self.refresh_products()

    def _context_open_image(self) -> None:
        """Open image of selected product via context menu."""
        selected = self.tree.selection()
        if not selected:
            return
        product = self.get_product_by_tree_item(selected[0])
        if not product:
            return
        import webbrowser
        assets_root = (
            Path(self.project_root) / "assets" / "images"
            if self.project_root
            else Path(__file__).resolve().parents[3] / "assets" / "images"
        )
        for path_field in ("image_path", "image_avif_path"):
            rel = getattr(product, path_field, "")
            if not rel:
                continue
            clean = rel.strip().replace("\\", "/")
            if clean.startswith("assets/images/"):
                clean = clean[len("assets/images/"):]
            abs_path = assets_root / clean
            if abs_path.exists():
                webbrowser.open(abs_path.as_uri())
                return
        messagebox.showinfo("Imagen", "Este producto no tiene imagen asociada.")

    def duplicate_product(self) -> None:
        """Duplicate the selected product."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Duplicar", "Seleccione un producto para duplicar.")
            return
        product = self.get_product_by_tree_item(selected[0])
        if not product:
            return
        try:
            new_product = Product(
                name=f"{product.name} (copia)",
                description=product.description,
                price=product.price,
                discount=product.discount,
                stock=product.stock,
                category=product.category,
                image_path=product.image_path,
                image_avif_path=product.image_avif_path,
                order=0,
            )
            self.product_service.add_product(new_product)
            self._append_activity(
                "duplicar", new_product.name,
                f"Origen: {product.name} | Precio: ${product.price:,}"
            )
            self.refresh_products()
            if self.toast_manager:
                self.toast_manager.show(f"Producto '{product.name}' duplicado.", ToastLevel.SUCCESS)
        except DuplicateProductError as exc:
            messagebox.showerror("Duplicado", str(exc))
        except ProductServiceError as exc:
            messagebox.showerror("Error", str(exc))

    # ------------------------------------------------------------------
    #  Theme toggle
    # ------------------------------------------------------------------

    def _toggle_theme(self) -> None:
        new_theme = self._theme_manager.toggle_theme()
        is_dark = new_theme == AppTheme.DARK
        self.update_theme_toasts(dark_mode=is_dark)
        self._theme_manager.save_preference()
        self.refresh_products()

