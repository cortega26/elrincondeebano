"""Path constants for the admin web UI."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = REPO_ROOT / "data" / "storefront.db"
DATA_DIR = REPO_ROOT / "data"
ASTRO_DATA_DIR = REPO_ROOT / "astro-poc" / "public" / "data"
