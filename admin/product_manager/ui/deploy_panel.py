"""Deploy panel mixin for the main window. Adds deploy toolbar and git/commit/push UI."""

from __future__ import annotations

import logging
from typing import Any, Optional

import tkinter as tk
from tkinter import messagebox, ttk

from ..deploy import (
    DeployPipeline,
    DeployProgress,
    DeployResult,
    DeployStep,
    STEP_LABELS,
)
from ..git_sync import GitSync
from .toast import ToastLevel, ToastManager

logger = logging.getLogger(__name__)

REFRESH_INTERVAL_MS = 30000

GIT_COLORS = {
    "clean": ("#27ae60", "#1a7340"),
    "dirty": ("#e67e22", "#b0601a"),
    "conflict": ("#c0392b", "#922b21"),
    "ahead": ("#2980b9", "#1a5c87"),
    "pending": ("#e67e22", "#b0601a"),
    "idle": ("#888888", "#666666"),
}

GIT_COLORS_DARK = {
    "clean": ("#98c379", "#7aa061"),
    "dirty": ("#d19a66", "#a77b52"),
    "conflict": ("#e06c75", "#b3565e"),
    "ahead": ("#61afef", "#4d8cbf"),
    "pending": ("#d19a66", "#a77b52"),
    "idle": ("#888888", "#aaaaaa"),
}


def _color_for_status(dark: bool, key: str) -> str:
    palette = GIT_COLORS_DARK if dark else GIT_COLORS
    return palette.get(key, palette["idle"])[0]


class DeployPanelMixin:
    """Mixin that adds deploy, commit, and push functionality to the main window."""

    # pylint: disable=attribute-defined-outside-init

    master: Any  # type: ignore[annotation-unchecked]
    deploy_pipeline: Optional[DeployPipeline]
    git_sync: Optional[GitSync]
    toast_manager: Optional[ToastManager]
    update_status: Any
    refresh_sync_status: Any
    refresh_products: Any
    _activity_log: Any

    def setup_deploy_integration(self):
        self.deploy_pipeline: Optional[DeployPipeline] = None
        self.git_sync: Optional[GitSync] = None
        self.toast_manager: Optional[ToastManager] = None
        self._dark_mode = False
        self._deploy_running = False
        self._git_status_job: Optional[str] = None
        self._deploy_collapsed = False
        self._deploy_toolbar_container: Optional[ttk.Frame] = None
        self._deploy_buttons_frame: Optional[ttk.Frame] = None
        self._git_indicator: Optional[tk.Canvas] = None

    def init_deploy_services(
        self,
        deploy_pipeline: Optional[DeployPipeline] = None,
        git_sync: Optional[GitSync] = None,
        dark_mode: bool = False,
    ):
        self.deploy_pipeline = deploy_pipeline
        self.git_sync = git_sync
        self._dark_mode = dark_mode

    def create_deploy_toolbar(self, parent: ttk.Frame) -> None:
        """Build the collapsible deploy toolbar with git status indicator."""
        self._deploy_toolbar_container = parent

        container = ttk.Frame(parent, style="Status.TFrame")
        container.pack(fill=tk.X)

        canvas_bg = "#252525" if self._dark_mode else "#eeeeee"
        self._git_indicator = tk.Canvas(
            container, width=14, height=14, bg=canvas_bg,
            highlightthickness=0, bd=0,
        )
        self._git_indicator.pack(side=tk.LEFT, padx=(8, 4), pady=5)

        self._toggle_deploy_btn = ttk.Button(
            container,
            text="▼",
            width=3,
            command=self._toggle_deploy_collapse,
        )
        self._toggle_deploy_btn.pack(side=tk.LEFT, padx=(0, 6))

        self.deploy_status_var = tk.StringVar(value="")
        status_label = ttk.Label(
            container,
            textvariable=self.deploy_status_var,
            font=("sans-serif", 10, "bold"),
        )
        status_label.pack(side=tk.LEFT, padx=(0, 10))

        self._deploy_buttons_frame = ttk.Frame(container, style="Status.TFrame")
        self._deploy_buttons_frame.pack(side=tk.LEFT)

        self.deploy_btn = ttk.Button(
            self._deploy_buttons_frame,
            text="Guardar y publicar",
            command=self._on_deploy_click,
            style="Accent.TButton",
            state=tk.DISABLED,
        )
        self.deploy_btn.pack(side=tk.LEFT, padx=2)

        self.commit_btn = ttk.Button(
            self._deploy_buttons_frame,
            text="Commit local",
            command=self._on_commit_click,
            state=tk.DISABLED,
        )
        self.commit_btn.pack(side=tk.LEFT, padx=2)

        self.push_btn = ttk.Button(
            self._deploy_buttons_frame,
            text="Push",
            command=self._on_push_click,
            state=tk.DISABLED,
        )
        self.push_btn.pack(side=tk.LEFT, padx=2)

        self.pull_btn = ttk.Button(
            self._deploy_buttons_frame,
            text="Pull",
            command=self._on_pull_click,
        )
        self.pull_btn.pack(side=tk.LEFT, padx=2)

        # Activity log toggle
        self._activity_toggle_btn = ttk.Button(
            container,
            text="Registro",
            width=9,
            command=self._toggle_activity_log,
        )
        self._activity_toggle_btn.pack(side=tk.RIGHT, padx=6)

    def _toggle_deploy_collapse(self):
        self._deploy_collapsed = not self._deploy_collapsed
        if self._deploy_collapsed:
            self._deploy_buttons_frame.pack_forget()
            self._toggle_deploy_btn.config(text="▶")
        else:
            self._deploy_buttons_frame.pack(
                side=tk.LEFT, before=self._activity_toggle_btn
            )
            self._toggle_deploy_btn.config(text="▼")

    def _toggle_activity_log(self):
        if hasattr(self, "_activity_frame") and self._activity_frame:
            if self._activity_frame.winfo_ismapped():
                self._activity_frame.pack_forget()
                self._activity_toggle_btn.config(text="Registro")
            else:
                self._activity_frame.pack(
                    side=tk.BOTTOM, fill=tk.X,
                    before=self.master.winfo_children()[-1],
                    padx=15, pady=(0, 5),
                )
                self._activity_toggle_btn.config(text="▼ Registro")
        elif hasattr(self, "refresh_products") and callable(self.refresh_products):
            self._create_activity_log()

    def _create_activity_log(self):
        self._activity_frame = ttk.Frame(self.master)
        self._activity_log_tree = ttk.Treeview(
            self._activity_frame,
            columns=("timestamp", "operation", "product", "detail"),
            show="headings",
            height=6,
        )
        self._activity_log_tree.heading("timestamp", text="Fecha")
        self._activity_log_tree.heading("operation", text="Operación")
        self._activity_log_tree.heading("product", text="Producto")
        self._activity_log_tree.heading("detail", text="Detalle")
        self._activity_log_tree.column("timestamp", width=140, anchor=tk.W)
        self._activity_log_tree.column("operation", width=90, anchor=tk.W)
        self._activity_log_tree.column("product", width=220, anchor=tk.W)
        self._activity_log_tree.column("detail", width=300, anchor=tk.W)

        scrollbar = ttk.Scrollbar(
            self._activity_frame, orient="vertical", command=self._activity_log_tree.yview
        )
        self._activity_log_tree.configure(yscrollcommand=scrollbar.set)
        self._activity_log_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self._activity_frame.pack(
            side=tk.BOTTOM, fill=tk.X,
            before=self.master.winfo_children()[-1],
            padx=15, pady=(0, 5),
        )
        self._activity_toggle_btn.config(text="▼ Registro")

    def _append_activity(self, operation: str, product_name: str, detail: str = ""):
        from datetime import datetime

        if not hasattr(self, "_activity_log_tree"):
            return
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            self._activity_log_tree.insert(
                "", "end",
                values=(ts, operation, product_name, detail),
            )
            children = self._activity_log_tree.get_children()
            if len(children) > 100:
                self._activity_log_tree.delete(children[0])
        except Exception as exc:
            logger.debug("Error al registrar actividad: %s", exc)

    def create_toast_manager(self) -> None:
        self.toast_manager = ToastManager(
            self.master, max_toasts=4, dark_mode=self._dark_mode
        )

    def update_theme_toasts(self, dark_mode: bool):
        self._dark_mode = dark_mode
        if self.toast_manager:
            self.toast_manager.set_dark_mode(dark_mode)
        self._refresh_git_status()

    def _toast(self, message: str, level: ToastLevel = ToastLevel.INFO):
        if self.toast_manager:
            self.toast_manager.show(message, level)

    # ------------------------------------------------------------------
    #  Git status polling (color-coded)
    # ------------------------------------------------------------------

    def start_git_status_polling(self):
        self._refresh_git_status()

    def _paint_git_dot(self, color_key: str):
        if not self._git_indicator:
            return
        c = self._git_indicator
        color = _color_for_status(self._dark_mode, color_key)
        c.delete("all")
        c.create_oval(2, 2, 12, 12, fill=color, outline="")

    def _refresh_git_status(self):
        has_deploy = bool(self.deploy_pipeline)
        has_git = bool(self.git_sync)

        if not has_git:
            self.deploy_status_var.set("Git no detectado")
            self._paint_git_dot("idle")
            self.deploy_btn.config(state=tk.DISABLED)
            self.commit_btn.config(state=tk.DISABLED)
            self.push_btn.config(state=tk.DISABLED)
            self._git_status_job = self.master.after(REFRESH_INTERVAL_MS, self._refresh_git_status)
            return

        try:
            git_status = self.git_sync.get_status()

            if not git_status.branch:
                self.deploy_status_var.set("Sin rama activa")
                self._paint_git_dot("idle")
                self.deploy_btn.config(state=tk.DISABLED)
                self.commit_btn.config(state=tk.DISABLED)
                self.push_btn.config(state=tk.DISABLED)
            elif git_status.has_conflicts:
                self.deploy_status_var.set(f"CONFLICTOS en {git_status.branch}")
                self._paint_git_dot("conflict")
                self.deploy_btn.config(state=tk.DISABLED)
                self.commit_btn.config(state=tk.DISABLED)
            elif git_status.dirty:
                count = git_status.change_count + git_status.untracked_count
                self.deploy_status_var.set(
                    f"{git_status.branch} · {count} cambio(s) sin commit"
                )
                self._paint_git_dot("dirty")
                self.deploy_btn.config(state=tk.NORMAL if has_deploy else tk.DISABLED)
                self.commit_btn.config(state=tk.NORMAL)
                self.push_btn.config(
                    state=tk.NORMAL if git_status.ahead > 0 else tk.DISABLED
                )
            elif git_status.ahead > 0:
                self.deploy_status_var.set(
                    f"{git_status.branch} · {git_status.ahead} commit(s) por subir"
                )
                self._paint_git_dot("ahead")
                self.deploy_btn.config(state=tk.DISABLED)
                self.commit_btn.config(state=tk.DISABLED)
                self.push_btn.config(state=tk.NORMAL)
            else:
                self.deploy_status_var.set(f"{git_status.branch} · sin cambios")
                self._paint_git_dot("clean")
                self.deploy_btn.config(state=tk.DISABLED)
                self.commit_btn.config(state=tk.DISABLED)
                self.push_btn.config(state=tk.DISABLED)

            self.pull_btn.config(
                state=tk.NORMAL if git_status.behind > 0 else tk.DISABLED
            )

            if git_status.behind > 0:
                current = self.deploy_status_var.get()
                self.deploy_status_var.set(f"{current} · remoto +{git_status.behind}")

        except Exception as exc:
            logger.debug("Error al obtener estado de git: %s", exc)
            self.deploy_status_var.set("Error al consultar git")
            self._paint_git_dot("idle")

        self._git_status_job = self.master.after(
            REFRESH_INTERVAL_MS, self._refresh_git_status
        )

    # ------------------------------------------------------------------
    #  Actions
    # ------------------------------------------------------------------

    def _on_deploy_click(self):
        if not self.deploy_pipeline:
            messagebox.showinfo("Publicar", "El pipeline de despliegue no está disponible.")
            return
        if self._deploy_running:
            self._toast("Ya hay un despliegue en curso.", ToastLevel.WARNING)
            return

        if not messagebox.askyesno(
            "Publicar cambios",
            "Esto ejecutará la sincronización de categorías, "
            "generación de imágenes OG, commit y push.\n\n"
            "¿Desea continuar?",
        ):
            return

        self._run_deploy(push=True)

    def _on_commit_click(self):
        if not self.git_sync:
            return

        try:
            msg = self.git_sync.build_commit_message()
            result = self.git_sync.sync_changes(
                message=msg, stage=True, push=False
            )
            if result.get("committed"):
                self._toast(f"Commit creado: {result.get('hash', 'HEAD')}", ToastLevel.SUCCESS)
                self._refresh_git_status()
            elif result.get("error"):
                self._toast(result["error"], ToastLevel.INFO)
        except Exception as exc:
            self._toast(f"Error: {exc}", ToastLevel.ERROR)

    def _on_push_click(self):
        if not self.git_sync:
            return
        try:
            ok = self.git_sync.push()
            if ok:
                self._toast("Push exitoso", ToastLevel.SUCCESS)
            else:
                self._toast("Push fallido. Revise los logs.", ToastLevel.ERROR)
        except Exception as exc:
            self._toast(f"Error: {exc}", ToastLevel.ERROR)
        finally:
            self._refresh_git_status()

    def _on_pull_click(self):
        if not self.git_sync:
            return
        self._toast("Obteniendo cambios del remoto...", ToastLevel.INFO)
        try:
            ok = self.git_sync.pull()
            if ok:
                self._toast("Pull exitoso", ToastLevel.SUCCESS)
            else:
                self._toast("Pull con conflictos. Intervención manual requerida.", ToastLevel.WARNING)
        except Exception as exc:
            self._toast(f"Error: {exc}", ToastLevel.ERROR)
        finally:
            self._refresh_git_status()

    # ------------------------------------------------------------------
    #  Full deploy pipeline (threaded)
    # ------------------------------------------------------------------

    def _run_deploy(self, push: bool):
        self._deploy_running = True
        self._deploy_progress_dialog = None
        self._paint_git_dot("pending")
        self.deploy_btn.config(state=tk.DISABLED, text="Publicando...")

        def on_progress(progress: DeployProgress):
            self.master.after(0, lambda: self._handle_deploy_progress(progress))

        def on_complete(result: DeployResult):
            self.master.after(0, lambda: self._handle_deploy_result(result))

        if self.deploy_pipeline:
            self.deploy_pipeline.skip_push = not push
            self.deploy_pipeline.run_async(
                on_progress=on_progress,
                on_complete=on_complete,
            )

    def _handle_deploy_progress(self, progress: DeployProgress):
        if progress.step == DeployStep.DONE:
            return
        self.update_status(STEP_LABELS.get(progress.step, progress.message))

    def _handle_deploy_result(self, result: DeployResult):
        self._deploy_running = False
        self.deploy_btn.config(text="Guardar y publicar")

        if result.success:
            parts = ["Publicación exitosa"]
            if result.committed:
                parts.append(f"Commit: {result.commit_hash}")
            if result.pushed:
                parts.append("Push completado")
            self._toast(" | ".join(parts), ToastLevel.SUCCESS)

            if result.warnings:
                for warning in result.warnings:
                    self._toast(warning, ToastLevel.WARNING)
        else:
            for error in result.errors:
                self._toast(error, ToastLevel.ERROR)

        self._refresh_git_status()
        self.refresh_sync_status()

    def cleanup_deploy(self):
        if self._git_status_job:
            try:
                self.master.after_cancel(self._git_status_job)
            except Exception:
                pass
