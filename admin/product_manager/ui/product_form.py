import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from typing import List, Optional, Callable, Dict, Any, Tuple
import os
from pathlib import Path
import shutil
import time
import logging
from models import Product
from services import ProductService, ProductServiceError
from .utils import PIL_AVAILABLE, PIL_WEBP, PIL_AVIF, Image, ImageTk, CategoryHelper

logger = logging.getLogger(__name__)

class ProductFormDialog(tk.Toplevel):
    """Dialog for adding/editing products."""

    def __init__(
        self,
        parent: tk.Tk,
        title: str,
        product_service: ProductService,
        product: Optional[Product] = None,
        on_save: Optional[Callable[[], None]] = None,
        default_category: Optional[str] = None,
        category_choices: Optional[List[Tuple[str, str]]] = None,
    ):
        super().__init__(parent)
        self.title(title)
        self.product_service = product_service
        self.product = product
        self.on_save = on_save
        self.default_category = default_category
        if category_choices is not None:
            self.category_choices = list(category_choices)
        else:
            try:
                self.category_choices = self.product_service.get_category_choices()
            except ProductServiceError:
                self.category_choices = [
                    (category, category)
                    for category in self.product_service.get_categories()
                ]

        self.category_helper = CategoryHelper(self.category_choices)
        self.category_combobox: Optional[ttk.Combobox] = None

        temp_entry = ttk.Entry(self)
        self.default_font = temp_entry.cget('font')
        temp_entry.destroy()

        self._preview_warning_shown = False
        self._preview_warning_shown_avif = False
        self.logger = logger
        self.setup_dialog()
        self.populate_fields()
        self._center_on_parent()

    # Category helper methods moved to ui/utils.py



    def setup_dialog(self) -> None:
        """Set up dialog window."""
        # Make the dialog large enough and resizable so all content fits
        self.geometry("700x700")
        self.minsize(700, 660)
        self.resizable(True, True)
        self.transient(self.master)
        self.grab_set()

        # Layout: main content frame plus persistent button bar
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        self.main_frame = ttk.Frame(self, padding="10")
        self.main_frame.grid(row=0, column=0, sticky="nsew")

        # Let the input column expand when the window grows
        try:
            self.main_frame.columnconfigure(1, weight=1)
        except Exception as exc:
            self.logger.debug("No se pudo configurar la columna principal: %s", exc)
        self.create_widgets()
        self.create_buttons()

    def create_widgets(self) -> None:
        """Create form widgets."""
        self.entries: Dict[str, tk.Widget] = {}
        fields = [
            ("name", "Nombre:", ttk.Entry, {"width": 40}),
            ("description", "Descripción:",
             tk.Text, {"width": 40, "height": 3}),
            ("price", "Precio:", ttk.Entry, {"width": 40}),
            ("discount", "Descuento:", ttk.Entry, {"width": 40}),
            ("stock", "En Stock:", tk.Checkbutton, {}),
            ("category", "Categoría:", ttk.Combobox, {"width": 39}),
            ("image_path", "Ruta de Imagen:", ttk.Entry, {"width": 40}),
            ("image_avif_path", "Ruta imagen AVIF (opcional):",
             ttk.Entry, {"width": 40}),
        ]
        for i, (field, label, widget_class, widget_opts) in enumerate(fields):
            label_widget = ttk.Label(self.main_frame, text=label)
            label_widget.grid(row=i, column=0, sticky=tk.W,
                              padx=(0, 10), pady=5)
            if widget_class == tk.Checkbutton:
                var = tk.BooleanVar(value=True)
                widget = widget_class(self.main_frame, variable=var)
                self.entries[field] = var
                widget.grid(row=i, column=1, sticky=tk.W, pady=5)
            elif widget_class == ttk.Combobox:
                values = self.category_helper.display_values
                state = "readonly" if values else "normal"
                widget = widget_class(
                    self.main_frame,
                    values=values,
                    state=state,
                    **widget_opts
                )
                self.entries[field] = widget
                if field == "category":
                    self.category_combobox = widget
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
                widget.bind("<<ComboboxSelected>>",
                            self._on_category_change)
                widget.bind("<FocusOut>", self._on_category_change)
            elif widget_class == tk.Text:
                widget = widget_class(
                    self.main_frame, font=self.default_font, **widget_opts)
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
                widget.bind("<Tab>", self._focus_next)  # Agrega este binding
                self.entries[field] = widget
            else:
                widget = widget_class(self.main_frame, **widget_opts)
                self.entries[field] = widget
                widget.grid(row=i, column=1, sticky=tk.EW, pady=5)
            if field == "image_path":
                ttk.Button(self.main_frame, text="Explorar...", command=self.browse_image, width=15).grid(
                    row=i, column=2, padx=(5, 0), pady=5)
                # Update preview when typing a path
                widget.bind("<KeyRelease>",
                            lambda _e: self._update_image_preview())
            if field == "image_avif_path":
                ttk.Button(self.main_frame, text="Explorar AVIF...", command=self.browse_avif_image, width=15).grid(
                    row=i, column=2, padx=(5, 0), pady=5)

        # Image processing options
        options_row = len(fields)
        self.convert_webp_var = tk.BooleanVar(value=False)
        self.resize_opt_var = tk.BooleanVar(value=True)
        opts_frame = ttk.Frame(self.main_frame)
        opts_frame.grid(row=options_row, column=0,
                        columnspan=3, sticky=tk.W, pady=(0, 6))
        ttk.Checkbutton(opts_frame, text="Convertir a WebP", variable=self.convert_webp_var,
                        state=(tk.NORMAL if PIL_AVAILABLE else tk.DISABLED)).pack(side=tk.LEFT, padx=(0, 10))
        ttk.Checkbutton(opts_frame, text="Optimizar tamaño (máx 1000px)", variable=self.resize_opt_var,
                        state=(tk.NORMAL if PIL_AVAILABLE else tk.DISABLED)).pack(side=tk.LEFT)

        # Preview area (fixed-size canvas to avoid stretching on resize)
        self.preview_label = ttk.Label(self.main_frame, text="Vista previa")
        preview_row = options_row + 1
        self.preview_label.grid(row=preview_row, column=0, sticky=tk.W)
        self._preview_w = self._preview_h = 240
        self.preview_canvas = tk.Canvas(
            self.main_frame,
            width=self._preview_w,
            height=self._preview_h,
            bg="#fafafa",
            highlightthickness=1,
            relief=tk.SOLID,
            bd=1,
        )
        self.preview_canvas.grid(
            row=preview_row, column=1, sticky=tk.W, pady=4)
        # Quick-open image in OS viewer
        open_btn = ttk.Button(
            self.main_frame, text="Abrir imagen…", command=self._open_image_file)
        open_btn.grid(row=options_row+1, column=2, sticky=tk.W)
        self._preview_photo = None
        self._update_image_preview()

    def _focus_next(self, event):
        """Transfiere el foco al siguiente widget y evita la inserción de un tabulador."""
        event.widget.tk_focusNext().focus()
        return "break"

    def create_buttons(self) -> None:
        """Create dialog buttons."""
        button_frame = ttk.Frame(self, padding=(10, 5))
        button_frame.grid(
            row=1, column=0, sticky=tk.E, pady=(10, 15), padx=(10, 16)
        )
        button_frame.grid_columnconfigure(0, weight=1)
        ttk.Frame(button_frame).grid(row=0, column=0, sticky="ew")
        ttk.Button(
            button_frame, text="Guardar", command=self.save_product, width=10
        ).grid(row=0, column=1, padx=5)
        ttk.Button(
            button_frame, text="Cancelar", command=self.destroy, width=10
        ).grid(row=0, column=2, padx=5)

    def populate_fields(self) -> None:
        """Populate form fields with product data."""
        if self.product:
            for field, widget in self.entries.items():
                value = getattr(self.product, field)
                if isinstance(widget, tk.BooleanVar):
                    widget.set(value)
                elif isinstance(widget, tk.Text):
                    widget.delete("1.0", tk.END)
                    widget.insert("1.0", str(value))
                elif isinstance(widget, ttk.Combobox):
                    if field == "category":
                        widget.set(self.category_helper.get_display_for_key(str(value)))
                    else:
                        widget.set(str(value))
                else:
                    widget.delete(0, tk.END)
                    widget.insert(0, str(value))
            # Ensure image preview syncs with populated image_path
            try:
                self._update_image_preview()
            except Exception as exc:
                self.logger.debug("No se pudo actualizar la vista previa: %s", exc)
        else:
            self._prefill_category()

    def browse_image(self) -> None:
        """Open file dialog to select image."""
        file_path = filedialog.askopenfilename(
            filetypes=[("Archivos de imagen", "*.png *.jpg *.jpeg *.gif *.webp")])
        if not file_path:
            return
        try:
            base_dir = Path(self._assets_images_root()).resolve()
            src_path = Path(file_path).resolve()
            cat_widget = self.entries.get("category")
            if isinstance(cat_widget, ttk.Combobox):
                current_category = self.category_helper.get_key_from_display(cat_widget.get())
            else:
                current_category = ""
            dest_dir, category_updated = self._resolve_destination_directory(
                src_path, base_dir, current_category, cat_widget)
            filename = src_path.name
            name_no_ext, ext = os.path.splitext(filename)

            dest_dir.mkdir(parents=True, exist_ok=True)

            if PIL_AVAILABLE and (self.convert_webp_var.get() or self.resize_opt_var.get()):
                target_ext = '.webp' if self.convert_webp_var.get() else ext
                dest_path = dest_dir / f"{name_no_ext}{target_ext}"
                img = None
                try:
                    with Image.open(src_path) as src_img:
                        img = src_img.copy()
                    if self.resize_opt_var.get():
                        img.thumbnail((1000, 1000))
                    save_params = {}
                    if target_ext.lower() == '.webp':
                        save_params = {"format": "WEBP", "quality": 85}
                    img.save(dest_path, **save_params)
                except Exception:
                    dest_path = dest_dir / filename
                    if src_path != dest_path:
                        shutil.copy2(src_path, dest_path)
                finally:
                    if img is not None:
                        try:
                            img.close()
                        except Exception as exc:
                            self.logger.debug("No se pudo cerrar la imagen previa: %s", exc)
            else:
                dest_path = dest_dir / filename
                if src_path != dest_path:
                    shutil.copy2(src_path, dest_path)

            rel_path = dest_path.relative_to(base_dir).as_posix()
            rel_path = 'assets/images/' + rel_path
            self.entries["image_path"].delete(0, tk.END)
            self.entries["image_path"].insert(0, rel_path)
            self._update_image_preview()

            # If there is an AVIF counterpart in the same directory, pre-fill the field
            avif_entry = self.entries.get("image_avif_path")
            if isinstance(avif_entry, ttk.Entry):
                guessed_avif = dest_dir / f"{name_no_ext}.avif"
                if guessed_avif.exists():
                    avif_rel = guessed_avif.relative_to(base_dir).as_posix()
                    avif_entry.delete(0, tk.END)
                    avif_entry.insert(0, f'assets/images/{avif_rel}')
            if category_updated:
                self._on_category_change()
        except Exception as e:
            messagebox.showerror(
                "Error", f"Error al copiar la imagen: {str(e)}")

    def browse_avif_image(self) -> None:
        """Open file dialog to select an AVIF image."""
        file_path = filedialog.askopenfilename(
            filetypes=[("Imágenes AVIF", "*.avif")])
        if not file_path:
            return
        try:
            base_dir = Path(self._assets_images_root()).resolve()
            cat_widget = self.entries.get("category")
            if isinstance(cat_widget, ttk.Combobox):
                category = self.category_helper.get_key_from_display(cat_widget.get())
            else:
                category = ""
            src_path = Path(file_path).resolve()
            dest_dir, category_updated = self._resolve_destination_directory(
                src_path, base_dir, category, cat_widget)
            dest_dir.mkdir(parents=True, exist_ok=True)

            filename = os.path.basename(file_path)
            if not filename.lower().endswith('.avif'):
                filename = os.path.splitext(filename)[0] + '.avif'
            dest_path = dest_dir / filename

            if src_path != dest_path:
                last_error: Optional[Exception] = None
                for attempt in range(5):
                    try:
                        shutil.copy2(src_path, dest_path)
                        last_error = None
                        break
                    except OSError as copy_err:
                        last_error = copy_err
                        if getattr(copy_err, "winerror", None) not in (32,):
                            raise
                        time.sleep(0.3 * (attempt + 1))
                if last_error:
                    raise PermissionError(
                        f"{last_error} (origen: {src_path}, destino: {dest_path})"
                    ) from last_error

            rel_path = dest_path.relative_to(base_dir).as_posix()
            rel_path = 'assets/images/' + rel_path
            entry = self.entries.get("image_avif_path")
            if isinstance(entry, ttk.Entry):
                entry.delete(0, tk.END)
                entry.insert(0, rel_path)
            self._ensure_fallback_for_avif()
            if category_updated:
                self._on_category_change()
            self._update_image_preview()
        except Exception as e:
            messagebox.showerror(
                "Error", f"Error al copiar la imagen AVIF: {str(e)}")

    def save_product(self) -> None:
        """Save product data."""
        try:
            data = self.validate_and_get_data()
            product = Product(**data)
            if self.product:
                self.product_service.update_product(
                    self.product.name, product, self.product.description)
            else:
                self.product_service.add_product(product)
            if self.on_save:
                self.on_save()
            self.destroy()
        except (ValueError, ProductServiceError) as e:
            messagebox.showerror("Error", str(e))

    def validate_and_get_data(self) -> Dict[str, Any]:
        """Validate and collect form data."""
        # Try to infer fallback image if the user only selected AVIF
        self._ensure_fallback_for_avif()

        data = {}
        for field, widget in self.entries.items():
            if isinstance(widget, tk.BooleanVar):
                data[field] = widget.get()
            elif isinstance(widget, tk.Text):
                data[field] = widget.get("1.0", tk.END).strip()
            elif isinstance(widget, ttk.Combobox):
                value = widget.get().strip()
                if field == "category":
                    data[field] = self.category_helper.get_key_from_display(value)
                else:
                    data[field] = value
            else:
                data[field] = widget.get().strip()
        if not data["name"]:
            raise ValueError("El nombre es obligatorio")
        try:
            data["price"] = int(data["price"])
            if data["price"] <= 0:
                raise ValueError("El precio debe ser mayor que cero")
        except ValueError:
            raise ValueError(
                "El precio debe ser un número válido mayor que cero")
        try:
            data["discount"] = int(data["discount"] or "0")
            if data["discount"] < 0:
                raise ValueError("El descuento no puede ser negativo")
            if data["discount"] >= data["price"]:
                raise ValueError(
                    "El descuento no puede ser mayor que el precio")
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError("El descuento debe ser un número válido")
            raise
        # Canonicalize category names to avoid mismatches (spaces/accents)
        try:
            def _norm(s: str) -> str:
                import unicodedata
                import re
                s = unicodedata.normalize('NFD', s)
                s = re.sub(r"[\u0300-\u036f]", "", s)
                s = re.sub(r"[^A-Za-z0-9]", "", s).lower()
                return s
            cat_map = {
                'lacteos': 'Lacteos',
                'carnesyembutidos': 'Carnesyembutidos',
                'snacksdulces': 'SnacksDulces',
                'snackssalados': 'SnacksSalados',
                'energeticaseisotonicas': 'Energeticaseisotonicas',
                'limpiezayaseo': 'Limpiezayaseo',
                'aguas': 'Aguas',
                'bebidas': 'Bebidas',
                'jugos': 'Jugos',
                'espumantes': 'Espumantes',
                'cervezas': 'Cervezas',
                'vinos': 'Vinos',
                'piscos': 'Piscos',
                'mascotas': 'Mascotas',
                'llaveros': 'Llaveros',
                'despensa': 'Despensa',
                'chocolates': 'Chocolates',
                'juegos': 'Juegos',
                'software': 'Software',
            }
            key = _norm(data.get('category', ''))
            if key in cat_map:
                data['category'] = cat_map[key]
        except Exception:
            self.logger.debug("No se pudo normalizar la categoría seleccionada.")

        if data["image_path"]:
            if not data["image_path"].startswith("assets/images/"):
                raise ValueError(
                    "La ruta de la imagen debe comenzar con 'assets/images/'")
        if data.get("image_avif_path"):
            if not data["image_avif_path"].startswith("assets/images/"):
                raise ValueError(
                    "La ruta AVIF debe comenzar con 'assets/images/'")
            if not data["image_avif_path"].lower().endswith(".avif"):
                raise ValueError("La ruta AVIF debe terminar en '.avif'")
            if not data.get("image_path"):
                guessed_fallback = self._guess_fallback_from_avif(
                    data["image_avif_path"])
                if guessed_fallback:
                    data["image_path"] = guessed_fallback
                    fallback_entry = self.entries.get("image_path")
                    if isinstance(fallback_entry, ttk.Entry):
                        fallback_entry.delete(0, tk.END)
                        fallback_entry.insert(0, guessed_fallback)
                if data.get("image_path"):
                    # Ensure preview reflects inferred fallback
                    try:
                        self._update_image_preview()
                    except Exception as exc:
                        self.logger.debug("No se pudo actualizar la vista previa: %s", exc)
            if not data.get("image_path"):
                raise ValueError(
                    "Debes mantener una imagen de respaldo (PNG/JPG/GIF/WebP) al usar AVIF.")
        return data

    def _prefill_category(self) -> None:
        """Select default category when creating a new product."""
        cat_widget = self.entries.get("category")
        if not isinstance(cat_widget, ttk.Combobox):
            return
        desired_key = (self.default_category or "").strip()
        if desired_key:
            display_value = self.category_helper.get_display_for_key(desired_key)
        elif self.category_helper.display_values:
            display_value = self.category_helper.display_values[0]
        else:
            display_value = ""
        if display_value:
            try:
                cat_widget.set(display_value)
            except Exception:
                cat_widget.set(desired_key)
            self._on_category_change()

    def _ensure_fallback_for_avif(self) -> None:
        """Populate fallback image entry when an AVIF is selected."""
        avif_entry = self.entries.get("image_avif_path")
        fallback_entry = self.entries.get("image_path")
        if not isinstance(avif_entry, ttk.Entry) or not isinstance(fallback_entry, ttk.Entry):
            return
        current_fallback = fallback_entry.get().strip()
        if current_fallback:
            return
        avif_rel = avif_entry.get().strip()
        if not avif_rel:
            return
        guessed = self._guess_fallback_from_avif(avif_rel)
        if guessed:
            fallback_entry.delete(0, tk.END)
            fallback_entry.insert(0, guessed)
        else:
            generated = self._generate_fallback_from_avif(avif_rel)
            if generated:
                fallback_entry.delete(0, tk.END)
                fallback_entry.insert(0, generated)

    def _guess_fallback_from_avif(self, avif_rel: str) -> Optional[str]:
        """Infer a non-AVIF fallback path located alongside the AVIF."""
        avif_rel = avif_rel.strip()
        if not avif_rel or not avif_rel.startswith("assets/images/"):
            return None
        base_dir = self._assets_images_root()
        relative = avif_rel[len("assets/images/"):].replace('/', os.sep)
        base, _ = os.path.splitext(relative)
        for ext in (".webp", ".jpg", ".jpeg", ".png", ".gif"):
            candidate = os.path.join(base_dir, base + ext)
            if os.path.exists(candidate):
                rel_path = os.path.relpath(candidate, base_dir).replace('\\', '/')
                return f"assets/images/{rel_path}"
        return None

    def _generate_fallback_from_avif(self, avif_rel: str) -> Optional[str]:
        """Generate a fallback image from the AVIF source if missing."""
        if not PIL_AVAILABLE or not PIL_AVIF:
            return None
        base_dir = self._assets_images_root()
        relative = avif_rel[len("assets/images/"):].replace('/', os.sep)
        avif_path = os.path.join(base_dir, relative)
        if not os.path.exists(avif_path):
            return None

        base, _ = os.path.splitext(relative)
        fallback_ext = ".webp" if PIL_WEBP else ".png"
        fallback_abs = os.path.join(base_dir, base + fallback_ext)

        try:
            os.makedirs(os.path.dirname(fallback_abs), exist_ok=True)
        except Exception:
            return None

        if os.path.exists(fallback_abs):
            rel_path = os.path.relpath(fallback_abs, base_dir).replace('\\', '/')
            return f"assets/images/{rel_path}"

        try:
            with Image.open(avif_path) as src_img:
                img = src_img.convert("RGBA" if src_img.mode in ("P", "RGBA", "LA") else "RGB")
                save_params: Dict[str, Any] = {}
                if fallback_ext == ".webp":
                    save_params = {"format": "WEBP", "quality": 85}
                img.save(fallback_abs, **save_params)
                img.close()
        except Exception as exc:
            logger.warning("No se pudo generar fallback desde AVIF %s: %s", avif_path, exc)
            return None

        rel_path = os.path.relpath(fallback_abs, base_dir).replace('\\', '/')
        return f"assets/images/{rel_path}"

    def _center_on_parent(self) -> None:
        """Center the dialog relative to its parent or screen."""
        try:
            self.update_idletasks()
            width = self.winfo_width() or self.winfo_reqwidth()
            height = self.winfo_height() or self.winfo_reqheight()

            if self.master and self.master.winfo_ismapped():
                parent_x = self.master.winfo_rootx()
                parent_y = self.master.winfo_rooty()
                parent_w = self.master.winfo_width()
                parent_h = self.master.winfo_height()
            else:
                parent_x = 0
                parent_y = 0
                parent_w = self.winfo_screenwidth()
                parent_h = self.winfo_screenheight()

            if parent_w <= 1 or parent_h <= 1:
                screen_w = self.winfo_screenwidth()
                screen_h = self.winfo_screenheight()
                x = max((screen_w - width) // 2, 0)
                y = max((screen_h - height) // 2, 0)
            else:
                x = parent_x + (parent_w - width) // 2
                y = parent_y + (parent_h - height) // 2
                x = max(x, 0)
                y = max(y, 0)

            self.geometry(f"{width}x{height}+{int(x)}+{int(y)}")
        except Exception:
            screen_w = self.winfo_screenwidth()
            screen_h = self.winfo_screenheight()
            width = self.winfo_width() or self.winfo_reqwidth()
            height = self.winfo_height() or self.winfo_reqheight()
            x = max((screen_w - width) // 2, 0)
            y = max((screen_h - height) // 2, 0)
            self.geometry(f"{width}x{height}+{int(x)}+{int(y)}")

    # Helpers for image paths and preview
    def _assets_images_root(self) -> str:
        project_root = os.path.abspath(os.path.join(
            os.path.dirname(__file__), '..', '..', '..')) # Adjusted for deeper path: ui/ -> ProductManager/ -> Admin/ -> Root/
            # wait, original was: os.path.dirname(__file__) -> admin/product_manager
            # joined with '..', '..' -> admin -> root?
            # Original: admin/product_manager/gui.py. dirname = admin/product_manager.
            # .. -> admin
            # .. -> Tienda Ebano (root)
            # New: admin/product_manager/ui/product_form.py. dirname = admin/product_manager/ui
            # .. -> admin/product_manager
            # .. -> admin
            # .. -> Tienda Ebano (root)
            # So I need 3 '..'
        return os.path.join(project_root, 'assets', 'images')

    def _resolve_asset_image_path(self, base_dir: Path, rel_path: str) -> Optional[Path]:
        cleaned = rel_path.strip().replace('\\', '/')
        if not cleaned:
            return None
        if cleaned.startswith('assets/images/'):
            cleaned = cleaned[len('assets/images/'):]
        candidate = (base_dir / cleaned).resolve()
        try:
            candidate.relative_to(base_dir)
        except ValueError:
            return None
        if candidate.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'}:
            return None
        if not candidate.is_file():
            return None
        return candidate

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

    def _resolve_image_candidates(self) -> list[tuple[str, str]]:
        candidates: list[tuple[str, str]] = []
        fallback_entry = self.entries.get('image_path')
        if isinstance(fallback_entry, ttk.Entry):
            rel = fallback_entry.get().strip()
            if rel:
                candidates.append(('fallback', rel))
        avif_entry = self.entries.get('image_avif_path')
        if isinstance(avif_entry, ttk.Entry):
            rel = avif_entry.get().strip()
            if rel:
                candidates.append(('avif', rel))
        return candidates

    def _on_category_change(self, _event: tk.Event = None) -> None:
        """Ensure media files follow the selected category."""
        cat_widget = self.entries.get("category")
        if not isinstance(cat_widget, ttk.Combobox):
            return
        category_label = cat_widget.get().strip()
        category = self.category_helper.get_key_from_display(category_label)
        if not category:
            return
        target_subdir = self._category_subdir(category)
        if not target_subdir:
            return

        moved = False
        for field in ("image_path", "image_avif_path"):
            moved |= self._relocate_media_to_category(field, target_subdir)
        if moved:
            try:
                self._update_image_preview()
            except Exception as exc:
                self.logger.debug("No se pudo actualizar la vista previa: %s", exc)

    def _relocate_media_to_category(self, field: str, target_subdir: str) -> bool:
        """Move media referenced by the given field into the category directory."""
        entry = self.entries.get(field)
        if not isinstance(entry, ttk.Entry):
            return False
        rel_path = entry.get().strip()
        if not rel_path or not rel_path.startswith("assets/images/"):
            return False

        base_dir = Path(self._assets_images_root())
        current_relative = rel_path[len("assets/images/"):]
        current_path = (base_dir / current_relative.replace('/', os.sep))
        if not current_path.exists():
            return False

        try:
            current_parent = current_path.parent.relative_to(base_dir)
        except ValueError:
            return False

        desired_parent = Path(target_subdir.strip().replace('\\', '/'))
        if not str(desired_parent):
            return False

        if current_parent.as_posix().lower() == desired_parent.as_posix().lower():
            return False

        destination_dir = (base_dir / desired_parent).resolve()
        destination_dir.mkdir(parents=True, exist_ok=True)

        destination_path = destination_dir / current_path.name
        destination_path = self._unique_destination(destination_path)

        try:
            shutil.move(str(current_path), str(destination_path))
        except Exception as exc:
            logger.warning(
                "No se pudo mover el archivo %s a %s: %s",
                current_path,
                destination_path,
                exc
            )
            return False

        new_rel = destination_path.relative_to(base_dir).as_posix()
        entry.delete(0, tk.END)
        entry.insert(0, f"assets/images/{new_rel}")
        return True

    def _unique_destination(self, destination: Path) -> Path:
        """Ensure destination filename does not overwrite existing files."""
        if not destination.exists():
            return destination
        stem = destination.stem
        suffix = destination.suffix
        parent = destination.parent
        counter = 1
        while True:
            candidate = parent / f"{stem}_{counter}{suffix}"
            if not candidate.exists():
                return candidate
            counter += 1

    def _resolve_destination_directory(
        self,
        src_path: Path,
        base_dir: Path,
        current_category: str,
        cat_widget: Optional[ttk.Combobox],
    ) -> tuple[Path, bool]:
        """Determine destination dir for a selected media file."""
        category_updated = False
        effective_category = current_category or ""
        try:
            relative = src_path.relative_to(base_dir)
            subdir = relative.parent.as_posix()
            guessed_category = self._guess_category_from_directory(subdir)
            if guessed_category and isinstance(cat_widget, ttk.Combobox):
                current_value = self.category_helper.get_key_from_display(
                    cat_widget.get()
                )
                if current_value != guessed_category:
                    cat_widget.set(
                        self.category_helper.get_display_for_key(guessed_category)
                    )
                    category_updated = True
                effective_category = guessed_category
            dest_dir = base_dir / subdir
        except ValueError:
            dest_subdir = self._category_subdir(str(effective_category))
            dest_dir = base_dir / dest_subdir
        return dest_dir.resolve(), category_updated

    def _guess_category_from_directory(self, subdir: str) -> Optional[str]:
        """Infer category name from an assets/images subdirectory."""
        normalized = subdir.strip().replace('\\', '/').strip('/').lower()
        if not normalized:
            return None
        try:
            categories = [key for _, key in self.category_choices]
            if not categories:
                categories = self.product_service.get_categories()
        except Exception:
            categories = [key for _, key in self.category_choices]
        for category in categories:
            candidate_dir = self._category_subdir(str(category)).strip(
                '/').replace('\\', '/').lower()
            if candidate_dir == normalized:
                return category
        return None

    def _update_image_preview(self) -> None:
        try:
            cv = self.preview_canvas
            w, h = getattr(self, '_preview_w', 240), getattr(
                self, '_preview_h', 240)
            cv.delete("all")
            cv.create_rectangle(0, 0, w, h, fill="#fafafa", outline="#cccccc")
            abs_base_dir = self._assets_images_root()
            candidates = self._resolve_image_candidates()
            if not candidates:
                cv.create_text(w//2, h//2, text='Sin imagen', fill='#666666')
                self._preview_photo = None
                return

            selected_path = None
            unsupported_format = None
            for _, rel_path in candidates:
                abs_path = os.path.join(abs_base_dir, rel_path.replace(
                    'assets/images/', '').replace('/', os.sep))
                if not os.path.exists(abs_path):
                    continue
                ext = os.path.splitext(abs_path)[1].lower()
                if ext == '.webp' and not PIL_WEBP:
                    unsupported_format = 'webp'
                    continue
                if ext == '.avif' and not PIL_AVIF:
                    unsupported_format = 'avif'
                    continue
                selected_path = abs_path
                break

            if selected_path and PIL_AVAILABLE:
                preview_img = None
                try:
                    with Image.open(selected_path) as src_img:
                        preview_img = src_img.copy()
                    if preview_img.mode not in ('RGB', 'RGBA'):
                        preview_img = preview_img.convert('RGBA')
                    preview_img.thumbnail((w-10, h-10))
                    self._preview_photo = ImageTk.PhotoImage(preview_img)
                    cv.create_image(
                        w//2, h//2, image=self._preview_photo, anchor='center')
                    return
                except Exception as img_error:
                    if not getattr(self, '_preview_warning_shown', False):
                        messagebox.showwarning(
                            'Vista previa',
                            f'No se pudo renderizar la imagen seleccionada: {img_error}',
                            parent=self
                        )
                        self._preview_warning_shown = True
                finally:
                    if preview_img is not None:
                        try:
                            preview_img.close()
                        except Exception as exc:
                            self.logger.debug("No se pudo cerrar la imagen previa: %s", exc)

            if unsupported_format == 'avif' and not getattr(self, '_preview_warning_shown_avif', False):
                messagebox.showwarning(
                    "Vista previa no disponible",
                    "La librería Pillow instalada no soporta AVIF. \n"
                    "Instala pillow-heif o pillow-avif-plugin para habilitar la vista previa.",
                    parent=self
                )
                self._preview_warning_shown_avif = True
            elif unsupported_format == 'webp' and not getattr(self, '_preview_warning_shown', False):
                messagebox.showwarning(
                    "Vista previa no disponible",
                    "El entorno actual de Pillow no soporta WebP. Instala pillow-heif o actualiza Pillow.",
                    parent=self
                )
                self._preview_warning_shown = True

            if not PIL_AVAILABLE:
                cv.create_text(
                    w//2, h//2, text='Instale Pillow para vista previa', fill='#666666')
                if not getattr(self, '_preview_warning_shown', False):
                    messagebox.showwarning(
                        "Vista previa deshabilitada",
                        "Pillow no está disponible, por lo que la vista previa no puede renderizarse.\n"
                        "Instala Pillow (y pillow-heif si necesitas WebP/AVIF) para habilitarla.",
                        parent=self
                    )
                    self._preview_warning_shown = True
            else:
                cv.create_text(
                    w//2, h//2, text='(Vista previa no disponible)', fill='#666666')
            self._preview_photo = None
        except Exception:
            cv = self.preview_canvas
            w, h = getattr(self, '_preview_w', 240), getattr(
                self, '_preview_h', 240)
            cv.delete("all")
            cv.create_rectangle(0, 0, w, h, fill="#fafafa", outline="#cccccc")
            cv.create_text(
                w//2, h//2, text='(Vista previa no disponible)', fill='#666666')
            self._preview_photo = None

    def _open_image_file(self) -> None:
        import webbrowser
        try:
            candidates = self._resolve_image_candidates()
            if not candidates:
                return
            base_dir = Path(self._assets_images_root()).resolve()
            target_path: Optional[Path] = None
            for _, rel_path in candidates:
                resolved = self._resolve_asset_image_path(base_dir, rel_path)
                if resolved:
                    target_path = resolved
                    break
            if not target_path:
                messagebox.showerror(
                    'Imagen', 'El archivo de imagen no existe en disco.')
                return
            webbrowser.open(target_path.as_uri())
        except Exception as e:
            messagebox.showerror('Imagen', f'No se pudo abrir la imagen: {e}')
