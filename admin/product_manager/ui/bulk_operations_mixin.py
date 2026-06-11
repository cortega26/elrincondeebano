"""Mixin for bulk product operations (discount, stock, price, category)."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import tkinter as tk
from tkinter import messagebox, ttk

from ..models import Product
from ..services import ProductServiceError

logger = logging.getLogger(__name__)


class BulkOperationsMixin:
    """Mixin that provides bulk operation methods for MainWindow.

    Expects the host class to provide:
      - self.master (tk.Tk)
      - self.product_service (ProductService)
      - self.tree (ttk.Treeview)
      - self._undo_stack, self._redo_stack, self._undo_max
      - self.undo_btn, self.redo_btn
      - self._get_selected_products()
      - self.refresh_products()
      - self.update_status()
    """

    def _ask_number(
        self,
        title: str,
        prompt: str,
        min_val: Optional[int] = None,
        max_val: Optional[int] = None,
    ) -> Optional[float]:
        dialog = tk.Toplevel(self.master)
        dialog.title(title)
        dialog.transient(self.master)
        dialog.wait_visibility()
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
                range_msg = (
                    f" entre {min_val} y {max_val}" if max_val is not None else ""
                )
                messagebox.showerror(
                    "Valor inválido",
                    f"Ingrese un número válido{range_msg}.",
                )

        def on_cancel():
            dialog.destroy()

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)
        ttk.Button(btn_frame, text="Aceptar", command=on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancelar", command=on_cancel).pack(
            side=tk.LEFT, padx=5
        )
        dialog.wait_window()
        return result["value"]

    def _ask_category(self, title: str, prompt: str) -> Optional[str]:
        """Prompt the user to select a destination category."""
        dialog = tk.Toplevel(self.master)
        dialog.title(title)
        dialog.transient(self.master)
        dialog.grab_set()
        ttk.Label(dialog, text=prompt).pack(padx=10, pady=10)

        choices = self.product_service.get_category_choices()
        from .utils import CategoryHelper

        category_helper = CategoryHelper(choices)
        values = category_helper.display_values
        if not values:
            dialog.destroy()
            messagebox.showwarning(
                "Categoría", "No hay categorías disponibles para seleccionar."
            )
            return None

        var = tk.StringVar(value=values[0])
        combo = ttk.Combobox(dialog, textvariable=var, values=values, state="readonly")
        combo.pack(padx=10, pady=5)
        combo.focus_set()

        result: Dict[str, Optional[str]] = {"value": None}

        def on_ok():
            display_value = var.get().strip()
            key = category_helper.get_key_from_display(display_value)
            result["value"] = key
            dialog.destroy()

        def on_cancel():
            dialog.destroy()

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)
        ttk.Button(btn_frame, text="Aceptar", command=on_ok).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(btn_frame, text="Cancelar", command=on_cancel).pack(
            side=tk.LEFT, padx=5
        )
        dialog.wait_window()
        return result["value"]

    def bulk_change_category(self) -> None:
        """Bulk change category for selected products."""
        products = self._get_selected_products()
        if not products:
            messagebox.showwarning(
                "Acción masiva", "Seleccione uno o más productos."
            )
            return

        try:
            destination_key = self._ask_category(
                "Cambiar categoría", "Seleccione la nueva categoría:"
            )
        except Exception as exc:
            messagebox.showerror(
                "Categoría", f"No se pudieron cargar las categorías: {exc}"
            )
            return

        if not destination_key:
            return

        try:
            valid_choices = {
                key for _, key in self.product_service.get_category_choices()
            }
            if destination_key not in valid_choices:
                messagebox.showerror(
                    "Categoría",
                    f"La categoría seleccionada no existe: {destination_key}",
                )
                return
            if hasattr(self, "category_service") and self.category_service:
                match = self.category_service.find_category_by_product_key(
                    destination_key
                )
                if not match:
                    messagebox.showerror(
                        "Categoría",
                        f"La categoría seleccionada no existe: {destination_key}",
                    )
                    return
        except Exception as exc:
            messagebox.showerror(
                "Categoría", f"No se pudo validar la categoría: {exc}"
            )
            return

        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_p = Product(
                name=p.name,
                description=p.description,
                price=p.price,
                discount=p.discount,
                stock=p.stock,
                category=destination_key,
                image_path=p.image_path,
                image_avif_path=p.image_avif_path,
                order=p.order,
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(
            f"Cambiar categoría a '{destination_key}' para {len(products)} producto(s)",
            pairs,
            operation="cambiar_categoria",
        )

    def bulk_percentage_discount(self) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo("Acción masiva", "Seleccione uno o más productos.")
            return
        pct = self._ask_number(
            "Aplicar descuento %", "Porcentaje (0-100):", min_val=0, max_val=100
        )
        if pct is None:
            return
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_p = Product(
                name=p.name,
                description=p.description,
                price=p.price,
                discount=int(p.price * (pct / 100)),
                stock=p.stock,
                category=p.category,
                image_path=p.image_path,
                order=p.order,
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(
            f"Descuento {pct}% a {len(products)} producto(s)",
            pairs,
            operation="descuento_porcentaje",
        )

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
            d = min(int(amount), p.price - 1) if p.price > 0 else 0
            new_p = Product(
                name=p.name,
                description=p.description,
                price=p.price,
                discount=d,
                stock=p.stock,
                category=p.category,
                image_path=p.image_path,
                order=p.order,
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(
            f"Descuento fijo ${int(amount):,} a {len(products)} producto(s)",
            pairs,
            operation="descuento_fijo",
        )

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
                order=p.order,
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(
            f"Stock {'ON' if value else 'OFF'} para {len(products)} producto(s)",
            pairs,
            operation="stock",
        )

    def bulk_adjust_price(self, increase: bool) -> None:
        products = self._get_selected_products()
        if not products:
            messagebox.showinfo("Acción masiva", "Seleccione uno o más productos.")
            return
        pct = self._ask_number(
            "Ajustar precio %", "Porcentaje (0-100):", min_val=0, max_val=100
        )
        if pct is None:
            return
        factor = 1 + (pct / 100) if increase else 1 - (pct / 100)
        pairs: List[tuple[Product, Product]] = []
        for p in products:
            new_price = max(1, int(round(p.price * factor)))
            new_discount = min(p.discount, new_price - 1) if new_price > 0 else 0
            new_p = Product(
                name=p.name,
                description=p.description,
                price=new_price,
                discount=new_discount,
                stock=p.stock,
                category=p.category,
                image_path=p.image_path,
                order=p.order,
            )
            pairs.append((p, new_p))
        self._preview_and_apply_operation(
            f"Precio {'+' if increase else '-'}{pct}% a {len(products)} producto(s)",
            pairs,
            operation="ajustar_precio",
        )

    def _preview_and_apply_operation(
        self,
        description: str,
        pairs: List[tuple[Product, Product]],
        *,
        operation: str = "bulk",
    ) -> None:
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
                    f"Stock: {'☑' if old.stock else '☐'} → {'☑' if new.stock else '☐'}"
                )
            if changes:
                changed_count += 1
                lines.append(f"• {old.name} — " + "; ".join(changes))
        preview_text = (
            f"{description}\n\nCambios: {changed_count} de {len(pairs)} productos\n\n"
            + "\n".join(lines[:50])
        )

        if not self._show_preview_dialog(preview_text):
            return

        # Build do/undo updates
        do_updates: List[tuple[str, str, Product]] = [
            (old.name, old.description, new) for old, new in pairs
        ]
        undo_updates: List[tuple[str, str, Product]] = [
            (new.name, new.description, old) for old, new in pairs
        ]
        try:
            self.product_service.batch_update(do_updates, operation=operation)
            # Push to undo history
            op = {"description": description, "do": do_updates, "undo": undo_updates}
            self._undo_stack.append(op)
            if len(self._undo_stack) > self._undo_max:
                self._undo_stack.pop(0)
            self._redo_stack.clear()
            self._update_history_buttons()
            self.refresh_products()
            self.update_status(f"{description} — aplicado")
        except ProductServiceError as exc:
            messagebox.showerror("Error", str(exc))

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

        ttk.Button(btn_frame, text="Confirmar", command=on_ok).pack(
            side=tk.LEFT, padx=6
        )
        ttk.Button(btn_frame, text="Cancelar", command=on_cancel).pack(
            side=tk.LEFT, padx=6
        )
        dialog.wait_window()
        return result["ok"]

    def _update_history_buttons(self) -> None:
        if hasattr(self, "undo_btn"):
            self.undo_btn.config(
                state=tk.NORMAL if len(self._undo_stack) > 0 else tk.DISABLED
            )
        if hasattr(self, "redo_btn"):
            self.redo_btn.config(
                state=tk.NORMAL if len(self._redo_stack) > 0 else tk.DISABLED
            )

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
        except ProductServiceError as exc:
            messagebox.showerror("Error", f"No se pudo deshacer: {str(exc)}")

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
        except ProductServiceError as exc:
            messagebox.showerror("Error", f"No se pudo rehacer: {str(exc)}")
