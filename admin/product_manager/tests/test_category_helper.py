from test_support import bootstrap_tests, require


bootstrap_tests()

from admin.product_manager.ui.utils import CategoryHelper


def test_category_helper_resolves_label_and_key_aliases() -> None:
    helper = CategoryHelper(
        [
            ("Carnes y Embutidos", "Carnesyembutidos"),
            ("Bebidas", "Bebidas"),
        ]
    )

    require(
        helper.get_key_from_display("Carnes y Embutidos (Carnesyembutidos)")
        == "Carnesyembutidos",
        "Expected full display label to resolve key",
    )
    require(
        helper.get_key_from_display("Carnes y Embutidos") == "Carnesyembutidos",
        "Expected plain label to resolve key",
    )
    require(
        helper.get_key_from_display("carnes y embutídos") == "Carnesyembutidos",
        "Expected accent-insensitive label to resolve key",
    )
    require(
        helper.get_key_from_display("carnesyembutidos") == "Carnesyembutidos",
        "Expected compact key to resolve canonical key",
    )


def test_category_helper_display_uses_canonical_key() -> None:
    helper = CategoryHelper([("Carnes y Embutidos", "Carnesyembutidos")])
    display = helper.get_display_for_key("carnes y embutidos")
    require(
        display == "Carnes y Embutidos (Carnesyembutidos)",
        "Expected display label to be derived from canonical key mapping",
    )
