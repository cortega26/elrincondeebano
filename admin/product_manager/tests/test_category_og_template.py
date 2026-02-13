from test_support import bootstrap_tests

bootstrap_tests()

from tools.category_og.template import build_label, render_svg


def test_build_label_keeps_full_composed_name() -> None:
    label = build_label("Energéticas e Isotónicas", "energeticaseisotonicas")
    assert label == "ENERGÉTICAS E ISOTÓNICAS"


def test_render_svg_wraps_long_labels_without_truncation() -> None:
    svg = render_svg(
        slug="energeticaseisotonicas",
        title="Energéticas e Isotónicas",
        icon_inner_svg="<path d='M12 2v20'/>",
        icon_name="zap",
    )
    assert 'dominant-baseline="middle"' in svg
    assert "ENERGÉTICAS E" in svg
    assert "ISOTÓNICAS" in svg


def test_render_svg_uses_semantic_palette_override_for_cervezas() -> None:
    svg = render_svg(
        slug="cervezas",
        title="Cervezas",
        icon_inner_svg="<path d='M12 2v20'/>",
        icon_name="beer",
    )
    assert 'stop-color="#E0A122"' in svg
    assert 'stop-color="#7A4A07"' in svg
