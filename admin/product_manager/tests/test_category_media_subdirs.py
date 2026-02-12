from test_support import bootstrap_tests, require


bootstrap_tests()

from admin.product_manager.ui.utils import (
    default_category_subdir,
    derive_category_media_subdirs,
    extract_media_subdir,
)


def test_extract_media_subdir_reads_assets_images_paths() -> None:
    require(
        extract_media_subdir("assets/images/bebidas/producto.webp") == "bebidas",
        "Expected media subdir extraction from assets/images path",
    )
    require(
        extract_media_subdir("assets\\images\\vinos\\botella.avif") == "vinos",
        "Expected media subdir extraction to normalize backslashes",
    )
    require(
        extract_media_subdir("https://example.com/assets/images/bebidas/p.webp") is None,
        "Expected non-local media path to be rejected",
    )


def test_derive_category_media_subdirs_prefers_observed_directories() -> None:
    products = [
        {"category": "Aguas", "image_path": "assets/images/bebidas/a.webp"},
        {"category": "Aguas", "image_path": "assets/images/bebidas/b.webp"},
        {"category": "Aguas", "image_path": "assets/images/aguas/c.webp"},
        {"category": "SnacksDulces", "image_path": "assets/images/snacks_dulces/s.webp"},
    ]
    primary, aliases = derive_category_media_subdirs(
        products,
        ["Aguas", "Bebidas", "SnacksDulces"],
    )

    require(
        primary.get("Aguas") == "bebidas",
        "Expected Aguas to prefer most frequent observed directory",
    )
    require(
        "aguas" in aliases.get("Aguas", set()),
        "Expected Aguas aliases to include observed legacy directory",
    )
    require(
        primary.get("SnacksDulces") == "snacks_dulces",
        "Expected observed directory to be preserved for SnacksDulces",
    )


def test_derive_category_media_subdirs_uses_deterministic_fallback() -> None:
    primary, aliases = derive_category_media_subdirs([], ["NuevaCategoria"])
    fallback = default_category_subdir("NuevaCategoria")
    require(
        primary.get("NuevaCategoria") == fallback,
        "Expected fallback directory when no products are present",
    )
    require(
        fallback in aliases.get("NuevaCategoria", set()),
        "Expected fallback directory to be present in aliases",
    )
