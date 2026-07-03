#!/usr/bin/env python3
"""Migra los datos existentes de JSON a SQLite.

Uso:
    python tools/migrate-to-sqlite.py                  # migrar desde data/
    python tools/migrate-to-sqlite.py --export          # migrar + exportar a astro-poc/public/data/
    python tools/migrate-to-sqlite.py --dry-run         # solo validar, sin escribir
"""

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "admin"))

from product_manager.data_store import DataStore

DB_PATH = REPO_ROOT / "data" / "storefront.db"
JSON_DIR = REPO_ROOT / "data"
ASTRO_DATA_DIR = REPO_ROOT / "astro-poc" / "public" / "data"


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrar datos JSON a SQLite")
    parser.add_argument("--export", action="store_true", help="Exportar a astro-poc/public/data/ después de migrar")
    parser.add_argument("--dry-run", action="store_true", help="Solo validar sin escribir en la DB")
    args = parser.parse_args()

    if args.dry_run:
        print("🔍 Modo dry-run: solo validando archivos JSON...")
        products_file = JSON_DIR / "product_data.json"
        if not products_file.exists():
            print(f"❌ No se encontró {products_file}")
            sys.exit(1)
        import json
        data = json.loads(products_file.read_text(encoding="utf-8"))
        products = data.get("products", []) if isinstance(data, dict) else data
        print(f"   {len(products)} productos encontrados en JSON")
        print("✅ Validación completada (sin cambios).")
        return

    store = DataStore(DB_PATH)

    try:
        count = store.import_from_json(JSON_DIR)
        print(f"✅ {count} productos importados a {DB_PATH}")
    except FileNotFoundError as e:
        print(f"❌ {e}")
        sys.exit(1)

    # Mostrar la colección
    products = store.get_products()
    print(f"   Productos activos: {len(products)}")
    archived = store.get_products(include_archived=True)
    archived_only = [p for p in archived if p.is_archived]
    print(f"   Productos archivados: {len(archived_only)}")
    bundles = store.get_bundles()
    print(f"   Combos: {len(bundles)}")

    if args.export:
        store.export_to_json(ASTRO_DATA_DIR)
        print(f"✅ Datos exportados a {ASTRO_DATA_DIR}")
        print("   Ejecuta 'npm run build' para reconstruir el sitio.")


if __name__ == "__main__":
    main()
