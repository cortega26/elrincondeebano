"""SQLite data store for the product manager.

Replaces direct JSON file manipulation with an SQLite-backed store that provides:
- Atomic transactions (no risk of JSON corruption)
- Change history via triggers
- Export to the JSON format expected by the Astro build pipeline
- Backward-compatible import from existing JSON files
"""

import json
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

SCHEMA_VERSION = 1

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price INTEGER DEFAULT 0,
    discount INTEGER DEFAULT 0,
    stock INTEGER DEFAULT 1,
    category TEXT NOT NULL DEFAULT '',
    brand TEXT DEFAULT '',
    image_path TEXT DEFAULT '',
    image_avif_path TEXT DEFAULT '',
    thumbnail_path TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    bundle_price INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bundle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id TEXT NOT NULL REFERENCES bundles(bundle_id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS change_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    changes TEXT DEFAULT '{}',
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_products_archived ON products(is_archived);
CREATE INDEX IF NOT EXISTS idx_bundles_bundle_id ON bundles(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_change_history_table ON change_history(table_name, record_id);
"""


@dataclass
class Product:
    """Product record matching the storefront JSON schema."""

    sku: str
    name: str
    category: str
    description: str = ""
    price: int = 0
    discount: int = 0
    stock: bool = True
    brand: str = ""
    image_path: str = ""
    image_avif_path: str = ""
    thumbnail_path: str = ""
    sort_order: int = 0
    is_archived: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "price": self.price,
            "discount": self.discount,
            "stock": self.stock,
            "brand": self.brand,
            "image_path": self.image_path,
            "image_avif_path": self.image_avif_path,
            "thumbnail_path": self.thumbnail_path,
            "order": self.sort_order,
            "is_archived": self.is_archived,
        }


@dataclass
class BundleItem:
    category: str
    name: str

    def to_dict(self) -> Dict[str, str]:
        return {"category": self.category, "name": self.name}


@dataclass
class Bundle:
    bundle_id: str
    title: str
    description: str
    items: List[BundleItem] = field(default_factory=list)
    bundle_price: int = 0

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.bundle_id,
            "title": self.title,
            "description": self.description,
            "items": [item.to_dict() for item in self.items],
        }
        if self.bundle_price > 0:
            data["bundlePrice"] = self.bundle_price
        return data


class DataStore:
    """SQLite-backed store for products, bundles, and change history."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with self._connection() as conn:
            conn.executescript(CREATE_TABLES_SQL)
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)"
            )
            conn.execute(
                "INSERT OR IGNORE INTO schema_version (version) VALUES (?)",
                (SCHEMA_VERSION,),
            )

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ── Products ──────────────────────────────────────────────────────────

    def get_products(self, include_archived: bool = False) -> List[Product]:
        query = "SELECT * FROM products"
        if not include_archived:
            query += " WHERE is_archived = 0"
        query += " ORDER BY category, sort_order, name"

        with self._connection() as conn:
            rows = conn.execute(query).fetchall()
        return [self._row_to_product(row) for row in rows]

    def get_product(self, sku: str) -> Optional[Product]:
        with self._connection() as conn:
            row = conn.execute("SELECT * FROM products WHERE sku = ?", (sku,)).fetchone()
        return self._row_to_product(row) if row else None

    def upsert_product(self, product: Product) -> None:
        existing = self.get_product(product.sku)
        with self._connection() as conn:
            if existing:
                conn.execute(
                    """UPDATE products SET
                        name=?, description=?, price=?, discount=?, stock=?,
                        category=?, brand=?, image_path=?, image_avif_path=?,
                        thumbnail_path=?, sort_order=?, is_archived=?,
                        updated_at=datetime('now')
                    WHERE sku=?""",
                    (
                        product.name, product.description, product.price, product.discount,
                        1 if product.stock else 0, product.category, product.brand,
                        product.image_path, product.image_avif_path, product.thumbnail_path,
                        product.sort_order, 1 if product.is_archived else 0,
                        product.sku,
                    ),
                )
                self._log_change(conn, "products", product.sku, "update")
            else:
                conn.execute(
                    """INSERT INTO products
                        (sku, name, description, price, discount, stock, category, brand,
                         image_path, image_avif_path, thumbnail_path, sort_order, is_archived)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        product.sku, product.name, product.description, product.price,
                        product.discount, 1 if product.stock else 0, product.category,
                        product.brand, product.image_path, product.image_avif_path,
                        product.thumbnail_path, product.sort_order,
                        1 if product.is_archived else 0,
                    ),
                )
                self._log_change(conn, "products", product.sku, "insert")

    def delete_product(self, sku: str) -> bool:
        with self._connection() as conn:
            cursor = conn.execute("DELETE FROM products WHERE sku = ?", (sku,))
            if cursor.rowcount > 0:
                self._log_change(conn, "products", sku, "delete")
                return True
        return False

    def _row_to_product(self, row: sqlite3.Row) -> Product:
        return Product(
            sku=row["sku"],
            name=row["name"],
            category=row["category"],
            description=row["description"] or "",
            price=row["price"] or 0,
            discount=row["discount"] or 0,
            stock=bool(row["stock"]),
            brand=row["brand"] or "",
            image_path=row["image_path"] or "",
            image_avif_path=row["image_avif_path"] or "",
            thumbnail_path=row["thumbnail_path"] or "",
            sort_order=row["sort_order"] or 0,
            is_archived=bool(row["is_archived"]),
        )

    # ── Bundles ───────────────────────────────────────────────────────────

    def get_bundles(self) -> List[Bundle]:
        with self._connection() as conn:
            bundle_rows = conn.execute("SELECT * FROM bundles ORDER BY created_at").fetchall()
        bundles = []
        for row in bundle_rows:
            items = self._get_bundle_items(row["bundle_id"])
            bundles.append(
                Bundle(
                    bundle_id=row["bundle_id"],
                    title=row["title"],
                    description=row["description"],
                    items=items,
                    bundle_price=row["bundle_price"] or 0,
                )
            )
        return bundles

    def _get_bundle_items(self, bundle_id: str) -> List[BundleItem]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT category, name FROM bundle_items WHERE bundle_id = ? ORDER BY sort_order",
                (bundle_id,),
            ).fetchall()
        return [BundleItem(category=row["category"], name=row["name"]) for row in rows]

    def upsert_bundle(self, bundle: Bundle) -> None:
        with self._connection() as conn:
            existing = conn.execute(
                "SELECT bundle_id FROM bundles WHERE bundle_id = ?", (bundle.bundle_id,)
            ).fetchone()
            if existing:
                conn.execute(
                    """UPDATE bundles SET title=?, description=?, bundle_price=?,
                        updated_at=datetime('now') WHERE bundle_id=?""",
                    (bundle.title, bundle.description, bundle.bundle_price, bundle.bundle_id),
                )
                conn.execute("DELETE FROM bundle_items WHERE bundle_id = ?", (bundle.bundle_id,))
                action = "update"
            else:
                conn.execute(
                    """INSERT INTO bundles (bundle_id, title, description, bundle_price)
                    VALUES (?, ?, ?, ?)""",
                    (bundle.bundle_id, bundle.title, bundle.description, bundle.bundle_price),
                )
                action = "insert"

            for idx, item in enumerate(bundle.items):
                conn.execute(
                    "INSERT INTO bundle_items (bundle_id, category, name, sort_order) VALUES (?, ?, ?, ?)",
                    (bundle.bundle_id, item.category, item.name, idx),
                )

            self._log_change(conn, "bundles", bundle.bundle_id, action)

    def delete_bundle(self, bundle_id: str) -> bool:
        with self._connection() as conn:
            cursor = conn.execute("DELETE FROM bundles WHERE bundle_id = ?", (bundle_id,))
            if cursor.rowcount > 0:
                self._log_change(conn, "bundles", bundle_id, "delete")
                return True
        return False

    # ── Change History ────────────────────────────────────────────────────

    def _log_change(self, conn: sqlite3.Connection, table: str, record_id: str, action: str) -> None:
        conn.execute(
            "INSERT INTO change_history (table_name, record_id, action) VALUES (?, ?, ?)",
            (table, record_id, action),
        )

    def get_change_history(self, limit: int = 100, table: Optional[str] = None) -> List[Dict[str, Any]]:
        query = "SELECT * FROM change_history"
        params: tuple = ()
        if table:
            query += " WHERE table_name = ?"
            params = (table,)
        query += " ORDER BY changed_at DESC LIMIT ?"
        params = params + (limit,)
        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    # ── Import / Export ───────────────────────────────────────────────────

    def export_to_json(self, output_dir: Path) -> None:
        """Export products and bundles to the JSON format expected by the Astro build."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        products = self.get_products(include_archived=True)
        product_data = {
            "version": "1",
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "rev": int(time.time()),
            "products": [p.to_dict() for p in products],
        }
        self._write_json(output_dir / "product_data.json", product_data)

        bundles = self.get_bundles()
        bundles_data = [b.to_dict() for b in bundles]
        self._write_json(output_dir / "storefront-bundles.json", bundles_data)

    def import_from_json(self, json_dir: Path) -> int:
        """Import products from a product_data.json file. Returns count of imported products."""
        json_dir = Path(json_dir)
        products_file = json_dir / "product_data.json"

        if not products_file.exists():
            raise FileNotFoundError(f"No se encontró {products_file}")

        data = json.loads(products_file.read_text(encoding="utf-8"))
        raw_products = data.get("products", []) if isinstance(data, dict) else data

        count = 0
        for item in raw_products:
            if not isinstance(item, dict):
                continue
            sku = item.get("sku") or item.get("name", "")
            if not sku:
                continue
            product = Product(
                sku=str(sku),
                name=str(item.get("name", "")),
                category=str(item.get("category", "")),
                description=str(item.get("description", "")),
                price=int(item.get("price", 0) or 0),
                discount=int(item.get("discount", 0) or 0),
                stock=item.get("stock", True) not in (False, 0, "0"),
                brand=str(item.get("brand", "")),
                image_path=str(item.get("image_path", "")),
                image_avif_path=str(item.get("image_avif_path", "")),
                thumbnail_path=str(item.get("thumbnail_path", "")),
                sort_order=int(item.get("order", 0) or 0),
                is_archived=item.get("is_archived", False) in (True, 1, "1"),
            )
            self.upsert_product(product)
            count += 1

        # Import bundles if present
        bundles_file = json_dir / "storefront-bundles.json"
        if bundles_file.exists():
            bundles_data = json.loads(bundles_file.read_text(encoding="utf-8"))
            raw_bundles = bundles_data if isinstance(bundles_data, list) else []
            for item in raw_bundles:
                if not isinstance(item, dict):
                    continue
                raw_items = item.get("items", [])
                items = [
                    BundleItem(
                        category=str(i.get("category", "")),
                        name=str(i.get("name", "")),
                    )
                    for i in raw_items
                    if isinstance(i, dict)
                ]
                bundle = Bundle(
                    bundle_id=str(item.get("id", "")),
                    title=str(item.get("title", "")),
                    description=str(item.get("description", "")),
                    items=items,
                    bundle_price=int(item.get("bundlePrice", 0) or 0),
                )
                self.upsert_bundle(bundle)

        return count

    @staticmethod
    def _write_json(filepath: Path, data: Any) -> None:
        temp = filepath.with_suffix(filepath.suffix + ".tmp")
        temp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temp.replace(filepath)
