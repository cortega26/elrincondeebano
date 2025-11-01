"""
Product Manager Application
--------------------------
Main entry point for the Product Manager application.
Handles initialization, configuration, and application lifecycle.
"""

import tkinter as tk
from tkinter import messagebox
import logging
import logging.handlers
import json
import sys
import os
from copy import deepcopy
from typing import Optional, Dict, Any
from pathlib import Path
import argparse
from contextlib import contextmanager
import threading
import signal
import traceback
from repositories import JsonProductRepository
from category_repository import JsonCategoryRepository
from category_service import CategoryService
from services import ProductService
from gui import ProductGUI, UIConfig
from sync import SyncEngine


class ApplicationError(Exception):
    """Base exception for application-level errors."""
    pass


class ConfigurationError(ApplicationError):
    """Raised when there's an error in configuration."""
    pass


class ProductManager:
    """Main application class managing lifecycle and dependencies."""

    # Default configuration
    DEFAULT_CONFIG = {
        "data_dir": r"C:\Users\corte\VS Code Projects\Tienda Ebano\data",
        "product_file": "product_data.json",
        "category_file": "categories.json",
        "log_dir": "~/product_manager_logs",
        "log_level": "INFO",
        "max_log_size": 5_242_880,  # 5MB
        "backup_count": 3,
        "ui": {
            "font_size": 11,
            "window_size": [1200, 800],
            "enable_animations": True,
            "locale": "es"
        },
        "sync": {
            "enabled": False,
            "api_base": "",
            "queue_file": "sync_queue.json",
            "poll_interval": 60,
            "pull_interval": 300,
            "timeout": 10
        }
    }

    def __init__(self):
        """Initialize the application."""
        self.exit_event = threading.Event()
        self.config: Dict[str, Any] = {}
        self.logger: Optional[logging.Logger] = None
        self.gui: Optional[ProductGUI] = None
        self.category_service: Optional[CategoryService] = None
        self.sync_engine = None
        self._setup_signal_handlers()

    def _setup_signal_handlers(self) -> None:
        """Set up handlers for system signals."""
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, self._handle_shutdown_signal)

    def _handle_shutdown_signal(self, signum: int, frame) -> None:
        """Handle shutdown signals gracefully."""
        if self.logger:
            self.logger.info(
                f"Received signal {signum}, initiating shutdown...")
        self.exit_event.set()

    def initialize(self, config_path: Optional[str] = None) -> None:
        """
        Initialize the application with configuration.

        Args:
            config_path: Optional path to configuration file

        Raises:
            ConfigurationError: If configuration is invalid
        """
        try:
            self.config = self._load_configuration(config_path)
            self._setup_logging()
            self._setup_directories()
            self.logger.info("Application initialization started")
        except Exception as e:
            raise ConfigurationError(f"Failed to initialize application: {e}")

    def _load_configuration(self, config_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Load application configuration.

        Args:
            config_path: Optional path to configuration file

        Returns:
            Dict containing configuration
        """
        config = deepcopy(self.DEFAULT_CONFIG)

        if config_path:
            try:
                with open(config_path, 'r') as f:
                    user_config = json.load(f)
                for key, value in user_config.items():
                    if key in ("ui", "sync") and isinstance(value, dict):
                        config[key].update(value)
                    else:
                        config[key] = value
            except Exception as e:
                raise ConfigurationError(
                    f"Failed to load configuration from {config_path}: {e}")

        # Expand paths
        config['data_dir'] = os.path.expanduser(config['data_dir'])
        config['log_dir'] = os.path.expanduser(config['log_dir'])

        return config

    def _setup_logging(self) -> None:
        """Configure application logging."""
        self.logger = logging.getLogger('ProductManager')
        self.logger.setLevel(getattr(logging, self.config['log_level']))

        # Create log directory
        log_dir = Path(self.config['log_dir'])
        log_dir.mkdir(parents=True, exist_ok=True)

        # File handler with rotation
        log_file = log_dir / 'product_manager.log'
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=self.config['max_log_size'],
            backupCount=self.config['backup_count']
        )
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        ))
        self.logger.addHandler(file_handler)

        # Console handler for development
        if self._is_development_mode():
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(logging.Formatter(
                '%(levelname)s: %(message)s'
            ))
            self.logger.addHandler(console_handler)

    def _setup_directories(self) -> None:
        """Create necessary application directories."""
        for path in (self.config['data_dir'], self.config['log_dir']):
            Path(path).mkdir(parents=True, exist_ok=True)

    def _is_development_mode(self) -> bool:
        """Check if application is running in development mode."""
        return os.environ.get('PRODUCT_MANAGER_ENV') == 'development'

    @contextmanager
    def error_handler(self):
        """Context manager for handling application errors."""
        try:
            yield
        except Exception as e:
            if self.logger:
                self.logger.error(f"Unhandled error: {e}")
                self.logger.debug(traceback.format_exc())
            message = (f"Ha ocurrido un error inesperado: {str(e)}\n\n"
                       "Por favor revise el archivo de registro para más detalles.")
            if self.gui and self.gui.master:
                messagebox.showerror("Error", message)
            else:
                print(f"Error: {e}", file=sys.stderr)

    def _create_category_repository(self) -> JsonCategoryRepository:
        """Create repository for category catalog."""
        category_file = os.path.join(
            self.config['data_dir'],
            self.config.get('category_file', 'categories.json')
        )
        return JsonCategoryRepository(category_file)

    def _create_category_service(self, repository: JsonCategoryRepository) -> CategoryService:
        """Create the category service."""
        return CategoryService(repository)

    def _create_repository(self) -> JsonProductRepository:
        """Create and configure the product repository."""
        product_file = os.path.join(
            self.config['data_dir'],
            self.config['product_file']
        )
        return JsonProductRepository(product_file)

    def _create_service(self, repository: JsonProductRepository, category_service: Optional[CategoryService] = None) -> ProductService:
        """Create and configure the product service."""
        return ProductService(repository, category_service)

    def _create_sync_engine(self, repository: JsonProductRepository, service: ProductService) -> Optional[SyncEngine]:
        """Initialize the synchronization engine if enabled."""
        sync_cfg = self.config.get('sync', {})
        queue_name = sync_cfg.get('queue_file', 'sync_queue.json')
        queue_path = os.path.join(self.config['data_dir'], queue_name)
        if not sync_cfg.get('enabled', True):
            self.logger.info(
                "Remote synchronization disabled by configuration")
            service.set_sync_engine(None)
            return None
        api_base = (sync_cfg.get('api_base') or "").strip()
        if not api_base:
            self.logger.info(
                "No sync API configured; skipping SyncEngine initialization")
            service.set_sync_engine(None)
            return None
        engine = SyncEngine(
            api_base=api_base,
            repository=repository,
            service=service,
            queue_file=queue_path,
            enabled=sync_cfg.get('enabled', True),
            poll_interval=sync_cfg.get('poll_interval', 60),
            pull_interval=sync_cfg.get('pull_interval', 300),
            timeout=sync_cfg.get('timeout', 10),
            logger=self.logger,
        )
        service.set_sync_engine(engine)
        return engine

    def _create_ui_config(self) -> UIConfig:
        """Create UI configuration."""
        ui_config = self.config['ui']
        return UIConfig(
            font_size=ui_config['font_size'],
            window_size=tuple(ui_config['window_size']),
            enable_animations=ui_config['enable_animations'],
            locale=ui_config['locale']
        )

    def run(self) -> None:
        """Run the application using Tkinter's main loop."""
        with self.error_handler():
            self.logger.info("Starting application")

            # Initialize Tk
            root = tk.Tk()
            root.protocol("WM_DELETE_WINDOW", self._on_window_close)

            # Set up components
            category_repository = self._create_category_repository()
            self.category_service = self._create_category_service(
                category_repository)
            repository = self._create_repository()
            service = self._create_service(repository, self.category_service)
            self.sync_engine = self._create_sync_engine(repository, service)
            ui_config = self._create_ui_config()

            # Create and run GUI
            self.gui = ProductGUI(root, service, self.category_service)

            # Configure window using ui_config
            root.title("Gestor de Productos")
            root.geometry(
                f"{ui_config.window_size[0]}x{ui_config.window_size[1]}")

            # Start update checker in background
            self._start_update_checker()

            # Schedule periodic check for exit_event
            self._check_exit(root)

            # Start Tkinter main loop
            root.mainloop()

            self._cleanup()

    def _check_exit(self, root: tk.Tk) -> None:
        """Periodically check if an exit event has been triggered and close the app."""
        if self.exit_event.is_set():
            self.logger.info("Exit event detected, closing the application.")
            root.quit()
        else:
            root.after(100, lambda: self._check_exit(root))

    def _start_update_checker(self) -> None:
        """Start background synchronization loop if available."""
        if self.sync_engine:
            self.sync_engine.start_background(self.exit_event)

    def _on_window_close(self) -> None:
        """Handle window close event."""
        self.logger.info("Application shutdown initiated by user")
        self.exit_event.set()

    def _cleanup(self) -> None:
        """Clean up resources before exit."""
        self.logger.info("Cleaning up resources")
        try:
            if self.gui and self.gui.master:
                self.gui.master.destroy()
        except Exception as e:
            self.logger.error(f"Error during cleanup: {e}")
        finally:
            self.logger.info("Application shutdown complete")
            logging.shutdown()


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Product Manager Application")
    parser.add_argument(
        "--config",
        help="Path to configuration file",
        default=None
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode"
    )
    return parser.parse_args()


def main():
    """Application entry point."""
    args = parse_arguments()

    if args.debug:
        os.environ['PRODUCT_MANAGER_ENV'] = 'development'

    app = ProductManager()

    try:
        app.initialize(args.config)
        app.run()
    except Exception as e:
        print(f"Error fatal: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
