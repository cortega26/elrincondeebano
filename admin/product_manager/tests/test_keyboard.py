from admin.product_manager.keyboard import ENTER_SUBMIT_SEQUENCES, bind_submit_keys


class FakeWidget:
    def __init__(self) -> None:
        self.bound: list[tuple[str, object]] = []

    def bind(self, sequence: str, func: object) -> None:
        self.bound.append((sequence, func))


def test_bind_submit_keys_registers_main_and_keypad_enter() -> None:
    widget = FakeWidget()

    def handler(_event=None) -> None:
        return None

    bind_submit_keys(widget, handler)

    assert widget.bound == [(sequence, handler) for sequence in ENTER_SUBMIT_SEQUENCES]
