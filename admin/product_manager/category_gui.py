"""
Tkinter dialogs for managing storefront groups and categories.
"""

# UI event handlers are self-explanatory; docstrings would add noise.
# pylint: disable=missing-function-docstring

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox
from typing import Callable, Dict, Optional, Sequence, Tuple, TypedDict, cast, Literal

from .category_service import (
    CategoryService,
    CategoryServiceError,
    NavGroup,
    Category,
)
from tools.category_og.pipeline import CategoryOgPipelineError
from tools.category_og.pipeline import (
    delete_category_assets,
    ensure_category_assets,
    sync_category_assets,
)
from tools.category_og.slug import SlugError, slugify_category

FallbackChoice = Tuple[str, str]
NodeKind = Literal["group", "category"]
RowAction = Literal["add", "edit", "delete"]


@dataclass(frozen=True)
class NodeSelection:
    """Selected tree node identity."""

    kind: Optional[NodeKind] = None
    primary: Optional[str] = None

    @property
    def is_empty(self) -> bool:
        return self.kind is None


class CategoryFormResult(TypedDict):
    """Typed payload from CategoryFormDialog."""
    title: str
    product_key: str
    slug: str
    group_id: str
    description: str
    order: int
    enabled: bool


class NavGroupFormResult(TypedDict):
    """Typed payload from NavGroupFormDialog."""
    label: str
    order: Optional[int]
    description: str
    enabled: bool


def _slugify(value: str) -> str:
    try:
        return slugify_category(value)
    except SlugError:
        return ""


class CategoryFormDialog(tk.Toplevel):
    """Dialog to create or edit a category."""
    # UI dialog stores several widget references by design.
    # pylint: disable=too-many-instance-attributes

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
        self.transient(cast(tk.Wm, parent))
        self.grab_set()

        self._nav_groups = list(nav_groups)
        self._group_label_map = {group.label: group.id for group in self._nav_groups}
        self._initial = initial
        self.result: Optional[CategoryFormResult] = None

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

        ttk.Label(frame, text="Nombre:").grid(
            row=0, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.title_var = tk.StringVar()
        title_entry = ttk.Entry(frame, textvariable=self.title_var, width=40)
        title_entry.grid(row=0, column=1, sticky="ew", pady=4)
        title_entry.bind("<KeyRelease>", self._maybe_update_derived_fields)

        ttk.Label(frame, text="Grupo de navegación:").grid(
            row=1, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.group_var = tk.StringVar()
        group_values = [group.label for group in self._nav_groups]
        self.group_combobox = ttk.Combobox(
            frame, textvariable=self.group_var, values=group_values, state="readonly"
        )
        self.group_combobox.grid(row=1, column=1, sticky="ew", pady=4)

        ttk.Label(frame, text="Posición:").grid(
            row=2, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.order_var = tk.StringVar(value="0")
        ttk.Entry(frame, textvariable=self.order_var, width=12).grid(
            row=2, column=1, sticky="w", pady=4
        )

        self.enabled_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            frame,
            text="Activa",
            variable=self.enabled_var,
        ).grid(row=3, column=1, sticky="w", pady=4)

        ttk.Label(frame, text="Descripción:").grid(
            row=4, column=0, sticky="nw", pady=4, padx=(0, 8)
        )
        self.description_text = tk.Text(frame, width=40, height=4)
        self.description_text.grid(row=4, column=1, sticky="ew", pady=4)

        self.show_advanced_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            frame,
            text="Mostrar campos avanzados (slug y clave interna)",
            variable=self.show_advanced_var,
            command=self._toggle_advanced,
        ).grid(row=5, column=0, columnspan=2, sticky="w", pady=(8, 4))

        self.advanced_frame = ttk.Frame(frame)
        self.advanced_frame.grid(row=6, column=0, columnspan=2, sticky="ew")
        self.advanced_frame.columnconfigure(1, weight=1)

        ttk.Label(self.advanced_frame, text="Slug / Identificador:").grid(
            row=0, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.slug_var = tk.StringVar()
        ttk.Entry(self.advanced_frame, textvariable=self.slug_var, width=40).grid(
            row=0, column=1, sticky="ew", pady=4
        )

        ttk.Label(self.advanced_frame, text="Clave interna:").grid(
            row=1, column=0, sticky="w", pady=4, padx=(0, 8)
        )
        self.product_key_var = tk.StringVar()
        ttk.Entry(
            self.advanced_frame, textvariable=self.product_key_var, width=40
        ).grid(row=1, column=1, sticky="ew", pady=4)

        self._toggle_advanced()

        buttons = ttk.Frame(self, padding=(12, 0, 12, 12))
        buttons.grid(row=1, column=0, sticky="ew")
        ttk.Button(buttons, text="Cancelar", command=self._on_cancel).pack(
            side=tk.RIGHT, padx=(8, 0)
        )
        ttk.Button(buttons, text="Guardar", command=self._on_accept).pack(side=tk.RIGHT)

    def _populate_initial(self) -> None:
        if not self._initial:
            if self._nav_groups:
                self.group_var.set(self._nav_groups[0].label)
            return
        self.title_var.set(self._initial.title)
        group = next(
            (
                group.label
                for group in self._nav_groups
                if group.id == self._initial.group_id
            ),
            "",
        )
        self.group_var.set(group)
        self.order_var.set(str(self._initial.order))
        self.description_text.delete("1.0", tk.END)
        self.description_text.insert("1.0", self._initial.description or "")
        self.enabled_var.set(bool(self._initial.enabled))
        self.slug_var.set(self._initial.slug)
        self.product_key_var.set(self._initial.product_key)

    def _maybe_update_derived_fields(self, _event: tk.Event) -> None:
        title = self.title_var.get().strip()
        if not title:
            return
        if not self.slug_var.get().strip():
            self.slug_var.set(_slugify(title))
        if not self.product_key_var.get().strip():
            self.product_key_var.set(title.replace(" ", ""))

    def _toggle_advanced(self) -> None:
        if self.show_advanced_var.get():
            self.advanced_frame.grid()
        else:
            self.advanced_frame.grid_remove()

    def _on_accept(self) -> None:
        title = self.title_var.get().strip()
        slug = self.slug_var.get().strip() or _slugify(title)
        product_key = self.product_key_var.get().strip() or title.replace(" ", "")
        group_label = self.group_var.get().strip()
        order_raw = self.order_var.get().strip()

        if not title:
            messagebox.showwarning("Validación", "El nombre es obligatorio.")
            return
        if not slug:
            messagebox.showwarning(
                "Validación",
                "No se pudo generar un slug válido. Usa letras/números y espacios.",
            )
            return
        if not group_label or group_label not in self._group_label_map:
            messagebox.showwarning("Validación", "Selecciona un grupo de navegación.")
            return
        try:
            order = int(order_raw) if order_raw else 0
        except ValueError:
            messagebox.showwarning("Validación", "El orden debe ser un número entero.")
            return

        self.result = cast(
            CategoryFormResult,
            {
                "title": title,
                "product_key": product_key,
                "slug": slug,
                "group_id": self._group_label_map[group_label],
                "description": self.description_text.get("1.0", tk.END).strip(),
                "order": order,
                "enabled": self.enabled_var.get(),
            },
        )
        self.destroy()

    def _on_cancel(self) -> None:
        self.result = None
        self.destroy()


class FallbackDialog(tk.Toplevel):
    """Prompt the user to select an option from a list."""

    def __init__(
        self,
        parent: tk.Misc,
        *,
        choices: Sequence[FallbackChoice],
        title: str = "Reasignar productos",
        prompt: str = (
            "Selecciona la categoría a la que se moverán los productos existentes:"
        ),
        confirm_text: str = "Confirmar",
    ):
        super().__init__(parent)
        self.title(title)
        self.resizable(False, False)
        self.transient(cast(tk.Wm, parent))
        self.grab_set()

        self._choices = list(choices)
        self.result: Optional[str] = None

        frame = ttk.Frame(self, padding=12)
        frame.grid(row=0, column=0, sticky="nsew")
        ttk.Label(
            frame,
            text=prompt,
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
        ttk.Button(buttons, text=confirm_text, command=self._on_confirm).pack(
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
    """Main dialog for managing groups and categories."""
    # UI dialog stores several widget references by design.
    # pylint: disable=too-many-instance-attributes,too-many-public-methods

    def __init__(
        self,
        parent: tk.Misc,
        category_service: CategoryService,
        *,
        on_catalog_updated: Optional[Callable[[], None]] = None,
        project_root: Optional[Path] = None,
    ):
        super().__init__(parent)
        self.title("Gestionar grupos y categorías")
        self.geometry("1060x620")
        self.transient(cast(tk.Wm, parent))
        self.grab_set()
        self.category_service = category_service
        self.on_catalog_updated = on_catalog_updated
        self.project_root = project_root or Path(__file__).resolve().parents[2]

        self._category_cache: Dict[str, Category] = {}
        self._nav_group_cache: Dict[str, NavGroup] = {}
        self._category_items: Dict[str, Category] = {}
        self._group_items: Dict[str, NavGroup] = {}

        self._build_ui()
        self.refresh_tree()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=12)
        root.pack(fill=tk.BOTH, expand=True)

        toolbar = ttk.Frame(root)
        toolbar.pack(fill=tk.X, pady=(0, 8))

        ttk.Label(toolbar, text="Buscar:").pack(side=tk.LEFT)
        self.search_var = tk.StringVar()
        search_entry = ttk.Entry(toolbar, textvariable=self.search_var, width=26)
        search_entry.pack(side=tk.LEFT, padx=(6, 10))
        search_entry.bind("<KeyRelease>", self._on_filters_changed)

        ttk.Label(toolbar, text="Estado:").pack(side=tk.LEFT)
        self.status_filter_var = tk.StringVar(value="Todas")
        status_combo = ttk.Combobox(
            toolbar,
            textvariable=self.status_filter_var,
            values=("Todas", "Activas", "Inactivas"),
            state="readonly",
            width=10,
        )
        status_combo.pack(side=tk.LEFT, padx=(6, 10))
        status_combo.bind("<<ComboboxSelected>>", self._on_filters_changed)

        self.show_advanced_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            toolbar,
            text="Mostrar avanzados",
            variable=self.show_advanced_var,
            command=self._toggle_advanced_view,
        ).pack(side=tk.LEFT, padx=(0, 10))

        ttk.Button(toolbar, text="Expandir todo", command=self._expand_all).pack(
            side=tk.LEFT, padx=(0, 6)
        )
        ttk.Button(toolbar, text="Contraer todo", command=self._collapse_all).pack(
            side=tk.LEFT, padx=(0, 10)
        )

        ttk.Button(toolbar, text="+ Categoría", command=self._add_category).pack(
            side=tk.LEFT, padx=(0, 6)
        )
        ttk.Button(toolbar, text="+ Grupo", command=self._add_nav_group).pack(
            side=tk.LEFT
        )
        ttk.Button(
            toolbar,
            text="Reconstruir OG",
            command=self._sync_og_assets,
        ).pack(side=tk.LEFT, padx=(10, 0))

        split = ttk.Panedwindow(root, orient=tk.HORIZONTAL)
        split.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(split)
        right = ttk.Frame(split, padding=(12, 0, 0, 0))
        split.add(left, weight=5)
        split.add(right, weight=2)

        columns = ("active", "order", "slug", "product_key")
        self.tree = ttk.Treeview(
            left,
            columns=columns,
            show="tree headings",
            height=18,
            selectmode="browse",
        )
        self.tree.heading("#0", text="Nombre")
        self.tree.column("#0", width=320, anchor="w", stretch=True)

        headings = {
            "active": "Activo",
            "order": "Posición",
            "slug": "Slug",
            "product_key": "Clave interna",
        }
        for column, heading in headings.items():
            self.tree.heading(column, text=heading)
            anchor: Literal["w", "center"] = (
                "center" if column in ("active", "order") else "w"
            )
            width = 90
            if column in ("slug", "product_key"):
                width = 150
            self.tree.column(column, width=width, anchor=anchor, stretch=False)

        self._configure_tree_columns()
        self.tree.tag_configure("disabled", foreground="#7b7b7b")

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar_y = ttk.Scrollbar(left, orient=tk.VERTICAL, command=self.tree.yview)
        scrollbar_y.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.configure(yscrollcommand=scrollbar_y.set)

        self.tree.bind("<<TreeviewSelect>>", self._on_tree_selection_changed)
        self.tree.bind("<Double-1>", self._on_tree_double_click, add="+")

        detail_box = ttk.LabelFrame(right, text="Detalle")
        detail_box.pack(fill=tk.BOTH, expand=True)
        detail_box.columnconfigure(1, weight=1)

        ttk.Label(detail_box, text="Tipo:").grid(
            row=0, column=0, sticky="w", padx=8, pady=(10, 4)
        )
        self.detail_type_var = tk.StringVar(value="-")
        ttk.Label(detail_box, textvariable=self.detail_type_var).grid(
            row=0, column=1, sticky="w", padx=8, pady=(10, 4)
        )

        ttk.Label(detail_box, text="Nombre:").grid(
            row=1, column=0, sticky="w", padx=8, pady=4
        )
        self.detail_name_var = tk.StringVar(value="Sin selección")
        ttk.Label(
            detail_box, textvariable=self.detail_name_var, wraplength=240, justify=tk.LEFT
        ).grid(row=1, column=1, sticky="w", padx=8, pady=4)

        ttk.Label(detail_box, text="Padre:").grid(
            row=2, column=0, sticky="w", padx=8, pady=4
        )
        self.detail_parent_var = tk.StringVar(value="-")
        ttk.Label(detail_box, textvariable=self.detail_parent_var).grid(
            row=2, column=1, sticky="w", padx=8, pady=4
        )

        ttk.Label(detail_box, text="Activo:").grid(
            row=3, column=0, sticky="w", padx=8, pady=4
        )
        self.detail_enabled_var = tk.StringVar(value="-")
        ttk.Label(detail_box, textvariable=self.detail_enabled_var).grid(
            row=3, column=1, sticky="w", padx=8, pady=4
        )

        ttk.Label(detail_box, text="Posición:").grid(
            row=4, column=0, sticky="w", padx=8, pady=4
        )
        self.detail_order_var = tk.StringVar(value="-")
        ttk.Label(detail_box, textvariable=self.detail_order_var).grid(
            row=4, column=1, sticky="w", padx=8, pady=4
        )

        self.advanced_detail_frame = ttk.Frame(detail_box)
        self.advanced_detail_frame.grid(
            row=5, column=0, columnspan=2, sticky="ew", padx=8, pady=(8, 4)
        )
        self.advanced_detail_frame.columnconfigure(1, weight=1)
        ttk.Label(self.advanced_detail_frame, text="Slug:").grid(
            row=0, column=0, sticky="w", pady=2
        )
        self.detail_slug_var = tk.StringVar(value="-")
        ttk.Label(self.advanced_detail_frame, textvariable=self.detail_slug_var).grid(
            row=0, column=1, sticky="w", pady=2
        )
        ttk.Label(self.advanced_detail_frame, text="Clave interna:").grid(
            row=1, column=0, sticky="w", pady=2
        )
        self.detail_product_key_var = tk.StringVar(value="-")
        ttk.Label(
            self.advanced_detail_frame, textvariable=self.detail_product_key_var
        ).grid(row=1, column=1, sticky="w", pady=2)

        action_frame = ttk.Frame(detail_box, padding=(8, 10, 8, 8))
        action_frame.grid(row=6, column=0, columnspan=2, sticky="ew")
        action_frame.columnconfigure(0, weight=1)
        action_frame.columnconfigure(1, weight=1)
        action_frame.columnconfigure(2, weight=1)

        self.context_add_button = ttk.Button(
            action_frame, text="Agregar", command=self._add_contextual
        )
        self.context_add_button.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        self.context_edit_button = ttk.Button(
            action_frame, text="Editar", command=self._edit_selected
        )
        self.context_edit_button.grid(row=0, column=1, sticky="ew", padx=3)
        self.context_delete_button = ttk.Button(
            action_frame, text="Eliminar", command=self._delete_selected
        )
        self.context_delete_button.grid(row=0, column=2, sticky="ew", padx=(6, 0))

        bottom = ttk.Frame(root, padding=(0, 8, 0, 0))
        bottom.pack(fill=tk.X)
        ttk.Button(bottom, text="Actualizar", command=self.refresh_tree).pack(
            side=tk.LEFT
        )
        ttk.Button(bottom, text="Cerrar", command=self._on_close).pack(side=tk.RIGHT)

        self._toggle_advanced_view()

    def _configure_tree_columns(self) -> None:
        if self.show_advanced_var.get():
            self.tree.configure(displaycolumns=("active", "order", "slug", "product_key"))
        else:
            self.tree.configure(displaycolumns=("active", "order"))

    def _toggle_advanced_view(self) -> None:
        self._configure_tree_columns()
        if self.show_advanced_var.get():
            self.advanced_detail_frame.grid()
        else:
            self.advanced_detail_frame.grid_remove()
        self._update_details_panel()

    def _on_filters_changed(self, _event: Optional[tk.Event] = None) -> None:
        self.refresh_tree()

    def _expand_all(self) -> None:
        for root_item in self.tree.get_children(""):
            self._set_open_state_recursive(root_item, True)

    def _collapse_all(self) -> None:
        for root_item in self.tree.get_children(""):
            self._set_open_state_recursive(root_item, False)

    def _set_open_state_recursive(self, iid: str, open_state: bool) -> None:
        self.tree.item(iid, open=open_state)
        for child in self.tree.get_children(iid):
            self._set_open_state_recursive(child, open_state)

    def _matches_query(self, query: str, *values: str) -> bool:
        if not query:
            return True
        haystack = " ".join((value or "").lower() for value in values)
        return query in haystack

    def _passes_status_filter(self, enabled: bool) -> bool:
        mode = self.status_filter_var.get()
        if mode == "Activas":
            return enabled
        if mode == "Inactivas":
            return not enabled
        return True

    @staticmethod
    def _enabled_label(enabled: bool) -> str:
        return "Sí" if enabled else "No"

    def _insert_group_node(self, group: NavGroup) -> str:
        group_iid = f"group:{group.id}"
        group_tags = ("group",) if group.enabled else ("group", "disabled")
        node = self.tree.insert(
            "",
            "end",
            iid=group_iid,
            text=group.label,
            values=(
                self._enabled_label(group.enabled),
                group.order,
                group.id,
                "",
            ),
            open=True,
            tags=group_tags,
        )
        self._group_items[node] = group
        return node

    def _insert_category_node(self, group_node: str, category: Category) -> str:
        cat_iid = f"cat:{category.id}"
        cat_tags = ("category",) if category.enabled else ("category", "disabled")
        node = self.tree.insert(
            group_node,
            "end",
            iid=cat_iid,
            text=category.title,
            values=(
                self._enabled_label(category.enabled),
                category.order,
                category.slug,
                category.product_key,
            ),
            open=True,
            tags=cat_tags,
        )
        self._category_items[node] = category
        return node

    def _restore_selection(self, selected: NodeSelection) -> None:
        restored_iid = self._iid_from_selection(selected)
        if not restored_iid:
            return
        self.tree.selection_set(restored_iid)
        self.tree.focus(restored_iid)
        self.tree.see(restored_iid)

    def refresh_tree(self) -> None:
        """Reload the tree contents from the category service."""
        previous = self._selected_item()
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
        query = self.search_var.get().strip().lower()

        for group in sorted(nav_groups, key=lambda entry: entry.order):
            group_matches = self._matches_query(query, group.label, group.id)
            group_node: Optional[str] = None
            group_categories = [
                category for category in categories if category.group_id == group.id
            ]

            for category in sorted(group_categories, key=lambda entry: entry.order):
                category_matches = group_matches or self._matches_query(
                    query, category.title, category.slug, category.product_key
                )
                if not (category_matches and self._passes_status_filter(category.enabled)):
                    continue

                if not group_node:
                    group_node = self._insert_group_node(group)

                self._insert_category_node(group_node, category)

            if not group_node and group_matches and self._passes_status_filter(group.enabled):
                self._insert_group_node(group)

        self._restore_selection(previous)
        self._update_details_panel()

    def _selected_item(self) -> NodeSelection:
        selection = self.tree.selection()
        iid = selection[0] if selection else self.tree.focus()
        if not iid:
            return NodeSelection()
        if iid in self._group_items:
            return NodeSelection(kind="group", primary=self._group_items[iid].id)
        if iid in self._category_items:
            return NodeSelection(kind="category", primary=self._category_items[iid].id)
        return NodeSelection()

    def _iid_from_selection(self, selected: NodeSelection) -> Optional[str]:
        if selected.kind == "group" and selected.primary:
            iid = f"group:{selected.primary}"
            return iid if self.tree.exists(iid) else None
        if selected.kind == "category" and selected.primary:
            iid = f"cat:{selected.primary}"
            return iid if self.tree.exists(iid) else None
        return None

    def _on_tree_double_click(self, event: tk.Event) -> Optional[str]:
        self._edit_selected()
        return "break"

    def _on_tree_selection_changed(self, _event: Optional[tk.Event] = None) -> None:
        self._update_details_panel()

    def _add_contextual(self) -> None:
        self._dispatch_row_action("add")

    def _dispatch_row_action(self, action: RowAction) -> None:
        selected = self._selected_item()
        if action == "add":
            if selected.kind == "group" and selected.primary:
                self._add_category(default_group_id=selected.primary)
            elif selected.kind == "category" and selected.primary:
                category = self._category_cache.get(selected.primary)
                group_id = category.group_id if category else None
                self._add_category(default_group_id=group_id)
            else:
                self._add_category()
            return
        if action == "edit":
            self._edit_selected()
            return
        if action == "delete":
            self._delete_selected()

    def _add_category(self, default_group_id: Optional[str] = None) -> None:
        try:
            nav_groups = self.category_service.list_nav_groups(include_disabled=False)
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))
            return
        if not nav_groups:
            messagebox.showwarning("Categorías", "No existen grupos de categorías activos.")
            return

        if not default_group_id:
            selected = self._selected_item()
            if selected.kind == "group" and selected.primary:
                default_group_id = selected.primary
            elif selected.kind == "category" and selected.primary:
                category = self._category_cache.get(selected.primary)
                default_group_id = category.group_id if category else nav_groups[0].id
            else:
                default_group_id = nav_groups[0].id

        initial_group = next(
            (group for group in nav_groups if group.id == default_group_id),
            nav_groups[0],
        )
        dialog = CategoryFormDialog(
            self,
            nav_groups=nav_groups,
            initial=None,
            title="Nueva categoría",
        )
        dialog.group_var.set(initial_group.label)
        self.wait_window(dialog)
        if not dialog.result:
            return
        data = dialog.result
        try:
            created = self.category_service.create_category(
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
            self._ensure_og_asset(created.slug, created.title)
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

    def _edit_selected(self) -> None:
        selected = self._selected_item()
        if selected.kind == "group" and selected.primary:
            nav_group = self._nav_group_cache.get(selected.primary)
            if not nav_group:
                messagebox.showwarning(
                    "Editar grupo", "Selecciona un grupo de categorías válido."
                )
                return
            self._edit_nav_group(nav_group)
            return
        if selected.kind == "category" and selected.primary:
            category = self._category_cache.get(selected.primary)
            if not category:
                messagebox.showwarning(
                    "Editar categoría", "Selecciona una categoría válida."
                )
                return
            self._edit_category(category)
            return
        messagebox.showinfo("Editar", "Selecciona un grupo o categoría para editar.")

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
        previous_slug = category.slug
        try:
            updated = self.category_service.update_category(
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
            self._ensure_og_asset(updated.slug, updated.title)
            if previous_slug != updated.slug:
                self._delete_og_asset(previous_slug)
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
        selected = self._selected_item()
        if selected.kind == "group" and selected.primary:
            nav_group = self._nav_group_cache.get(selected.primary)
            if not nav_group:
                messagebox.showwarning(
                    "Eliminar grupo", "Selecciona un grupo de categorías válido."
                )
                return
            self._delete_nav_group(nav_group)
            return
        if selected.kind == "category" and selected.primary:
            category = self._category_cache.get(selected.primary)
            if not category:
                messagebox.showwarning(
                    "Eliminar categoría", "Selecciona una categoría válida."
                )
                return
            self._delete_category(category)
            return
        messagebox.showinfo("Eliminar", "Selecciona un grupo o categoría para eliminar.")

    def _delete_nav_group(self, nav_group: NavGroup) -> None:
        if not messagebox.askyesno(
            "Eliminar grupo",
            f"¿Eliminar el grupo '{nav_group.label}'? Esta acción no se puede deshacer.",
        ):
            return
        try:
            self.category_service.delete_nav_group(nav_group.id)
            self.refresh_tree()
            self._notify_update()
        except CategoryServiceError as exc:
            messagebox.showerror("Error", str(exc))

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
        self._delete_og_asset(category.slug)

    def _set_detail_empty(self) -> None:
        self.detail_type_var.set("-")
        self.detail_name_var.set("Sin selección")
        self.detail_parent_var.set("-")
        self.detail_enabled_var.set("-")
        self.detail_order_var.set("-")
        self.detail_slug_var.set("-")
        self.detail_product_key_var.set("-")
        self.context_add_button.config(text="Agregar", state=tk.NORMAL)
        self.context_edit_button.config(state=tk.DISABLED)
        self.context_delete_button.config(state=tk.DISABLED)

    def _set_detail_actions(self, add_label: str) -> None:
        self.context_add_button.config(text=add_label, state=tk.NORMAL)
        self.context_edit_button.config(state=tk.NORMAL)
        self.context_delete_button.config(state=tk.NORMAL)

    def _set_group_detail(self, group: NavGroup) -> None:
        self.detail_type_var.set("Grupo")
        self.detail_name_var.set(group.label)
        self.detail_parent_var.set("Raíz")
        self.detail_enabled_var.set(self._enabled_label(group.enabled))
        self.detail_order_var.set(str(group.order))
        self.detail_slug_var.set(group.id)
        self.detail_product_key_var.set("-")
        self._set_detail_actions("Agregar categoría")

    def _set_category_detail(self, category: Category) -> None:
        group = self._nav_group_cache.get(category.group_id)
        parent_label = group.label if group else category.group_id or "-"
        self.detail_type_var.set("Categoría")
        self.detail_name_var.set(category.title)
        self.detail_parent_var.set(parent_label)
        self.detail_enabled_var.set(self._enabled_label(category.enabled))
        self.detail_order_var.set(str(category.order))
        self.detail_slug_var.set(category.slug)
        self.detail_product_key_var.set(category.product_key)
        self._set_detail_actions("Agregar categoría")

    def _update_details_panel(self) -> None:
        selected = self._selected_item()
        if selected.is_empty:
            self._set_detail_empty()
            return

        if selected.kind == "group" and selected.primary:
            group = self._nav_group_cache.get(selected.primary)
            if not group:
                return
            self._set_group_detail(group)
            return

        if selected.kind == "category" and selected.primary:
            category = self._category_cache.get(selected.primary)
            if not category:
                return
            self._set_category_detail(category)
            return

        self._set_detail_empty()

    def _notify_update(self) -> None:
        if callable(self.on_catalog_updated):
            self.on_catalog_updated()

    def _ensure_og_asset(self, slug: str, title: str) -> None:
        try:
            ensure_category_assets(
                slug,
                title=title,
                repo_root=self.project_root,
            )
        except (CategoryOgPipelineError, FileNotFoundError, ValueError) as exc:
            messagebox.showwarning(
                "Imágenes OG",
                "La categoría se guardó, pero no se pudo generar su imagen OG.\n"
                f"Detalle: {exc}",
            )

    def _delete_og_asset(self, slug: str) -> None:
        try:
            delete_category_assets(slug, repo_root=self.project_root)
        except (CategoryOgPipelineError, FileNotFoundError, ValueError) as exc:
            messagebox.showwarning(
                "Imágenes OG",
                "La categoría fue eliminada, pero no se pudieron limpiar sus imágenes OG.\n"
                f"Detalle: {exc}",
            )

    def _sync_og_assets(self) -> None:
        try:
            result = sync_category_assets(repo_root=self.project_root)
        except (CategoryOgPipelineError, FileNotFoundError, ValueError) as exc:
            messagebox.showerror("Reconstruir OG", str(exc))
            return
        removed_count = len(result.get("removed", []))
        total = int(result.get("total_categories", 0))
        changed = bool(result.get("changed", False))
        messagebox.showinfo(
            "Reconstruir OG",
            "Sincronización completada.\n"
            f"Categorías procesadas: {total}\n"
            f"Archivos huérfanos eliminados: {removed_count}\n"
            f"Hubo cambios: {'Sí' if changed else 'No'}",
        )

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
        self.transient(cast(tk.Wm, parent))
        self.grab_set()

        self._mode = mode if nav_group else "create"
        self._group = nav_group
        self.result: Optional[NavGroupFormResult] = None

        frame = ttk.Frame(self, padding=12)
        frame.grid(row=0, column=0, sticky="nsew")

        ttk.Label(frame, text="Etiqueta visible:").grid(
            row=0, column=0, sticky=tk.W, padx=(0, 8), pady=4
        )
        self.label_var = tk.StringVar(value=nav_group.label if nav_group else "")
        ttk.Entry(frame, textvariable=self.label_var, width=38).grid(
            row=0, column=1, sticky="ew", pady=4
        )

        ttk.Label(frame, text="Posición:").grid(
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
        ttk.Button(buttons, text="Guardar", command=self._on_accept).pack(side=tk.RIGHT)

    def _on_accept(self) -> None:
        label = self.label_var.get().strip()
        if not label:
            messagebox.showwarning("Validación", "La etiqueta no puede estar vacía.")
            return
        order_raw = self.order_var.get().strip()
        try:
            order: Optional[int]
            if order_raw:
                order = int(order_raw)
            else:
                order = (
                    None
                    if self._mode == "create"
                    else self._group.order
                    if self._group
                    else None
                )
        except ValueError:
            messagebox.showwarning("Validación", "El orden debe ser un número entero.")
            return

        self.result = cast(
            NavGroupFormResult,
            {
                "label": label,
                "order": order,
                "description": self.description_text.get("1.0", tk.END).strip(),
                "enabled": self.enabled_var.get(),
            },
        )
        self.destroy()

    def _on_cancel(self) -> None:
        self.result = None
        self.destroy()
