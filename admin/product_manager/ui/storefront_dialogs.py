"""Dialogs for editing storefront merchandising data."""

from __future__ import annotations
from dataclasses import replace
from typing import Callable, List, Optional

import tkinter as tk
from tkinter import messagebox, ttk

from ..models import Product
from ..storefront_service import (
    StorefrontBundle,
    StorefrontBundleService,
    StorefrontBundleValidationError,
    FeaturedStaplesError,
    FeaturedStaplesService,
    StorefrontProductReference,
    slugify_bundle_id,
)


class ProductPickerDialog(tk.Toplevel):
    """Simple searchable picker for storefront bundle items."""

    def __init__(self, parent: tk.Tk, products: List[Product]):
        super().__init__(parent)
        self.title("Agregar producto al combo")
        self.transient(parent)
        self.wait_visibility()
        self.grab_set()
        self.geometry("780x520")
        self.products = sorted(
            [product for product in products if not product.is_archived],
            key=lambda product: (product.category.lower(), product.name.lower()),
        )
        self.selected_reference: Optional[StorefrontProductReference] = None
        self.search_var = tk.StringVar()
        self.category_var = tk.StringVar(value="Todas")
        self._setup_ui()
        self._refresh_tree()

    def _setup_ui(self) -> None:
        frame = ttk.Frame(self, padding=16)
        frame.pack(fill=tk.BOTH, expand=True)

        controls = ttk.Frame(frame)
        controls.pack(fill=tk.X, pady=(0, 12))

        ttk.Label(controls, text="Buscar:").pack(side=tk.LEFT)
        search_entry = ttk.Entry(controls, textvariable=self.search_var)
        search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(8, 12))
        search_entry.focus_set()

        ttk.Label(controls, text="Categoría:").pack(side=tk.LEFT)
        categories = ["Todas"] + sorted(
            {product.category for product in self.products if product.category}
        )
        category_combo = ttk.Combobox(
            controls,
            textvariable=self.category_var,
            values=categories,
            state="readonly",
            width=24,
        )
        category_combo.pack(side=tk.LEFT)

        self.tree = ttk.Treeview(
            frame,
            columns=("category", "name", "price"),
            show="headings",
            height=16,
        )
        self.tree.heading("category", text="Categoría")
        self.tree.heading("name", text="Producto")
        self.tree.heading("price", text="Precio")
        self.tree.column("category", width=170, anchor=tk.W)
        self.tree.column("name", width=420, anchor=tk.W)
        self.tree.column("price", width=110, anchor=tk.E)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind("<Double-1>", lambda _event: self._confirm_selection())

        buttons = ttk.Frame(frame)
        buttons.pack(fill=tk.X, pady=(12, 0))
        ttk.Button(buttons, text="Cancelar", command=self.destroy).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(buttons, text="Agregar", command=self._confirm_selection).pack(
            side=tk.RIGHT
        )

        self.search_var.trace_add("write", lambda *_args: self._refresh_tree())
        category_combo.bind("<<ComboboxSelected>>", lambda _event: self._refresh_tree())

    def _filtered_products(self) -> List[Product]:
        search = self.search_var.get().strip().casefold()
        category = self.category_var.get().strip()
        matches: List[Product] = []
        for product in self.products:
            if category and category != "Todas" and product.category != category:
                continue
            haystack = f"{product.name} {product.description} {product.category}".casefold()
            if search and search not in haystack:
                continue
            matches.append(product)
        return matches

    def _refresh_tree(self) -> None:
        self.tree.delete(*self.tree.get_children())
        for index, product in enumerate(self._filtered_products()):
            self.tree.insert(
                "",
                tk.END,
                iid=str(index),
                values=(
                    product.category,
                    product.name,
                    f"${product.price:,.0f}".replace(",", "."),
                ),
            )

    def _confirm_selection(self) -> None:
        selection = self.tree.selection()
        if not selection:
            messagebox.showinfo(
                "Combos listos", "Selecciona un producto para agregar al combo."
            )
            return
        values = self.tree.item(selection[0], "values")
        if len(values) < 2:
            return
        self.selected_reference = StorefrontProductReference(
            category=str(values[0]),
            name=str(values[1]),
        )
        self.destroy()


class BundleEditorDialog(tk.Toplevel):
    """Create or edit a single storefront bundle."""

    def __init__(
        self,
        parent: tk.Tk,
        products: List[Product],
        bundle: Optional[StorefrontBundle] = None,
        existing_ids: Optional[set[str]] = None,
    ):
        super().__init__(parent)
        self.title("Editar combo" if bundle else "Nuevo combo")
        self.transient(parent)
        self.wait_visibility()
        self.grab_set()
        self.geometry("840x620")
        self.minsize(760, 520)
        self.products = products
        self.original_bundle = bundle
        self.existing_ids = existing_ids or set()
        self.result: Optional[StorefrontBundle] = None
        self._id_locked = bool(bundle and bundle.id)

        self.title_var = tk.StringVar(value=bundle.title if bundle else "")
        self.id_var = tk.StringVar(value=bundle.id if bundle else "")
        self.description_var = tk.StringVar(value=bundle.description if bundle else "")
        self.bundle_price_var = tk.StringVar(
            value=str(bundle.bundle_price) if bundle and bundle.bundle_price > 0 else ""
        )
        self.items: List[StorefrontProductReference] = (
            list(bundle.items) if bundle else []
        )

        self._setup_ui()
        self._refresh_items_tree()
        self.title_var.trace_add("write", self._handle_title_change)

    def _setup_ui(self) -> None:
        frame = ttk.Frame(self, padding=16)
        frame.pack(fill=tk.BOTH, expand=True)
        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(4, weight=1)

        ttk.Label(frame, text="Título").grid(row=0, column=0, sticky=tk.W, pady=(0, 8))
        ttk.Entry(frame, textvariable=self.title_var).grid(
            row=0, column=1, sticky="ew", pady=(0, 8)
        )

        ttk.Label(frame, text="ID").grid(row=1, column=0, sticky=tk.W, pady=(0, 8))
        id_entry = ttk.Entry(frame, textvariable=self.id_var)
        id_entry.grid(row=1, column=1, sticky="ew", pady=(0, 8))
        id_entry.bind("<KeyRelease>", self._handle_id_edited)

        ttk.Label(frame, text="Descripción").grid(
            row=2, column=0, sticky=tk.NW, pady=(0, 8)
        )
        description_text = tk.Text(frame, height=4, wrap=tk.WORD)
        description_text.grid(row=2, column=1, sticky="ew", pady=(0, 8))
        description_text.insert("1.0", self.description_var.get())
        self.description_text = description_text

        price_frame = ttk.Frame(frame)
        price_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(0, 8))
        ttk.Label(price_frame, text="Precio del combo (CLP)").pack(side=tk.LEFT)
        ttk.Entry(price_frame, textvariable=self.bundle_price_var, width=14).pack(
            side=tk.LEFT, padx=(12, 8)
        )
        ttk.Label(
            price_frame,
            text="Opcional. Deja vacío para mostrar la suma de los productos.",
        ).pack(side=tk.LEFT)

        items_frame = ttk.LabelFrame(frame, text="Productos del combo", padding=12)
        items_frame.grid(row=4, column=0, columnspan=2, sticky="nsew", pady=(4, 0))
        items_frame.columnconfigure(0, weight=1)
        items_frame.rowconfigure(0, weight=1)

        self.items_tree = ttk.Treeview(
            items_frame,
            columns=("category", "name"),
            show="headings",
            height=12,
        )
        self.items_tree.heading("category", text="Categoría")
        self.items_tree.heading("name", text="Producto")
        self.items_tree.column("category", width=180, anchor=tk.W)
        self.items_tree.column("name", width=420, anchor=tk.W)
        self.items_tree.grid(row=0, column=0, sticky="nsew")

        buttons = ttk.Frame(items_frame)
        buttons.grid(row=0, column=1, sticky=tk.N, padx=(12, 0))
        ttk.Button(buttons, text="Agregar...", command=self._add_item).pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(buttons, text="Quitar", command=self._remove_item).pack(
            fill=tk.X, pady=6
        )
        ttk.Button(buttons, text="Subir", command=lambda: self._move_item(-1)).pack(
            fill=tk.X, pady=6
        )
        ttk.Button(buttons, text="Bajar", command=lambda: self._move_item(1)).pack(
            fill=tk.X, pady=6
        )

        footer = ttk.Frame(frame)
        footer.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(14, 0))
        ttk.Button(footer, text="Cancelar", command=self.destroy).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(footer, text="Guardar", command=self._save).pack(side=tk.RIGHT)

    def _handle_title_change(self, *_args) -> None:
        if not self._id_locked or not self.id_var.get().strip():
            self.id_var.set(slugify_bundle_id(self.title_var.get()))

    def _handle_id_edited(self, _event: tk.Event) -> None:
        self._id_locked = True

    def _refresh_items_tree(self) -> None:
        self.items_tree.delete(*self.items_tree.get_children())
        for index, item in enumerate(self.items):
            self.items_tree.insert(
                "",
                tk.END,
                iid=str(index),
                values=(item.category, item.name),
            )

    def _current_index(self) -> Optional[int]:
        selection = self.items_tree.selection()
        if not selection:
            return None
        try:
            return int(selection[0])
        except (TypeError, ValueError):
            return None

    def _add_item(self) -> None:
        dialog = ProductPickerDialog(self, self.products)
        self.wait_window(dialog)
        if not dialog.selected_reference:
            return
        if dialog.selected_reference in self.items:
            messagebox.showinfo(
                "Combos listos", "Ese producto ya está agregado en el combo."
            )
            return
        self.items.append(dialog.selected_reference)
        self._refresh_items_tree()
        self.items_tree.selection_set(str(len(self.items) - 1))

    def _remove_item(self) -> None:
        index = self._current_index()
        if index is None:
            return
        self.items.pop(index)
        self._refresh_items_tree()

    def _move_item(self, offset: int) -> None:
        index = self._current_index()
        if index is None:
            return
        next_index = index + offset
        if next_index < 0 or next_index >= len(self.items):
            return
        self.items[index], self.items[next_index] = (
            self.items[next_index],
            self.items[index],
        )
        self._refresh_items_tree()
        self.items_tree.selection_set(str(next_index))

    def _save(self) -> None:
        title = self.title_var.get().strip()
        bundle_id = self.id_var.get().strip() or slugify_bundle_id(title)
        description = self.description_text.get("1.0", tk.END).strip()
        if not title:
            messagebox.showerror("Combos listos", "El combo debe tener un título.")
            return
        if not description:
            messagebox.showerror(
                "Combos listos", "El combo debe tener una descripción breve."
            )
            return
        if not self.items:
            messagebox.showerror(
                "Combos listos", "Agrega al menos un producto al combo."
            )
            return

        raw_price = self.bundle_price_var.get().strip()
        bundle_price = 0
        if raw_price:
            try:
                bundle_price = int(raw_price)
                if bundle_price < 0:
                    raise ValueError
            except ValueError:
                messagebox.showerror(
                    "Combos listos",
                    "El precio del combo debe ser un número entero positivo (CLP).",
                )
                return

        if (
            bundle_id in self.existing_ids
            and (not self.original_bundle or bundle_id != self.original_bundle.id)
        ):
            messagebox.showerror(
                "Combos listos",
                f"El id '{bundle_id}' ya existe. Usa otro identificador.",
            )
            return

        try:
            self.result = StorefrontBundle(
                id=bundle_id,
                title=title,
                description=description,
                items=list(self.items),
                bundle_price=bundle_price,
            )
        except StorefrontBundleValidationError as exc:
            messagebox.showerror("Combos listos", str(exc))
            return
        self.destroy()


class StorefrontBundlesDialog(tk.Toplevel):
    """Manage curated storefront bundles used on the homepage."""

    def __init__(
        self,
        parent: tk.Tk,
        bundle_service: StorefrontBundleService,
        products: List[Product],
        on_saved: Optional[Callable[[], None]] = None,
    ):
        super().__init__(parent)
        self.title("Gestionar Combos Listos")
        self.transient(parent)
        self.wait_visibility()
        self.grab_set()
        self.geometry("920x620")
        self.minsize(820, 540)
        self.bundle_service = bundle_service
        self.products = products
        self.on_saved = on_saved
        self._dirty = False
        self.bundles = self.bundle_service.load_bundles()
        self._setup_ui()
        self._refresh_tree()
        self.protocol("WM_DELETE_WINDOW", self._handle_close)

    def _setup_ui(self) -> None:
        frame = ttk.Frame(self, padding=16)
        frame.pack(fill=tk.BOTH, expand=True)
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(1, weight=1)

        header = ttk.Frame(frame)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.columnconfigure(0, weight=1)
        ttk.Label(
            header,
            text=(
                "Edita los combos destacados de la home. Se guardan en "
                "astro-poc/src/data/storefront-bundles.json."
            ),
            wraplength=680,
            justify=tk.LEFT,
        ).grid(row=0, column=0, sticky=tk.W)

        content = ttk.Frame(frame)
        content.grid(row=1, column=0, sticky="nsew")
        content.columnconfigure(0, weight=1)
        content.rowconfigure(0, weight=1)

        self.tree = ttk.Treeview(
            content,
            columns=("title", "bundle_id", "items"),
            show="headings",
            height=16,
        )
        self.tree.heading("title", text="Combo")
        self.tree.heading("bundle_id", text="ID")
        self.tree.heading("items", text="Productos")
        self.tree.column("title", width=330, anchor=tk.W)
        self.tree.column("bundle_id", width=190, anchor=tk.W)
        self.tree.column("items", width=90, anchor=tk.CENTER)
        self.tree.grid(row=0, column=0, sticky="nsew")
        self.tree.bind("<Double-1>", lambda _event: self._edit_bundle())

        actions = ttk.Frame(content)
        actions.grid(row=0, column=1, sticky=tk.N, padx=(12, 0))
        ttk.Button(actions, text="Nuevo...", command=self._add_bundle).pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(actions, text="Editar...", command=self._edit_bundle).pack(
            fill=tk.X, pady=6
        )
        ttk.Button(actions, text="Duplicar", command=self._duplicate_bundle).pack(
            fill=tk.X, pady=6
        )
        ttk.Button(actions, text="Eliminar", command=self._delete_bundle).pack(
            fill=tk.X, pady=6
        )
        ttk.Separator(actions, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=10)
        ttk.Button(actions, text="Subir", command=lambda: self._move_bundle(-1)).pack(
            fill=tk.X, pady=6
        )
        ttk.Button(actions, text="Bajar", command=lambda: self._move_bundle(1)).pack(
            fill=tk.X, pady=6
        )

        footer = ttk.Frame(frame)
        footer.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        self.status_var = tk.StringVar(value="")
        ttk.Label(footer, textvariable=self.status_var).pack(side=tk.LEFT)
        ttk.Button(footer, text="Cerrar", command=self._handle_close).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(footer, text="Guardar cambios", command=self._save_all).pack(
            side=tk.RIGHT
        )

    def _refresh_tree(self) -> None:
        self.tree.delete(*self.tree.get_children())
        for index, bundle in enumerate(self.bundles):
            self.tree.insert(
                "",
                tk.END,
                iid=str(index),
                values=(bundle.title, bundle.id, len(bundle.items)),
            )
        self.status_var.set(f"{len(self.bundles)} combo(s) configurado(s)")

    def _selected_index(self) -> Optional[int]:
        selection = self.tree.selection()
        if not selection:
            return None
        try:
            return int(selection[0])
        except (TypeError, ValueError):
            return None

    def _mark_dirty(self) -> None:
        self._dirty = True
        self.status_var.set(
            f"{len(self.bundles)} combo(s) configurado(s) · cambios sin guardar"
        )

    def _existing_ids(self, exclude_index: Optional[int] = None) -> set[str]:
        ids = set()
        for index, bundle in enumerate(self.bundles):
            if exclude_index is not None and index == exclude_index:
                continue
            ids.add(bundle.id)
        return ids

    def _add_bundle(self) -> None:
        dialog = BundleEditorDialog(
            self,
            self.products,
            existing_ids=self._existing_ids(),
        )
        self.wait_window(dialog)
        if dialog.result:
            self.bundles.append(dialog.result)
            self._refresh_tree()
            self.tree.selection_set(str(len(self.bundles) - 1))
            self._mark_dirty()

    def _edit_bundle(self) -> None:
        index = self._selected_index()
        if index is None:
            messagebox.showinfo("Combos listos", "Selecciona un combo para editar.")
            return
        dialog = BundleEditorDialog(
            self,
            self.products,
            bundle=self.bundles[index],
            existing_ids=self._existing_ids(exclude_index=index),
        )
        self.wait_window(dialog)
        if dialog.result:
            self.bundles[index] = dialog.result
            self._refresh_tree()
            self.tree.selection_set(str(index))
            self._mark_dirty()

    def _duplicate_bundle(self) -> None:
        index = self._selected_index()
        if index is None:
            messagebox.showinfo("Combos listos", "Selecciona un combo para duplicar.")
            return
        original = self.bundles[index]
        duplicated = replace(
            original,
            id=self._build_copy_id(original.id),
            title=f"{original.title} (copia)",
            items=list(original.items),
        )
        self.bundles.insert(index + 1, duplicated)
        self._refresh_tree()
        self.tree.selection_set(str(index + 1))
        self._mark_dirty()

    def _build_copy_id(self, base_id: str) -> str:
        candidate = f"{base_id}-copy"
        taken = self._existing_ids()
        suffix = 2
        while candidate in taken:
            candidate = f"{base_id}-copy-{suffix}"
            suffix += 1
        return candidate

    def _delete_bundle(self) -> None:
        index = self._selected_index()
        if index is None:
            messagebox.showinfo("Combos listos", "Selecciona un combo para eliminar.")
            return
        bundle = self.bundles[index]
        approved = messagebox.askyesno(
            "Eliminar combo",
            f"¿Eliminar '{bundle.title}' de Combos listos?",
        )
        if not approved:
            return
        self.bundles.pop(index)
        self._refresh_tree()
        self._mark_dirty()

    def _move_bundle(self, offset: int) -> None:
        index = self._selected_index()
        if index is None:
            return
        next_index = index + offset
        if next_index < 0 or next_index >= len(self.bundles):
            return
        self.bundles[index], self.bundles[next_index] = (
            self.bundles[next_index],
            self.bundles[index],
        )
        self._refresh_tree()
        self.tree.selection_set(str(next_index))
        self._mark_dirty()

    def _save_all(self) -> None:
        try:
            self.bundle_service.save_bundles(self.bundles)
        except StorefrontBundleValidationError as exc:
            messagebox.showerror("Combos listos", str(exc))
            return
        self._dirty = False
        self.status_var.set(f"{len(self.bundles)} combo(s) configurado(s)")
        if self.on_saved:
            self.on_saved()
        messagebox.showinfo(
            "Combos listos",
            "Los combos se guardaron correctamente para la storefront.",
        )

    def _handle_close(self) -> None:
        if self._dirty:
            approved = messagebox.askyesno(
                "Cerrar sin guardar",
                "Hay cambios sin guardar en Combos listos. ¿Cerrar de todos modos?",
            )
            if not approved:
                return
        self.destroy()


class FeaturedStaplesDialog(tk.Toplevel):
    """Manage the 'Favoritos para resolver hoy' list on the homepage."""

    def __init__(
        self,
        parent: tk.Tk,
        staples_service: FeaturedStaplesService,
        products: List[Product],
        on_saved: Optional[Callable[[], None]] = None,
    ):
        super().__init__(parent)
        self.title("Favoritos para resolver hoy")
        self.transient(parent)
        self.wait_visibility()
        self.grab_set()
        self.geometry("760x520")
        self.minsize(660, 400)
        self.staples_service = staples_service
        self.products = products
        self.on_saved = on_saved
        self._dirty = False
        self.staples: List[StorefrontProductReference] = self.staples_service.load_staples()
        self._setup_ui()
        self._refresh_tree()
        self.protocol("WM_DELETE_WINDOW", self._handle_close)

    def _setup_ui(self) -> None:
        frame = ttk.Frame(self, padding=16)
        frame.pack(fill=tk.BOTH, expand=True)
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(1, weight=1)

        ttk.Label(
            frame,
            text=(
                "Productos que aparecen en la sección 'Favoritos para resolver hoy' de la home. "
                "Se guardan en astro-poc/src/data/storefront-experience.json."
            ),
            wraplength=640,
            justify=tk.LEFT,
        ).grid(row=0, column=0, columnspan=2, sticky=tk.W, pady=(0, 12))

        content = ttk.Frame(frame)
        content.grid(row=1, column=0, columnspan=2, sticky="nsew")
        content.columnconfigure(0, weight=1)
        content.rowconfigure(0, weight=1)

        self.tree = ttk.Treeview(
            content,
            columns=("category", "name"),
            show="headings",
            height=14,
        )
        self.tree.heading("category", text="Categoría")
        self.tree.heading("name", text="Producto")
        self.tree.column("category", width=210, anchor=tk.W)
        self.tree.column("name", width=400, anchor=tk.W)
        self.tree.grid(row=0, column=0, sticky="nsew")

        actions = ttk.Frame(content)
        actions.grid(row=0, column=1, sticky=tk.N, padx=(12, 0))
        ttk.Button(actions, text="Agregar...", command=self._add_staple).pack(
            fill=tk.X, pady=(0, 6)
        )
        ttk.Button(actions, text="Quitar", command=self._remove_staple).pack(
            fill=tk.X, pady=6
        )
        ttk.Separator(actions, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=10)
        ttk.Button(actions, text="Subir", command=lambda: self._move_staple(-1)).pack(
            fill=tk.X, pady=6
        )
        ttk.Button(actions, text="Bajar", command=lambda: self._move_staple(1)).pack(
            fill=tk.X, pady=6
        )

        footer = ttk.Frame(frame)
        footer.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        self.status_var = tk.StringVar(value="")
        ttk.Label(footer, textvariable=self.status_var).pack(side=tk.LEFT)
        ttk.Button(footer, text="Cerrar", command=self._handle_close).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(footer, text="Guardar cambios", command=self._save_all).pack(
            side=tk.RIGHT
        )

    def _refresh_tree(self) -> None:
        self.tree.delete(*self.tree.get_children())
        for index, staple in enumerate(self.staples):
            self.tree.insert(
                "",
                tk.END,
                iid=str(index),
                values=(staple.category, staple.name),
            )
        self.status_var.set(f"{len(self.staples)} favorito(s) configurado(s)")

    def _selected_index(self) -> Optional[int]:
        selection = self.tree.selection()
        if not selection:
            return None
        try:
            return int(selection[0])
        except (TypeError, ValueError):
            return None

    def _mark_dirty(self) -> None:
        self._dirty = True
        self.status_var.set(
            f"{len(self.staples)} favorito(s) configurado(s) · cambios sin guardar"
        )

    def _add_staple(self) -> None:
        dialog = ProductPickerDialog(self, self.products)
        self.wait_window(dialog)
        if not dialog.selected_reference:
            return
        if dialog.selected_reference in self.staples:
            messagebox.showinfo(
                "Favoritos", "Ese producto ya está en la lista de favoritos."
            )
            return
        self.staples.append(dialog.selected_reference)
        self._refresh_tree()
        self.tree.selection_set(str(len(self.staples) - 1))
        self._mark_dirty()

    def _remove_staple(self) -> None:
        index = self._selected_index()
        if index is None:
            messagebox.showinfo("Favoritos", "Selecciona un producto para quitar.")
            return
        self.staples.pop(index)
        self._refresh_tree()
        self._mark_dirty()

    def _move_staple(self, offset: int) -> None:
        index = self._selected_index()
        if index is None:
            return
        next_index = index + offset
        if next_index < 0 or next_index >= len(self.staples):
            return
        self.staples[index], self.staples[next_index] = (
            self.staples[next_index],
            self.staples[index],
        )
        self._refresh_tree()
        self.tree.selection_set(str(next_index))
        self._mark_dirty()

    def _save_all(self) -> None:
        try:
            self.staples_service.save_staples(self.staples)
        except FeaturedStaplesError as exc:
            messagebox.showerror("Favoritos", str(exc))
            return
        self._dirty = False
        self.status_var.set(f"{len(self.staples)} favorito(s) configurado(s)")
        if self.on_saved:
            self.on_saved()
        messagebox.showinfo(
            "Favoritos",
            "Los favoritos se guardaron correctamente.",
        )

    def _handle_close(self) -> None:
        if self._dirty:
            approved = messagebox.askyesno(
                "Cerrar sin guardar",
                "Hay cambios sin guardar en Favoritos. ¿Cerrar de todos modos?",
            )
            if not approved:
                return
        self.destroy()
