"""Gallery view widgets for product browsing."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import tkinter as tk
from tkinter import ttk

from ..models import Product
from .utils import PIL_AVAILABLE, load_thumbnail


class GalleryFrame(ttk.Frame):
    """Card-based gallery view for products."""
    # UI widget holds many references and mixes in Tk widgets.
    # pylint: disable=too-many-ancestors,too-many-instance-attributes

    def __init__(
        self,
        master,
        on_edit_callback: Callable[[Product], None],
        image_cache: Dict[str, Any],
        project_root: Optional[Path] = None,
    ):
        super().__init__(master)
        self.on_edit = on_edit_callback
        self.image_cache = image_cache
        self.project_root = project_root
        self.cards: List[Any] = []
        self.products: List[Product] = []
        self.card_width = 180
        self.card_height = 240
        self.grid_columns = 4

        self.canvas = tk.Canvas(self, bg="#f5f5f5", highlightthickness=0)
        self.scrollbar = ttk.Scrollbar(
            self, orient="vertical", command=self.canvas.yview
        )
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.content_frame = tk.Frame(self.canvas, bg="#f5f5f5")
        self.canvas_window = self.canvas.create_window(
            (0, 0), window=self.content_frame, anchor="nw"
        )

        self.content_frame.bind("<Configure>", self._on_frame_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        self.bind_mouse_scroll()

    def bind_mouse_scroll(self) -> None:
        """Bind cross-platform mouse wheel events."""
        # Windows/MacOS scroll support
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)
        self.canvas.bind_all("<Button-4>", self._on_mousewheel)
        self.canvas.bind_all("<Button-5>", self._on_mousewheel)

    def _on_mousewheel(self, event) -> None:
        """Handle mouse wheel scrolling."""
        if self.winfo_ismapped():
            if event.num == 5 or event.delta < 0:
                self.canvas.yview_scroll(1, "units")
            elif event.num == 4 or event.delta > 0:
                self.canvas.yview_scroll(-1, "units")

    def _on_frame_configure(self, _event=None) -> None:
        """Update scroll region when inner frame changes."""
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, event) -> None:
        """Recalculate grid layout on canvas resize."""
        width = event.width
        self.canvas.itemconfig(self.canvas_window, width=width)
        # Recalculate grid if width changed significantly
        new_cols = max(1, width // (self.card_width + 20))
        if new_cols != self.grid_columns:
            self.grid_columns = new_cols
            self.render_products()

    def render_products(self, products: Optional[List[Product]] = None) -> None:
        """Render product cards in the gallery."""
        if products is not None:
            self.products = products

        # Clear existing
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        if not self.products:
            ttk.Label(
                self.content_frame,
                text="No hay productos para mostrar",
                background="#f5f5f5",
            ).pack(pady=20)
            return

        for i, product in enumerate(self.products):
            row = i // self.grid_columns
            col = i % self.grid_columns
            self._create_card(product, row, col)

    def _create_card(self, product: Product, row: int, col: int) -> None:
        """Create a single product card."""
        # pylint: disable=too-many-locals
        card = tk.Frame(self.content_frame, bg="white", relief="raised", bd=1)
        card.grid(row=row, column=col, padx=10, pady=10, sticky="nsew")
        card.grid_propagate(False)
        card.config(width=self.card_width, height=self.card_height)

        # Bind interactions
        for widget in (card,):
            widget.bind("<Double-Button-1>", lambda e, p=product: self.on_edit(p))

        # Image
        img_container = tk.Label(card, bg="#eee", text="Sin imagen")
        img_container.place(x=0, y=0, width=self.card_width, height=140)

        if PIL_AVAILABLE:
            image = self._get_cached_image(product)
            if image:
                img_container.config(image=image, text="")
                img_container.image = image  # type: ignore

        # Details
        lbl_name = tk.Label(
            card,
            text=product.name,
            bg="white",
            font=("Segoe UI", 9, "bold"),
            anchor="w",
        )
        lbl_name.place(x=5, y=145, width=self.card_width - 10)

        price_txt = f"${product.price:,}"
        if product.discount > 0:
            price_txt += f" (-{product.discount:,})"
        lbl_price = tk.Label(card, text=price_txt, bg="white", fg="#007acc")
        lbl_price.place(x=5, y=165, width=self.card_width - 10)

        stock_color = "green" if product.stock else "red"
        stock_txt = "En Stock" if product.stock else "Sin Stock"
        lbl_stock = tk.Label(
            card, text=stock_txt, bg="white", fg=stock_color, font=("Segoe UI", 8)
        )
        lbl_stock.place(x=5, y=185)

        lbl_cat = tk.Label(
            card,
            text=product.category or "",
            bg="white",
            fg="#666",
            font=("Segoe UI", 8),
            anchor="e",
        )
        lbl_cat.place(x=60, y=185, width=self.card_width - 70)

        # Bind events to all children
        for child in card.winfo_children():
            child.bind("<Double-Button-1>", lambda e, p=product: self.on_edit(p))

    def _get_cached_image(self, product: Product):
        """Return a cached thumbnail for the product, if available."""
        # Prefer AVIF, then Path, then placeholder
        path = product.image_avif_path or product.image_path
        if not path:
            return None

        full_path = path

        # Helper to confirm if path exists
        def check_path(p: str) -> Optional[str]:
            """Return path if it exists, otherwise None."""
            if os.path.exists(p):
                return p
            return None

        # 1. Try absolute path
        if os.path.isabs(path):
            if not check_path(path):
                return None
        else:
            # 2. Try relative to Project Root (Best practice)
            found = None
            if self.project_root:
                # Try Path object join
                candidate = self.project_root / path
                if candidate.exists():
                    found = str(candidate)

            # 3. Try relative to CWD (Fallback)
            if not found:
                candidate = os.path.abspath(path)
                if os.path.exists(candidate):
                    found = candidate

            if not found:
                return None
            full_path = found

        if full_path in self.image_cache:
            return self.image_cache[full_path]

        tk_img = load_thumbnail(full_path, self.card_width, 140)
        if tk_img:
            self.image_cache[full_path] = tk_img
            return tk_img
        return None
