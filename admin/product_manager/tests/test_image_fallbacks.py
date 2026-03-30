from pathlib import Path

from admin.product_manager import image_fallbacks


def test_guess_fallback_from_avif_prefers_existing_sibling(tmp_path):
    base_dir = tmp_path / "assets-images"
    target_dir = base_dir / "bebidas"
    target_dir.mkdir(parents=True)
    (target_dir / "cola.avif").write_bytes(b"avif")
    (target_dir / "cola.webp").write_bytes(b"webp")

    result = image_fallbacks.guess_fallback_from_avif(
        base_dir, "assets/images/bebidas/cola.avif"
    )

    assert result == "assets/images/bebidas/cola.webp"


def test_guess_fallback_from_avif_handles_case_insensitive_matches(tmp_path):
    base_dir = tmp_path / "assets-images"
    target_dir = base_dir / "bebidas"
    target_dir.mkdir(parents=True)
    (target_dir / "Cola.avif").write_bytes(b"avif")
    (target_dir / "COLA.PNG").write_bytes(b"png")

    result = image_fallbacks.guess_fallback_from_avif(
        base_dir, "assets/images/bebidas/Cola.avif"
    )

    assert result == "assets/images/bebidas/COLA.PNG"


def test_generate_fallback_from_avif_uses_node_when_pillow_lacks_support(
    monkeypatch, tmp_path
):
    base_dir = tmp_path / "assets-images"
    target_dir = base_dir / "bebidas"
    target_dir.mkdir(parents=True)
    (target_dir / "cola.avif").write_bytes(b"avif")

    calls = []

    def fake_generate_with_node(**kwargs):
        calls.append(kwargs)
        kwargs["fallback_path"].write_bytes(b"generated")
        return True

    monkeypatch.setattr(image_fallbacks, "_node_fallback_available", lambda: True)
    monkeypatch.setattr(image_fallbacks, "_generate_with_node", fake_generate_with_node)

    result = image_fallbacks.generate_fallback_from_avif(
        base_dir,
        "assets/images/bebidas/cola.avif",
        pil_available=True,
        pil_avif=False,
        pil_webp=False,
        image_module=None,
        resize_max=1000,
    )

    assert result == "assets/images/bebidas/cola.webp"
    assert len(calls) == 1
    assert Path(calls[0]["fallback_path"]).suffix == ".webp"
    assert calls[0]["resize_max"] == 1000
