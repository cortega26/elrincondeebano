import logging
from unittest.mock import Mock
from uuid import uuid4

from admin.product_manager.sync import SyncEngine, _validate_sync_url
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


def _build_engine_with_base(tmp_path, api_base):
    return SyncEngine(
        api_base=api_base,
        api_token="",
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


# ── Transport security validation ──────────────────────────────────────────

def test_validate_sync_url_rejects_missing_scheme():
    require(not _validate_sync_url("localhost:8000"), "missing scheme")


def test_validate_sync_url_rejects_missing_host():
    require(not _validate_sync_url("http://"), "missing host")


def test_validate_sync_url_rejects_userinfo():
    require(
        not _validate_sync_url("http://user:pass@evil.com"),
        "userinfo in URL",
    )
    require(
        not _validate_sync_url("https://user@evil.com"),
        "user only in URL",
    )


def test_validate_sync_url_rejects_malformed_port():
    require(
        not _validate_sync_url("http://localhost:abc"),
        "non-numeric port",
    )


def test_validate_sync_url_rejects_empty_port():
    require(
        not _validate_sync_url("http://localhost:"),
        "empty port (trailing colon)",
    )


def test_validate_sync_url_accepts_https_remote():
    require(
        _validate_sync_url("https://api.example.com/path"),
        "https remote",
    )


def test_validate_sync_url_rejects_http_remote():
    require(
        not _validate_sync_url("http://api.example.com"),
        "http remote hostname",
    )


def test_validate_sync_url_rejects_http_private_lan():
    require(
        not _validate_sync_url("http://192.168.1.1"),
        "http private lan ip",
    )
    require(
        not _validate_sync_url("http://10.0.0.5"),
        "http private lan ip (10.x)",
    )


def test_validate_sync_url_accepts_http_localhost():
    require(
        _validate_sync_url("http://localhost:8000/api"),
        "http localhost",
    )


def test_validate_sync_url_accepts_http_ipv4_loopback():
    require(_validate_sync_url("http://127.0.0.1:8000"), "127.0.0.1")
    require(_validate_sync_url("http://127.0.0.2"), "127.0.0.2 (loopback range)")
    require(_validate_sync_url("http://127.255.255.255"), "127.255.255.255 (loopback range)")


def test_validate_sync_url_accepts_http_ipv6_loopback():
    require(_validate_sync_url("http://[::1]:8000"), "::1 bracketed")


def test_validate_sync_url_rejects_deceptive_localhost():
    require(
        not _validate_sync_url("http://localhost.example.com"),
        "localhost subdomain",
    )
    require(
        not _validate_sync_url("http://evil-localhost.com"),
        "contains localhost in name",
    )


def test_validate_sync_url_rejects_unsupported_scheme():
    require(not _validate_sync_url("ftp://localhost"), "ftp scheme")


# ── Engine-level transport enforcement ─────────────────────────────────────

def test_https_remote_enables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "https://api.example.com")
    require(engine.enabled, "https remote should enable sync")
    require(
        engine.api_base == "https://api.example.com",
        "normalized base preserved",
    )


def test_http_remote_disables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://api.example.com")
    require(not engine.enabled, "http remote should disable sync")
    require(engine.api_base == "", "api_base cleared for http remote")


def test_http_private_lan_disables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://192.168.1.1")
    require(not engine.enabled, "http lan should disable sync")
    require(engine.api_base == "", "api_base cleared for http lan")


def test_http_localhost_enables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://localhost:8000")
    require(engine.enabled, "http localhost should enable sync")
    require(
        engine.api_base == "http://localhost:8000",
        "normalized base for localhost",
    )


def test_http_ipv4_loopback_enables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://127.0.0.1:8000")
    require(engine.enabled, "http 127.0.0.1 should enable sync")


def test_http_ipv6_loopback_enables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://[::1]:8000")
    require(engine.enabled, "http [::1] should enable sync")


def test_http_deceptive_localhost_disables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://localhost.example.com")
    require(not engine.enabled, "deceptive localhost should disable sync")


def test_url_with_userinfo_disables_sync(tmp_path):
    engine = _build_engine_with_base(tmp_path, "http://user:pass@evil.com")
    require(not engine.enabled, "userinfo should disable sync")


def test_log_contains_no_credential_values(caplog, tmp_path):
    caplog.set_level(logging.WARNING)
    engine = _build_engine_with_base(
        tmp_path, "http://user:MySecretToken123@evil.com"
    )
    require(not engine.enabled, "engine disabled for userinfo url")
    require("MySecretToken123" not in caplog.text, "token in log")
    # Log should still mention the host (without credentials)
    require("URL insegura" in caplog.text, "warning includes 'URL insegura'")
    require("evil.com" in caplog.text, "warning includes hostname")
