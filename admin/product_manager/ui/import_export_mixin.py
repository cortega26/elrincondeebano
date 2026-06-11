"""Mixin for product import and export operations."""

from __future__ import annotations

import csv
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from ..models import Product
from ..services import ProductServiceError

logger = logging.getLogger(__name__)


class ImportExportMixin:
    """Mixin that provides import/export methods for MainWindow.

    Expects the host class to provide:
      - self.master (tk.Tk)
      - self.product_service (ProductService)
      - self._pending_import_plan, self._pending_import_merge
      - self._import_file_menu, self._import_apply_index
      - self._build_filter_criteria()
      - self.refresh_products()
      - self.update_status()
    """

    def _update_import_apply_state(self) -> None:
        """Enable or disable the apply import menu item based on pending state."""
        state = tk.NORMAL if self._pending_import_plan is not None else tk.DISABLED
        try:
            self._import_file_menu.entryconfig(self._import_apply_index, state=state)
        except Exception:
            pass

    def import_products(self) -> None:
        """Import products from JSON file."""
        file_path = filedialog.askopenfilename(filetypes=[("Archivos JSON", "*.json")])
        if not file_path:
            return

        try:
            plan = self.product_service.build_import_plan(file_path)
        except Exception as exc:
            messagebox.showerror("Error de Importación", str(exc))
            return

        approval = self._show_import_preview_dialog(plan)
        if not approval:
            return
        self._pending_import_plan = approval["plan"]
        self._pending_import_merge = approval["merge"]
        self._update_import_apply_state()
        self.update_status("Importación aprobada (pendiente de aplicar)")

    def _show_import_preview_dialog(
        self, plan: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        dialog = tk.Toplevel(self.master)
        dialog.title("Previsualización de importación")
        dialog.transient(self.master)
        dialog.grab_set()
        dialog.geometry("860x520")

        summary = plan.get("summary", {})
        summary_text = (
            "Resumen:\n"
            f"Nuevos: {summary.get('new', 0)}  "
            f"Duplicados: {summary.get('duplicate', 0)}  "
            f"Inválidos: {summary.get('invalid', 0)}\n"
            f"Acciones: agregar {summary.get('add', 0)}, "
            f"actualizar {summary.get('update', 0)}, "
            f"omitir {summary.get('skip', 0)}"
        )
        ttk.Label(dialog, text=summary_text, justify=tk.LEFT).pack(
            padx=12, pady=(12, 6), anchor=tk.W
        )

        table_frame = ttk.Frame(dialog)
        table_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 8))
        columns = ("index", "status", "action", "name", "error")
        tree = ttk.Treeview(
            table_frame, columns=columns, show="headings", height=10
        )
        headings = {
            "index": "Índice",
            "status": "Estado",
            "action": "Acción",
            "name": "Nombre",
            "error": "Error",
        }
        widths = {"index": 70, "status": 100, "action": 100, "name": 220, "error": 320}
        for col in columns:
            tree.heading(col, text=headings[col])
            tree.column(col, width=widths[col], anchor=tk.W, stretch=True)
        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(table_frame, orient="vertical", command=tree.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        tree.configure(yscrollcommand=scrollbar.set)

        rows = plan.get("rows", [])
        for row in rows[:30]:
            incoming = row.get("incoming")
            name = getattr(incoming, "name", "") if incoming else ""
            tree.insert(
                "",
                "end",
                values=(
                    row.get("index"),
                    row.get("status"),
                    row.get("action"),
                    name,
                    row.get("error") or "",
                ),
            )

        merge_frame = ttk.LabelFrame(dialog, text="Reglas de merge (duplicados)")
        merge_frame.pack(fill=tk.X, padx=12, pady=(0, 8))

        merge_vars = {
            "price": tk.BooleanVar(value=True),
            "discount": tk.BooleanVar(value=True),
            "stock": tk.BooleanVar(value=True),
            "category": tk.BooleanVar(value=False),
            "image_path": tk.BooleanVar(value=False),
            "image_avif_path": tk.BooleanVar(value=False),
        }

        ttk.Checkbutton(
            merge_frame, text="Sobrescribir precio", variable=merge_vars["price"]
        ).pack(anchor=tk.W, padx=8, pady=2)
        ttk.Checkbutton(
            merge_frame, text="Sobrescribir descuento", variable=merge_vars["discount"]
        ).pack(anchor=tk.W, padx=8, pady=2)
        ttk.Checkbutton(
            merge_frame, text="Sobrescribir stock", variable=merge_vars["stock"]
        ).pack(anchor=tk.W, padx=8, pady=2)
        ttk.Checkbutton(
            merge_frame, text="Sobrescribir categoría", variable=merge_vars["category"]
        ).pack(anchor=tk.W, padx=8, pady=2)
        ttk.Checkbutton(
            merge_frame,
            text="Sobrescribir image_path",
            variable=merge_vars["image_path"],
        ).pack(anchor=tk.W, padx=8, pady=2)
        ttk.Checkbutton(
            merge_frame,
            text="Sobrescribir image_avif_path",
            variable=merge_vars["image_avif_path"],
        ).pack(anchor=tk.W, padx=8, pady=2)

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)
        result: Dict[str, Any] = {"approved": False, "plan": None, "merge": {}}

        def on_apply():
            result["approved"] = True
            result["plan"] = plan
            result["merge"] = {key: var.get() for key, var in merge_vars.items()}
            dialog.destroy()

        def on_cancel():
            dialog.destroy()

        actionable = int(summary.get("add", 0)) + int(summary.get("update", 0))
        apply_state = tk.NORMAL if actionable > 0 else tk.DISABLED
        ttk.Button(btn_frame, text="Cancelar", command=on_cancel).pack(
            side=tk.LEFT, padx=6
        )
        ttk.Button(
            btn_frame, text="Aprobar importación", command=on_apply, state=apply_state
        ).pack(side=tk.LEFT, padx=6)

        dialog.wait_window()
        if not result["approved"]:
            return None
        return {"plan": result["plan"], "merge": result["merge"]}

    def _merge_import_product(
        self, existing: Product, incoming: Product, merge: Dict[str, bool]
    ) -> Product:
        data = existing.to_dict()
        if merge.get("price", False):
            data["price"] = incoming.price
        if merge.get("discount", False):
            data["discount"] = incoming.discount
        if merge.get("stock", False):
            data["stock"] = incoming.stock
        if merge.get("category", False):
            data["category"] = incoming.category
        if merge.get("image_path", False):
            data["image_path"] = incoming.image_path
        if merge.get("image_avif_path", False):
            data["image_avif_path"] = incoming.image_avif_path
        data["is_archived"] = existing.is_archived
        data["order"] = existing.order
        return Product.from_dict(data)

    def apply_pending_import(self) -> None:
        """Apply the approved import plan with a single atomic write."""
        if not self._pending_import_plan:
            messagebox.showinfo(
                "Importación", "No hay una importación aprobada pendiente."
            )
            return

        plan = self._pending_import_plan
        merge = self._pending_import_merge or {}

        try:
            current = self.product_service.get_all_products()
            identity_map: Dict[str, tuple[int, Product]] = {
                product.identity_key(): (index, product)
                for index, product in enumerate(current)
            }
            replacements: Dict[str, Product] = {}
            additions: List[Product] = []
            history_entries: List[tuple[str, str, Dict[str, Any]]] = []

            for row in plan.get("rows", []):
                status = row.get("status")
                action = row.get("action")
                if status == "invalid" or action == "skip":
                    continue
                incoming = row.get("incoming")
                if not isinstance(incoming, Product):
                    raise ProductServiceError(
                        "Fila de importación inválida: falta producto."
                    )
                key = incoming.identity_key()
                if status == "duplicate" and action == "update":
                    if key not in identity_map:
                        raise ProductServiceError(
                            "El catálogo cambió desde la previsualización. "
                            "Vuelve a ejecutar la importación."
                        )
                    existing = identity_map[key][1]
                    merged = self._merge_import_product(existing, incoming, merge)
                    replacements[key] = merged
                    history_entries.append(
                        (
                            existing.identity_key(),
                            merged.identity_key(),
                            {
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "operation": "import",
                                "before": existing.to_dict(),
                                "after": merged.to_dict(),
                            },
                        )
                    )
                elif status == "new" and action == "add":
                    data = incoming.to_dict()
                    additions.append(Product.from_dict(data))

            final_products: List[Product] = []
            for product in current:
                key = product.identity_key()
                final_products.append(replacements.get(key, product))

            for new_product in additions:
                data = new_product.to_dict()
                data["order"] = len(final_products)
                created = Product.from_dict(data)
                final_products.append(created)
                history_entries.append(
                    (
                        created.identity_key(),
                        created.identity_key(),
                        {
                            "ts": datetime.now(timezone.utc).isoformat(),
                            "operation": "import_add",
                            "before": {},
                            "after": created.to_dict(),
                        },
                    )
                )

            self.product_service.save_all_products(
                final_products, history_entries=history_entries or None
            )
        except Exception as exc:
            messagebox.showerror(
                "Importación", f"No se pudo aplicar la importación: {exc}"
            )
            return

        self._pending_import_plan = None
        self._pending_import_merge = None
        self._update_import_apply_state()
        self.refresh_products()
        self.update_status("Importación aplicada correctamente")

    def export_products(self) -> None:
        """Export products to JSON file."""
        file_path = filedialog.asksaveasfilename(
            defaultextension=".json", filetypes=[("Archivos JSON", "*.json")]
        )
        if not file_path:
            return

        try:
            products = self.product_service.get_all_products()
            data = [p.to_dict() for p in products]
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.update_status(f"Se exportaron {len(products)} productos")
        except Exception as exc:
            messagebox.showerror("Error de Exportación", str(exc))

    def export_filtered_csv(self) -> None:
        """Export filtered products to CSV."""
        file_path = filedialog.asksaveasfilename(
            defaultextension=".csv", filetypes=[("Archivos CSV", "*.csv")]
        )
        if not file_path:
            return

        try:
            criteria = self._build_filter_criteria()
            criteria.show_archived_only = False
            products = self.product_service.filter_products(criteria)

            with open(file_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        "name",
                        "description",
                        "price",
                        "discount",
                        "stock",
                        "category",
                        "image_path",
                        "image_avif_path",
                        "order",
                    ]
                )
                for product in products:
                    writer.writerow(
                        [
                            product.name,
                            product.description,
                            int(product.price),
                            int(product.discount),
                            bool(product.stock),
                            product.category,
                            product.image_path,
                            product.image_avif_path,
                            int(product.order),
                        ]
                    )
            self.update_status(f"Se exportaron {len(products)} productos a CSV")
        except Exception as exc:
            messagebox.showerror("Error de Exportación", str(exc))
