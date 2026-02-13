import json
from pathlib import Path

from test_support import bootstrap_tests

bootstrap_tests()

from tools.category_og import pipeline
from tools.category_og.template import TEMPLATE_VERSION


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _setup_repo(tmp_path: Path) -> Path:
    _write(
        tmp_path / "config" / "category_og_icon_map.json",
        json.dumps(
            {
                "version": "v1",
                "default_icon": "shapes",
                "slug_map": {
                    "bebidas": "shapes",
                    "vinos": "shapes",
                },
                "keyword_map": {},
            },
            ensure_ascii=False,
            indent=2,
        ),
    )

    _write(
        tmp_path / "assets" / "images" / "og" / "icons" / "shapes.svg",
        (
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" "
            "fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" "
            "stroke-linecap=\"round\" stroke-linejoin=\"round\">"
            "<circle cx=\"12\" cy=\"12\" r=\"8\"/>"
            "</svg>"
        ),
    )

    registry_payload = {
        "schema_version": "1.0",
        "source": "categories.json",
        "version": "20260213-000000",
        "last_updated": "2026-02-13T00:00:00.000000Z",
        "nav_groups": [
            {
                "id": "g",
                "display_name": {"default": "General"},
                "active": True,
                "sort_order": 10,
            }
        ],
        "categories": [
            {
                "id": "bebidas",
                "key": "Bebidas",
                "slug": "bebidas",
                "display_name": {"default": "Bebidas"},
                "nav_group": "g",
                "active": True,
                "sort_order": 10,
                "subcategories": [],
            },
            {
                "id": "vinos",
                "key": "Vinos",
                "slug": "vinos",
                "display_name": {"default": "Vinos"},
                "nav_group": "g",
                "active": True,
                "sort_order": 20,
                "subcategories": [],
            },
        ],
    }
    _write(
        tmp_path / "data" / "category_registry.json",
        json.dumps(registry_payload, ensure_ascii=False, indent=2),
    )

    _write(
        tmp_path / "tools" / "category_og" / "render_jpg.mjs",
        "// test stub\n",
    )

    return tmp_path


def _patch_renderer(monkeypatch) -> None:
    def fake_render(_repo_root: Path, svg_file: Path, jpg_file: Path) -> bool:
        payload = b"FAKEJPG:" + svg_file.read_bytes()
        previous = jpg_file.read_bytes() if jpg_file.exists() else None
        if previous == payload:
            return False
        jpg_file.parent.mkdir(parents=True, exist_ok=True)
        jpg_file.write_bytes(payload)
        return True

    monkeypatch.setattr(pipeline, "_render_jpg_if_changed", fake_render)


def test_ensure_category_assets_is_idempotent(tmp_path: Path, monkeypatch) -> None:
    repo_root = _setup_repo(tmp_path)
    _patch_renderer(monkeypatch)

    first = pipeline.ensure_category_assets("bebidas", title="Bebidas", repo_root=repo_root)
    second = pipeline.ensure_category_assets("bebidas", title="Bebidas", repo_root=repo_root)

    assert first["svg_changed"] is True
    assert first["jpg_changed"] is True
    assert second["svg_changed"] is False
    assert second["jpg_changed"] is False


def test_sync_creates_missing_and_deletes_orphans(tmp_path: Path, monkeypatch) -> None:
    repo_root = _setup_repo(tmp_path)
    _patch_renderer(monkeypatch)

    category_dir = repo_root / "assets" / "images" / "og" / "categories"
    category_dir.mkdir(parents=True, exist_ok=True)
    (category_dir / "orphan.svg").write_text("<svg></svg>", encoding="utf-8")
    (category_dir / "orphan.jpg").write_bytes(b"orphan")
    (category_dir / "bebidas.jpg").write_bytes(b"legacy")

    first = pipeline.sync_category_assets(repo_root=repo_root)
    assert first["changed"] is True
    removed_paths = "\n".join(first["removed"])
    assert "orphan.svg" in removed_paths
    assert "orphan.jpg" in removed_paths

    assert (category_dir / "bebidas.svg").exists()
    assert (category_dir / f"bebidas.og_{TEMPLATE_VERSION}.jpg").exists()
    assert not (category_dir / "bebidas.jpg").exists()
    assert (category_dir / "vinos.svg").exists()
    assert (category_dir / f"vinos.og_{TEMPLATE_VERSION}.jpg").exists()
    assert (category_dir / ".og_manifest.json").exists()

    second = pipeline.sync_category_assets(repo_root=repo_root)
    assert second["changed"] is False
