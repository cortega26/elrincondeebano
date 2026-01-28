"""Dialog windows for the product manager UI."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Callable, Optional

import tkinter as tk
from tkinter import messagebox, ttk

from .components import UIConfig

logger = logging.getLogger(__name__)


class PreferencesDialog(tk.Toplevel):
    """Dialog for application preferences."""

    def __init__(
        self, parent: tk.Tk, config: UIConfig, on_save: Optional[Callable] = None
    ):
        super().__init__(parent)
        self.title("Preferencias")
        self._parent = parent
        self.ui_config = config
        self.on_save = on_save
        self.setup_dialog()

    def setup_dialog(self) -> None:
        """Set up the preferences dialog."""
        self.geometry("400x300")
        self.resizable(False, False)
        self.transient(self._parent)
        self.grab_set()
        ttk.Label(self, text="Tamaño de Fuente:").grid(
            row=1, column=0, padx=10, pady=5, sticky=tk.W
        )
        self.font_var = tk.IntVar(value=self.ui_config.font_size)
        font_spin = ttk.Spinbox(
            self, from_=8, to=16, textvariable=self.font_var, width=5
        )
        font_spin.grid(row=1, column=1, padx=10, pady=5, sticky=tk.W)
        ttk.Label(self, text="Habilitar Animaciones:").grid(
            row=2, column=0, padx=10, pady=5, sticky=tk.W
        )
        self.anim_var = tk.BooleanVar(value=self.ui_config.enable_animations)
        ttk.Checkbutton(self, variable=self.anim_var).grid(
            row=2, column=1, padx=10, pady=5, sticky=tk.W
        )
        button_frame = ttk.Frame(self)
        button_frame.grid(row=3, column=0, columnspan=2, pady=20)
        ttk.Button(button_frame, text="Guardar", command=self.save_preferences).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(button_frame, text="Cancelar", command=self.destroy).pack(
            side=tk.LEFT, padx=5
        )

    def save_preferences(self) -> None:
        """Save preferences to configuration."""
        try:
            self.ui_config.font_size = self.font_var.get()
            self.ui_config.enable_animations = self.anim_var.get()
            config_path = Path.home() / ".product_manager" / "config.json"
            config_path.parent.mkdir(parents=True, exist_ok=True)
            existing: dict[str, object] = {}
            if config_path.exists():
                try:
                    with open(config_path, encoding="utf-8") as f:
                        existing = json.load(f)
                    if not isinstance(existing, dict):
                        existing = {}
                except Exception:
                    existing = {}
            with open(config_path, "w", encoding="utf-8") as f:
                existing.update(
                    {
                        "font_size": self.ui_config.font_size,
                        "enable_animations": self.ui_config.enable_animations,
                        "window_size": self.ui_config.window_size,
                        "locale": self.ui_config.locale,
                    }
                )
                json.dump(existing, f, indent=2, ensure_ascii=False)
            if self.on_save:
                self.on_save()
            self.destroy()
            messagebox.showinfo("Éxito", "Preferencias guardadas y aplicadas.")
        except Exception as exc:  # pylint: disable=broad-exception-caught
            messagebox.showerror("Error", f"Error al guardar preferencias: {str(exc)}")


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
        scrollbar = ttk.Scrollbar(help_text, orient="vertical", command=help_text.yview)
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
        label = ttk.Label(self, text=about_text, justify=tk.CENTER, padding=20)
        label.pack(expand=True)
        ttk.Button(self, text="Cerrar", command=self.destroy).pack(pady=10)
