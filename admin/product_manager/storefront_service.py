"""Services for storefront merchandising configuration."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


class StorefrontBundleError(Exception):
    """Base error for storefront bundle operations."""


class StorefrontBundleValidationError(StorefrontBundleError):
    """Raised when bundle data is invalid."""


@dataclass(frozen=True)
class StorefrontProductReference:
    """A product reference used by storefront bundles."""

    category: str
    name: str

    @classmethod
    def from_dict(cls, payload: object) -> "StorefrontProductReference":
        if not isinstance(payload, dict):
            raise StorefrontBundleValidationError(
                "Cada producto del combo debe ser un objeto."
            )
        category = str(payload.get("category") or "").strip()
        name = str(payload.get("name") or "").strip()
        if not category or not name:
            raise StorefrontBundleValidationError(
                "Cada producto del combo debe incluir categoría y nombre."
            )
        return cls(category=category, name=name)

    def to_dict(self) -> dict[str, str]:
        return {
            "category": self.category,
            "name": self.name,
        }


@dataclass(frozen=True)
class StorefrontBundle:
    """A curated bundle shown in the storefront homepage."""

    id: str
    title: str
    description: str
    items: List[StorefrontProductReference]
    bundle_price: int = 0  # 0 means no fixed price (sum of items is shown)

    @classmethod
    def from_dict(cls, payload: object) -> "StorefrontBundle":
        if not isinstance(payload, dict):
            raise StorefrontBundleValidationError("Cada combo debe ser un objeto.")
        bundle_id = str(payload.get("id") or "").strip()
        title = str(payload.get("title") or "").strip()
        description = str(payload.get("description") or "").strip()
        raw_items = payload.get("items")
        if not bundle_id:
            raise StorefrontBundleValidationError("Cada combo debe tener un id.")
        if not title:
            raise StorefrontBundleValidationError(
                f"El combo '{bundle_id}' debe tener un título."
            )
        if not description:
            raise StorefrontBundleValidationError(
                f"El combo '{bundle_id}' debe tener una descripción."
            )
        if not isinstance(raw_items, list) or not raw_items:
            raise StorefrontBundleValidationError(
                f"El combo '{bundle_id}' debe incluir al menos un producto."
            )
        items = [StorefrontProductReference.from_dict(item) for item in raw_items]
        raw_price = payload.get("bundlePrice")
        try:
            bundle_price = int(raw_price) if raw_price is not None else 0
        except (TypeError, ValueError):
            bundle_price = 0
        if bundle_price < 0:
            raise StorefrontBundleValidationError(
                f"El precio del combo '{bundle_id}' no puede ser negativo."
            )
        return cls(
            id=bundle_id,
            title=title,
            description=description,
            items=items,
            bundle_price=bundle_price,
        )

    def to_dict(self) -> dict[str, object]:
        data: dict[str, object] = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "items": [item.to_dict() for item in self.items],
        }
        if self.bundle_price and self.bundle_price > 0:
            data["bundlePrice"] = self.bundle_price
        return data


class FeaturedStaplesError(Exception):
    """Base error for featured staples operations."""


class FeaturedStaplesValidationError(FeaturedStaplesError):
    """Raised when featured staples data is invalid."""


class FeaturedStaplesService:
    """Load and save the featuredStaples list inside storefront-experience.json."""

    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)

    def load_staples(self) -> List[StorefrontProductReference]:
        """Return the current list of featured staples from the JSON config."""
        if not self.file_path.exists():
            return []
        try:
            raw = json.loads(self.file_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise FeaturedStaplesError(
                f"No se pudo leer el archivo de configuración: {exc}"
            ) from exc
        if not isinstance(raw, dict):
            raise FeaturedStaplesValidationError(
                "El archivo de configuración debe ser un objeto JSON."
            )
        home = raw.get("home", {})
        if not isinstance(home, dict):
            raise FeaturedStaplesValidationError(
                "La sección 'home' del archivo de configuración debe ser un objeto."
            )
        raw_staples = home.get("featuredStaples", [])
        if not isinstance(raw_staples, list):
            raise FeaturedStaplesValidationError(
                "El campo 'home.featuredStaples' debe ser una lista."
            )
        return [StorefrontProductReference.from_dict(item) for item in raw_staples]

    def save_staples(self, staples: Iterable[StorefrontProductReference]) -> None:
        """Persist the featuredStaples list in place, leaving the rest of the file intact."""
        if not self.file_path.exists():
            raise FeaturedStaplesError(
                "El archivo de configuración no existe. No se puede guardar."
            )
        try:
            raw = json.loads(self.file_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise FeaturedStaplesError(
                f"No se pudo leer el archivo de configuración: {exc}"
            ) from exc
        if not isinstance(raw, dict):
            raise FeaturedStaplesValidationError(
                "El archivo de configuración debe ser un objeto JSON."
            )
        if not isinstance(raw.get("home"), dict):
            raw["home"] = {}
        raw["home"]["featuredStaples"] = [s.to_dict() for s in staples]
        temp_path = self.file_path.with_suffix(f"{self.file_path.suffix}.tmp")
        temp_path.write_text(
            json.dumps(raw, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(self.file_path)


def slugify_bundle_id(value: str) -> str:
    """Create a stable bundle id from a title-like value."""

    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower()
    collapsed = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return collapsed or "combo"


class StorefrontBundleService:
    """Load and save storefront bundles from the dedicated JSON file."""

    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)

    def load_bundles(self) -> List[StorefrontBundle]:
        if not self.file_path.exists():
            return []
        try:
            raw = json.loads(self.file_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise StorefrontBundleError(
                f"No se pudo leer el archivo de combos: {exc}"
            ) from exc
        if not isinstance(raw, list):
            raise StorefrontBundleValidationError(
                "El archivo de combos debe contener una lista."
            )
        bundles = [StorefrontBundle.from_dict(item) for item in raw]
        self._validate_unique_ids(bundles)
        return bundles

    def save_bundles(self, bundles: Iterable[StorefrontBundle]) -> None:
        normalized = [self._coerce_bundle(bundle) for bundle in bundles]
        self._validate_unique_ids(normalized)
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        payload = [bundle.to_dict() for bundle in normalized]
        temp_path = self.file_path.with_suffix(f"{self.file_path.suffix}.tmp")
        temp_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(self.file_path)

    @staticmethod
    def _coerce_bundle(bundle: StorefrontBundle | object) -> StorefrontBundle:
        if isinstance(bundle, StorefrontBundle):
            return bundle
        return StorefrontBundle.from_dict(bundle)

    @staticmethod
    def _validate_unique_ids(bundles: Iterable[StorefrontBundle]) -> None:
        seen: set[str] = set()
        for bundle in bundles:
            bundle_id = bundle.id.strip()
            if not bundle_id:
                raise StorefrontBundleValidationError(
                    "Todos los combos deben tener un id."
                )
            if bundle_id in seen:
                raise StorefrontBundleValidationError(
                    f"El id '{bundle_id}' está repetido. Debe ser único."
                )
            seen.add(bundle_id)
