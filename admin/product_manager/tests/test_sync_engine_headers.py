from unittest.mock import Mock
from uuid import uuid4

from admin.product_manager.sync import SyncEngine
from test_support import require


def _build_engine(tmp_path, *, api_token=""):
    return SyncEngine(
        api_base="https://sync.example.com",
        api_token=api_token,
        repository=Mock(),
        service=Mock(),
        queue_file=str(tmp_path / "sync_queue.json"),
        enabled=True,
    )


def test_build_request_headers_includes_bearer_and_correlation_id(tmp_path):
    token_value = f"test-{uuid4().hex}"
    engine = _build_engine(tmp_path, api_token=f"  {token_value}  ")

    headers = engine._build_request_headers(changeset_id="change-001")

    require(
        headers.get("Authorization") == f"Bearer {token_value}",
        "Expected Authorization header with normalized bearer token",
    )
    require(
        headers.get("X-Correlation-Id") == "change-001",
        "Expected X-Correlation-Id header",
    )


def test_build_request_headers_omits_authorization_when_token_is_empty(tmp_path):
    empty_token = "".join([])
    engine = _build_engine(tmp_path, api_token=empty_token)

    headers = engine._build_request_headers(changeset_id="change-002")

    require("Authorization" not in headers, "Authorization header must be omitted")
    require(
        headers.get("X-Correlation-Id") == "change-002",
        "Expected X-Correlation-Id header",
    )


def test_build_request_headers_returns_empty_dict_without_token_or_changeset(tmp_path):
    empty_token = "".join([])
    engine = _build_engine(tmp_path, api_token=empty_token)

    headers = engine._build_request_headers()

    require(headers == {}, "Expected empty header set without token/correlation id")
