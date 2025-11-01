"""
Tkinter dialogs for managing storefront categories and subcategories.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk, messagebox
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from category_service import (
    CategoryService,
    CategoryServiceError,
    NavGroup,
    Category,
)

FallbackChoice = Tuple[str, str]


def _slugify(value: str) -> str:
    import re

    slug = re.sub(r"[^A-Za-z0-9]+", "-", value.strip())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug.lower() or "categoria"


class CategoryFormDialog(tk.Toplevel):
    """Dialog to create or edit a subcategoría."""

    def __init__(
        self,
        parent: tk.Misc,
        *,
        nav_groups: Sequence[NavGroup],
        initial: Optional[Category] = None,
        title: str = "Categoría",
    ):
        super().__init__(parent)
        self.title(title)
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self._nav_groups = list(nav_groups)
        self._group_label_map = {group.label: group.id for group in self._nav_groups}
        self._initial = initial
        self.result: Optional[Dict[str, object]] = None

        self._build_form()
        self._populate_initial()
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        self.wait_visibility()
        self.focus()

    def _build_form(self) -> None:
        frame = ttk.Frame(self, padding=12)
        frame.grid(row=0, column=0, sticky="nsew")

        self.columnconfigure(0, weight=1)
        frame.columnconfigure(1, weight=1)

        ttk.Label(frame, text="Nombre visible:").grid(
            row=0, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.title_var = tk.StringVar()
        title_entry = ttk.Entry(frame, textvariable=self.title_var, width=40)
        title_entry.grid(row=0, column=1, sticky="ew", pady=4)
        title_entry.bind("<KeyRelease>", self._maybe_update_derived_fields)

        ttk.Label(frame, text="Clave de producto:").grid(
            row=1, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.product_key_var = tk.StringVar()
        ttk.Entry(frame, textvariable=self.product_key_var, width=40).grid(
            row=1, column=1, sticky="ew", pady=4
        )

        ttk.Label(frame, text="Slug / Identificador:").grid(
            row=2, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.slug_var = tk.StringVar()
        ttk.Entry(frame, textvariable=self.slug_var, width=40).grid(
            row=2, column=1, sticky="ew", pady=4
        )

        ttk.Label(frame, text="Categoría:").grid(
            row=3, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.group_var = tk.StringVar()
        group_values = [group.label for group in self._nav_groups]
        self.group_combobox = ttk.Combobox(
            frame, textvariable=self.group_var, values=group_values, state="readonly"
        )
        self.group_combobox.grid(row=3, column=1, sticky="ew", pady=4)

        ttk.Label(frame, text="Orden:").grid(
            row=4, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.order_var = tk.StringVar(value="0")
        ttk.Entry(frame, textvariable=self.order_var, width=12).grid(
            row=4, column=1, sticky="w", pady=4
        )

        ttk.Label(frame, text="Descripción:").grid(
            row=5, column=0, sticky="nw", pady=4, padx=(0, 8)
        )
        self.description_text = tk.Text(frame, width=40, height=4)
        self.description_text.grid(row=5, column=1, sticky="ew", pady=4)

        self.enabled_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            frame,
            text="Subcategoría visible",
            variable=self.enabled_var,
        ).grid(row=6, column=1, sticky="w", pady=4)

        buttons = ttk.Frame(self, padding=(12, 0, 12, 12))
        buttons.grid(row=1, column=0, sticky="ew")
        ttk.Button(buttons, text="Cancelar", command=self._on_cancel).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(buttons, text="Guardar", command=self._on_accept).pack(
            side=tk.RIGHT
        )

    def _populate_initial(self) -> None:
        if not self._initial:
            if self._nav_groups:
                self.group_var.set(self._nav_groups[0].label)
            return
        self.title_var.set(self._initial.title)
        self.product_key_var.set(self._initial.product_key)
        self.slug_var.set(self._initial.slug)
        group = next(
            (group.label for group in self._nav_groups if group.id == self._initial.group_id),
            "",
        )
        self.group_var.set(group)
        self.order_var.set(str(self._initial.order))
        self.description_text.delete("1.0", tk.END)
        self.description_text.insert("1.0", self._initial.description or "")
        self.enabled_var.set(bool(self._initial.enabled))

    def _maybe_update_derived_fields(self, _event: tk.Event) -> None:
        title = self.title_var.get().strip()
        if not title:
            return
        if not self.slug_var.get().strip():
            self.slug_var.set(_slugify(title))
        if not self.product_key_var.get().strip():
            self.product_key_var.set(title.replace(" ", ""))

    def _on_accept(self) -> None:
        title = self.title_var.get().strip()
        product_key = self.product_key_var.get().strip()
        slug = self.slug_var.get().strip() or _slugify(title)
        group_label = self.group_var.get().strip()
        order_raw = self.order_var.get().strip()

        if not title:
            messagebox.showwarning("Validación", "El nombre visible es obligatorio.")
            return
        if not product_key:
            messagebox.showwarning("Validación", "La clave de producto es obligatoria.")
            return
        if not group_label or group_label not in self._group_label_map:
            messagebox.showwarning("Validación", "Selecciona una categoría.")
            return
        try:
            order = int(order_raw) if order_raw else 0
        except ValueError:
            messagebox.showwarning("Validación", "El orden debe ser un número entero.")
            return

        self.result = {
            "title": title,
            "product_key": product_key,
            "slug": slug,
            "group_id": self._group_label_map[group_label],
            "description": self.description_text.get("1.0", tk.END).strip(),
            "order": order,
            "enabled": self.enabled_var.get(),
        }
        self.destroy()

    def _on_cancel(self) -> None:
        self.result = None
        self.destroy()



class FallbackDialog(tk.Toplevel):
    """Prompt the user to select a fallback category."""

    def __init__(
        self,
        parent: tk.Misc,
        *,
        choices: Sequence[FallbackChoice],
        title: str = "Reasignar productos",
    ):
        super().__init__(parent)
        self.title(title)
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self._choices = list(choices)
        self.result: Optional[str] = None

        frame = ttk.Frame(self, padding=12)
        frame.grid(row=0, column=0, sticky="nsew")
        ttk.Label(
            frame,
            text="Selecciona la categoría a la que se moverán los productos existentes:",
            wraplength=320,
            justify=tk.LEFT,
        ).grid(row=0, column=0, sticky="w")

        self.selection_var = tk.StringVar()
        ttk.Combobox(
            frame,
            textvariable=self.selection_var,
            values=[label for label, _ in self._choices],
            state="readonly",
            width=38,
        ).grid(row=1, column=0, pady=8, sticky="ew")

        buttons = ttk.Frame(self, padding=(0, 12, 0, 0))
        buttons.grid(row=1, column=0, sticky="ew")
        ttk.Button(buttons, text="Cancelar", command=self._on_cancel).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(buttons, text="Confirmar", command=self._on_confirm).pack(
            side=tk.RIGHT
        )

        if self._choices:
            self.selection_var.set(self._choices[0][0])
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        self.wait_visibility()
        self.focus()

    def _on_confirm(self) -> None:
        label = self.selection_var.get()
        for choice_label, product_key in self._choices:
            if choice_label == label:
                self.result = product_key
                break
        self.destroy()

    def _on_cancel(self) -> None:
        self.result = None
        self.destroy()


class CategoryManagerDialog(tk.Toplevel):
    """Main dialog for managing categories and subcategories."""

    def __init__(
        self,
        parent: tk.Misc,
        category_service: CategoryService,
        *,
        on_catalog_updated: Optional[Callable[[], None]] = None,
    ):
        super().__init__(parent)
        self.title("Gestionar categorías")
        self.geometry("780x520")
        self.transient(parent)
        self.grab_set()
        self.category_service = category_service
        self.on_catalog_updated = on_catalog_updated

        self._category_cache: Dict[str, Category] = {}
        self._nav_group_cache: Dict[str, NavGroup] = {}
        self._category_items: Dict[str, Category] = {}
        self._group_items: Dict[str, NavGroup] = {}

        self._build_ui()
        self.refresh_tree()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        main_frame = ttk.Frame(self, padding=12)
        main_frame.pack(fill=tk.BOTH, expand=True)

        columns = ("title", "slug", "product_key", "group", "order", "enabled")
        self.tree = ttk.Treeview(
            main_frame,
            columns=columns,
            displaycolumns=columns,
            show="tree headings",
            height=16,
            selectmode="browse",
        )
        headings = {
            "title": "Nombre",
            "slug": "Slug",
            "product_key": "Clave producto",
            "group": "Categoría",
            "order": "Orden",
            "enabled": "Activo",
        }
        for column, heading in headings.items():
            self.tree.heading(column, text=heading)
            anchor = tk.W if column not in ("order", "enabled") else tk.CENTER
            width = 200 if column == "title" else 120
            if column == "order":
                width = 70
            if column == "enabled":
                width = 70
            self.tree.column(column, width=width, anchor=anchor, stretch=False)
        self.tree.column("#0", width=0, stretch=False)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(
            main_frame, orient=tk.VERTICAL, command=self.tree.yview
        )
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.configure(yscrollcommand=scrollbar.set)

        button_frame = ttk.Frame(self, padding=(12, 0, 12, 12))
        button_frame.pack(fill=tk.X, side=tk.BOTTOM)

        ttk.Button(
            button_frame, text="Agregar categoría", command=self._add_nav_group
        ).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(
            button_frame, text="Agregar subcategoría", command=self._add_category
        ).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(
            button_frame, text="Editar", command=self._edit_selected
        ).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(
            button_frame, text="Eliminar", command=self._delete_selected
        ).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(
            button_frame, text="Actualizar", command=self.refresh_tree
        ).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(
            button_frame, text="Cerrar", command=self._on_close
        ).pack(side=tk.RIGHT)

    def refresh_tree(self) -> None:
        try:
            nav_groups = self.category_service.list_nav_groups(include_disabled=True)
            categories = self.category_service.list_categories(include_disabled=True)
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))
            return

        self._nav_group_cache = {group.id: group for group in nav_groups}
        self._category_cache = {category.id: category for category in categories}
        self._category_items.clear()
        self._group_items.clear()

        self.tree.delete(*self.tree.get_children())
        for group in nav_groups:
            group_iid = f"group:{group.id}"
            group_node = self.tree.insert(
                "",
                "end",
                iid=group_iid,
                text=group.label,
                values=(group.label, "", "", group.label, group.order, "Sí" if group.enabled else "No"),
                open=True,
                tags=("group",),
            )
            self._group_items[group_node] = group
            group_categories = [
                category
                for category in categories
                if category.group_id == group.id
            ]
            for category in sorted(group_categories, key=lambda c: c.order):
                cat_iid = f"cat:{category.id}"
                cat_node = self.tree.insert(
                    group_node,
                    "end",
                    iid=cat_iid,
                    text=category.title,
                    values=(
                        category.title,
                        category.slug,
                        category.product_key,
                        group.label,
                        category.order,
                        "Sí" if category.enabled else "No",
                    ),
                    open=True,
                    tags=("category",),
                )
                self._category_items[cat_node] = category
    def _selected_item(self) -> Tuple[Optional[str], Optional[object]]:
        selection = self.tree.selection()
        iid = selection[0] if selection else self.tree.focus()
        if not iid:
            return None, None
        if iid in self._category_items:
            return "category", self._category_items[iid].id
        if iid in self._group_items:
            return "group", self._group_items[iid].id
        # Fallback to inspecting tags when IIDs are not recognized
        tags = set(self.tree.item(iid, "tags") or ())
        slug = (self.tree.set(iid, "slug") or "").strip()
        text = (self.tree.item(iid, "text") or "").strip()
        if "category" in tags:
            identifier = slug or text or iid.split(":", 1)[-1]
            return "category", identifier
        if "group" in tags:
            group_id = slug or text or iid.split(":", 1)[-1]
            return "group", group_id
        return None, None

    def _add_category(self) -> None:
        try:
            nav_groups = self.category_service.list_nav_groups(include_disabled=False)
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))
            return
        if not nav_groups:
            messagebox.showwarning(
                "Categorías", "No existen categorías disponibles."
            )
            return

        selected_type, selected_data = self._selected_item()
        default_group_id = nav_groups[0].id
        if selected_type == "group":
            default_group_id = selected_data  # type: ignore[assignment]
        elif selected_type == "category" and selected_data in self._category_cache:
            default_group_id = self._category_cache[selected_data].group_id  # type: ignore[assignment]

        initial_group = next(
            (group for group in nav_groups if group.id == default_group_id),
            nav_groups[0],
        )
        dialog = CategoryFormDialog(
            self,
            nav_groups=nav_groups,
            initial=None,
            title="Nueva subcategoría",
        )
        dialog.group_var.set(initial_group.label)
        self.wait_window(dialog)
        if not dialog.result:
            return
        data = dialog.result
        try:
            self.category_service.create_category(
                title=data["title"],
                slug=data.get("slug"),
                product_key=data.get("product_key"),
                group_id=data["group_id"],
                description=data.get("description", ""),
                order=data.get("order"),
                enabled=data.get("enabled", True),
            )
            self.refresh_tree()
            self._notify_update()
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def _edit_selected(self) -> None:
        selected_type, selected_data = self._selected_item()
        if selected_type == "group" and isinstance(selected_data, str):
            nav_group = self._nav_group_cache.get(selected_data)
            if not nav_group:
                messagebox.showwarning("Editar categoría", "Selecciona una categoría válida.")
                return
            self._edit_nav_group(nav_group)
            return
        if selected_type == "category" and isinstance(selected_data, str):
            category = self._category_cache.get(selected_data)
            if not category:
                messagebox.showwarning("Editar subcategoría", "Selecciona una subcategoría válida.")
                return
            self._edit_category(category)
        else:
            messagebox.showinfo("Editar", "Selecciona una categoría o subcategoría para editarla.")

    def _edit_category(self, category: Category) -> None:
        try:
            nav_groups = self.category_service.list_nav_groups(include_disabled=False)
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))
            return
        dialog = CategoryFormDialog(
            self,
            nav_groups=nav_groups,
            initial=category,
            title="Editar categoría",
        )
        self.wait_window(dialog)
        if not dialog.result:
            return
        data = dialog.result
        try:
            self.category_service.update_category(
                category.id,
                title=data.get("title"),
                slug=data.get("slug"),
                product_key=data.get("product_key"),
                group_id=data.get("group_id"),
                description=data.get("description"),
                order=data.get("order"),
                enabled=data.get("enabled"),
            )
            self.refresh_tree()
            self._notify_update()
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def _edit_nav_group(self, nav_group: NavGroup) -> None:
        dialog = NavGroupFormDialog(self, nav_group=nav_group)
        self.wait_window(dialog)
        if not dialog.result:
            return
        data = dialog.result
        try:
            self.category_service.update_nav_group(
                nav_group.id,
                label=data.get("label"),
                order=data.get("order"),
                description=data.get("description"),
                enabled=data.get("enabled"),
            )
            self.refresh_tree()
            self._notify_update()
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def _add_nav_group(self) -> None:
        dialog = NavGroupFormDialog(self, nav_group=None, mode="create")
        self.wait_window(dialog)
        if not dialog.result:
            return
        data = dialog.result
        try:
            created = self.category_service.create_nav_group(
                label=data.get("label", ""),
                order=data.get("order"),
                description=data.get("description", ""),
            )
            if created and data.get("enabled", True) is False:
                self.category_service.update_nav_group(
                    created.id,
                    enabled=data["enabled"],
                )
            self.refresh_tree()
            self._notify_update()
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def _delete_selected(self) -> None:
        selected_type, selected_data = self._selected_item()
        if selected_type == "category" and isinstance(selected_data, str):
            category = self._category_cache.get(selected_data)
            if not category:
                messagebox.showwarning("Eliminar categoría", "Selecciona una categoría válida.")
                return
            self._delete_category(category)
        else:
            messagebox.showinfo(
                "Eliminar",
                "Selecciona una categoría o subcategoría para eliminarla."
            )

    def _delete_category(self, category: Category) -> None:
        if not messagebox.askyesno(
            "Eliminar categoría",
            f"¿Eliminar la categoría '{category.title}'? Esta acción puede reasignar productos.",
        ):
            return
        fallback_key: Optional[str] = None
        try:
            self.category_service.delete_category(category.id)
        except CategoryServiceError as exc:
            message = str(exc)
            if "Debes seleccionar otra categoría" in message:
                fallback_choices = [
                    (cat.title, cat.product_key)
                    for cat in self.category_service.list_categories()
                    if cat.id != category.id
                ]
                if not fallback_choices:
                    messagebox.showwarning(
                        "Eliminar categoría",
                        "No hay categorías disponibles para reasignar productos. "
                        "Crea otra categoría antes de eliminar esta.",
                    )
                    return
                dialog = FallbackDialog(self, choices=fallback_choices)
                self.wait_window(dialog)
                fallback_key = dialog.result
                if not fallback_key:
                    return
                try:
                    self.category_service.delete_category(
                        category.id, fallback_product_key=fallback_key
                    )
                except CategoryServiceError as final_exc:
                    messagebox.showerror("Error", str(final_exc))
                    return
            else:
                messagebox.showerror("Error", message)
                return
        self.refresh_tree()
        self._notify_update()

    def _notify_update(self) -> None:
        if callable(self.on_catalog_updated):
            self.on_catalog_updated()

    def _on_close(self) -> None:
        self.destroy()
class NavGroupFormDialog(tk.Toplevel):
    """Dialog to create or edit a categoría (top-level)."""

    def __init__(
        self,
        parent: tk.Misc,
        *,
        nav_group: Optional[NavGroup] = None,
        mode: str = "edit",
    ):
        super().__init__(parent)
        self.title("Editar categoría" if nav_group else "Nueva categoría")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self._mode = mode if nav_group else "create"
        self._group = nav_group
        self.result: Optional[Dict[str, object]] = None

        frame = ttk.Frame(self, padding=12)
        frame.grid(row=0, column=0, sticky="nsew")

        ttk.Label(frame, text="Etiqueta visible:").grid(
            row=0, column=0, sticky=tk.W, padx=(0, 8), pady=4
        )
        self.label_var = tk.StringVar(value=nav_group.label if nav_group else "")
        ttk.Entry(frame, textvariable=self.label_var, width=38).grid(
            row=0, column=1, sticky="ew", pady=4
        )

        ttk.Label(frame, text="Orden:").grid(
            row=1, column=0, sticky=tk.W, padx=(0, 8), pady=4
        )
        default_order = str(nav_group.order) if nav_group else ""
        self.order_var = tk.StringVar(value=default_order)
        ttk.Entry(frame, textvariable=self.order_var, width=12).grid(
            row=1, column=1, sticky=tk.W, pady=4
        )

        ttk.Label(frame, text="Descripción:").grid(
            row=2, column=0, sticky=tk.NW, padx=(0, 8), pady=4
        )
        self.description_text = tk.Text(frame, width=38, height=3)
        self.description_text.grid(row=2, column=1, sticky="ew", pady=4)
        if nav_group:
            self.description_text.insert("1.0", nav_group.description or "")

        self.enabled_var = tk.BooleanVar(value=nav_group.enabled if nav_group else True)
        ttk.Checkbutton(
            frame,
            text="Categoría visible",
            variable=self.enabled_var,
        ).grid(row=3, column=1, sticky=tk.W, pady=4)

        buttons = ttk.Frame(self, padding=(12, 0, 12, 12))
        buttons.grid(row=1, column=0, sticky="ew")
        ttk.Button(buttons, text="Cancelar", command=self._on_cancel).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(buttons, text="Guardar", command=self._on_accept).pack(
            side=tk.RIGHT
        )

    def _on_accept(self) -> None:
        label = self.label_var.get().strip()
        if not label:
            messagebox.showwarning("Validación", "La etiqueta no puede estar vacía.")
            return
        order_raw = self.order_var.get().strip()
        try:
            if order_raw:
                order = int(order_raw)
            else:
                order = None if self._mode == "create" else self._group.order if self._group else None
        except ValueError:
            messagebox.showwarning("Validación", "El orden debe ser un número entero.")
            return

        self.result = {
            "mode": self._mode,
            "label": label,
            "order": order,
            "description": self.description_text.get("1.0", tk.END).strip(),
            "enabled": self.enabled_var.get(),
        }
        self.destroy()

    def _on_cancel(self) -> None:
        self.result = None
        self.destroy()
