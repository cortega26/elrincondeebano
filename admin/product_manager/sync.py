"""Synchronization engine for product updates."""

from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib import error, parse, request

from .time_utils import parse_iso_datetime


def _utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 with millisecond precision."""
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


@dataclass
class SyncQueueEntry:
    """Queue entry representing a pending sync mutation."""
    # Data model stores multiple fields representing sync metadata.
    # pylint: disable=too-many-instance-attributes
    product_id: str
    base_rev: int
    fields: Dict[str, Any]
    snapshot: Dict[str, Any]
    timestamp: str
    changeset_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    status: str = "pending"
    attempts: int = 0
    enqueued_at: str = field(default_factory=_utc_now_iso)
    last_attempt: Optional[str] = None
    last_error: Optional[str] = None
    next_retry_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize entry to a dictionary."""
        return {
            "product_id": self.product_id,
            "base_rev": self.base_rev,
            "fields": self.fields,
            "snapshot": self.snapshot,
            "timestamp": self.timestamp,
            "changeset_id": self.changeset_id,
            "status": self.status,
            "attempts": self.attempts,
            "enqueued_at": self.enqueued_at,
            "last_attempt": self.last_attempt,
            "last_error": self.last_error,
            "next_retry_at": self.next_retry_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SyncQueueEntry":
        """Build a queue entry from a dictionary payload."""
        return cls(
            product_id=data["product_id"],
            base_rev=data["base_rev"],
            fields=data["fields"],
            snapshot=data.get("snapshot", {}),
            timestamp=data.get("timestamp", _utc_now_iso()),
            changeset_id=data.get("changeset_id", uuid.uuid4().hex),
            status=data.get("status", "pending"),
            attempts=data.get("attempts", 0),
            enqueued_at=data.get("enqueued_at", _utc_now_iso()),
            last_attempt=data.get("last_attempt"),
            last_error=data.get("last_error"),
            next_retry_at=data.get("next_retry_at"),
        )

    def schedule_retry(self, delay_seconds: float) -> None:
        """Schedule next retry using exponential backoff."""
        retry_dt = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        self.next_retry_at = retry_dt.isoformat(timespec="seconds").replace(
            "+00:00", "Z"
        )

    def clear_retry(self) -> None:
        """Clear any scheduled retry."""
        self.next_retry_at = None

    def next_retry_timestamp(self) -> Optional[float]:
        """Return the next retry timestamp as epoch seconds."""
        if not self.next_retry_at:
            return None
        retry_dt = parse_iso_datetime(self.next_retry_at)
        if not retry_dt:
            return None
        return retry_dt.timestamp()


_NETWORK_ERROR_MARKERS: tuple[str, ...] = (
    "connection refused",
    "winerror 10061",
    "no se puede establecer una conexión",
    "denegó expresamente dicha conexión",
    "failed to establish a new connection",
    "network is unreachable",
    "no route to host",
    "timed out",
    "timeout",
    "errno 111",
    "errno 113",
    "getaddrinfo failed",
    "name or service not known",
)


class SyncEngine:
    """Coordinate local changes with the remote sync API."""
    # Service class stores multiple runtime flags and state.
    # pylint: disable=too-many-instance-attributes
    def __init__(
        self,
        *,
        api_base: str,
        repository,
        service,
        queue_file: str,
        enabled: bool = True,
        poll_interval: int = 60,
        pull_interval: int = 300,
        timeout: int = 10,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        # Constructor accepts several optional tuning parameters.
        # pylint: disable=too-many-arguments
        self.repository = repository
        self.service = service
        self.queue_file = queue_file
        self.logger = logger or logging.getLogger(__name__)
        self.api_base = self._normalize_api_base(api_base)
        self.enabled = enabled and bool(self.api_base)
        self.poll_interval = poll_interval
        self.pull_interval = pull_interval
        self.timeout = timeout
        self._retry_initial_delay = max(30, poll_interval)
        self._retry_max_delay = 15 * 60
        self._max_backoff_exponent = 6
        self._lock = threading.RLock()
        self._queue: List[SyncQueueEntry] = []
        self._conflicts: List[Dict[str, Any]] = []
        self._last_pull_ts = 0.0
        self._load_queue()

    def _normalize_api_base(self, api_base: str) -> str:
        """Normalize and validate the API base URL."""
        if not api_base:
            return ""
        trimmed = api_base.strip()
        if not trimmed:
            return ""
        parsed = parse.urlparse(trimmed)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            self.logger.warning("Sync disabled: api_base must be http(s) with a host.")
            return ""
        return trimmed.rstrip("/")

    def _load_queue(self) -> None:
        """Load queued sync entries from disk."""
        if not os.path.exists(self.queue_file):
            return
        try:
            with open(self.queue_file, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            entries = [SyncQueueEntry.from_dict(item) for item in raw.get("queue", [])]
            conflicts = raw.get("conflicts", [])
            dirty = self._normalise_loaded_entries(entries)
            with self._lock:
                self._queue = entries
                self._conflicts = conflicts
                if dirty:
                    self._save_queue()
        except Exception as exc:  # pylint: disable=broad-exception-caught
            self.logger.error("No se pudo cargar la cola de sincronización: %s", exc)

    def _normalise_loaded_entries(self, entries: List[SyncQueueEntry]) -> bool:
        """Normalise queue entries loaded from disk for new retry semantics."""
        dirty = False
        now = time.time()
        for entry in entries:
            if entry.status == "error" and self._is_network_error_message(
                entry.last_error
            ):
                entry.status = "pending"
                delay = self._compute_retry_delay(max(entry.attempts, 1))
                entry.schedule_retry(delay)
                dirty = True
            elif entry.status == "pending":
                retry_ts = entry.next_retry_timestamp()
                if retry_ts and retry_ts <= now:
                    entry.clear_retry()
                    dirty = True
        return dirty

    def _save_queue(self) -> None:
        """Persist the sync queue to disk."""
        payload = {
            "queue": [entry.to_dict() for entry in self._queue],
            "conflicts": list(self._conflicts),
        }
        os.makedirs(os.path.dirname(self.queue_file), exist_ok=True)
        tmp_path = f"{self.queue_file}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
        os.replace(tmp_path, self.queue_file)

    def _compute_retry_delay(self, attempts: int) -> float:
        """Compute exponential backoff delay for retries."""
        exponent = max(0, min(attempts - 1, self._max_backoff_exponent))
        delay = self._retry_initial_delay * (2**exponent)
        return float(min(delay, self._retry_max_delay))

    def _is_network_error_message(self, message: Optional[str]) -> bool:
        """Return True when the message matches network error patterns."""
        if not message:
            return False
        msg = str(message).lower()
        return any(marker in msg for marker in _NETWORK_ERROR_MARKERS)

    def _is_network_error(self, exc: Exception) -> bool:
        """Return True when the exception represents a network failure."""
        if isinstance(
            exc,
            (
                ConnectionError,
                TimeoutError,
                socket.timeout,
                socket.gaierror,
                socket.herror,
            ),
        ):
            return True
        if isinstance(exc, error.URLError):
            reason = getattr(exc, "reason", None)
            if isinstance(reason, Exception):
                return self._is_network_error(reason)
            return self._is_network_error_message(reason)
        return self._is_network_error_message(str(exc))

    def _should_count_as_pending(self, entry: SyncQueueEntry, now: float) -> bool:
        """Return True when the entry should count as pending."""
        if entry.status == "pending":
            retry_ts = entry.next_retry_timestamp()
            if retry_ts and retry_ts > now:
                return False
            return True
        if entry.status == "error":
            return True
        return False

    def status_summary(self) -> Dict[str, int]:
        """Return counts for pending, waiting, and error entries."""
        with self._lock:
            now = time.time()
            pending = 0
            waiting = 0
            errors = 0
            for entry in self._queue:
                if entry.status == "pending":
                    retry_ts = entry.next_retry_timestamp()
                    if retry_ts and retry_ts > now:
                        waiting += 1
                    else:
                        pending += 1
                elif entry.status == "error":
                    errors += 1
            total = pending + waiting + errors
            return {
                "pending": pending,
                "waiting": waiting,
                "errors": errors,
                "total": total,
            }

    def enqueue_update(
        self,
        *,
        product_id: str,
        base_rev: int,
        fields: Dict[str, Any],
        snapshot: Dict[str, Any],
        timestamp: Optional[str] = None,
    ) -> None:
        """Queue a local update for background synchronization."""
        # Multiple required fields are needed to describe the update.
        # pylint: disable=too-many-arguments
        if not self.enabled:
            return
        entry = SyncQueueEntry(
            product_id=product_id,
            base_rev=base_rev,
            fields=fields,
            snapshot=snapshot,
            timestamp=timestamp or _utc_now_iso(),
        )
        with self._lock:
            self._queue.append(entry)
            self._save_queue()

    def get_conflicts(self) -> List[Dict[str, Any]]:
        """Return a copy of stored conflict entries."""
        with self._lock:
            return list(self._conflicts)

    def clear_conflicts(self) -> List[Dict[str, Any]]:
        """Return and clear conflicts from memory."""
        with self._lock:
            conflicts = list(self._conflicts)
            self._conflicts.clear()
            self._save_queue()
            return conflicts

    def pending_count(self) -> int:
        """Return the number of entries ready for sync."""
        with self._lock:
            now = time.time()
            return sum(
                1 for entry in self._queue if self._should_count_as_pending(entry, now)
            )

    def _build_url(self, path: str) -> str:
        """Build a full API URL from a path."""
        return f"{self.api_base}{path}"

    def _assert_http_url(self, url: str) -> str:
        """Validate that the URL is http(s) with a host."""
        parsed = parse.urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Sync URL inválida; solo se permiten esquemas http/https.")
        return url

    def _send_patch(self, entry: SyncQueueEntry) -> Optional[Dict[str, Any]]:
        """Send a patch request for a queued update."""
        payload = json.dumps(
            {
                "base_rev": entry.base_rev,
                "changeset_id": entry.changeset_id,
                "source": "offline",
                "fields": entry.fields,
            }
        ).encode("utf-8")
        product_path = parse.quote(entry.product_id, safe="")
        url = self._assert_http_url(self._build_url(f"/api/products/{product_path}"))
        req = request.Request(
            url,
            data=payload,
            method="PATCH",
            headers={"content-type": "application/json"},
        )
        try:
            # url validated by _assert_http_url (http/https only).
            with request.urlopen(req, timeout=self.timeout) as resp:  # nosec B310
                response_body = resp.read().decode("utf-8")
                return json.loads(response_body)
        except error.HTTPError as exc:
            if exc.code in (409, 412):
                response_body = exc.read().decode("utf-8")
                return json.loads(response_body)
            raise

    def _pull_changes(self) -> None:
        """Pull incremental changes from the remote API."""
        catalog_meta = self.repository.get_catalog_meta()
        since_rev = catalog_meta.get("rev", 0)
        url = self._assert_http_url(
            self._build_url(f"/api/products/changes?since_rev={since_rev}")
        )
        req = request.Request(url, method="GET")
        try:
            # url validated by _assert_http_url (http/https only).
            with request.urlopen(req, timeout=self.timeout) as resp:  # nosec B310
                response = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # pylint: disable=broad-exception-caught
            self.logger.debug("No se pudo obtener cambios incrementales: %s", exc)
            return
        changes = response.get("changes") or []
        to_rev = response.get("to_rev", since_rev)
        for change in changes:
            snapshot = change.get("product_snapshot")
            if not snapshot:
                continue
            metadata = {
                "last_updated": change.get("last_updated"),
                "version": change.get("version"),
            }
            try:
                self.service.apply_server_snapshot(
                    snapshot, change.get("rev", to_rev), metadata
                )
            except Exception as exc:  # pylint: disable=broad-except
                self.logger.error("Error aplicando snapshot remoto: %s", exc)

    def process_once(self) -> None:
        """Process the queue once, pushing pending updates."""
        # Complex workflow with multiple branches.
        # pylint: disable=too-many-branches
        if not self.enabled:
            return
        with self._lock:
            entries = list(self._queue)
        for entry in entries:
            if entry.status not in ("pending", "error"):
                continue
            retry_ts = (
                entry.next_retry_timestamp() if entry.status == "pending" else None
            )
            if retry_ts and retry_ts > time.time():
                continue
            try:
                response = self._send_patch(entry)
                entry.status = "synced"
                entry.last_error = None
                entry.last_attempt = _utc_now_iso()
                entry.clear_retry()
                if response:
                    metadata = {
                        "last_updated": response.get("last_updated"),
                        "version": response.get("version"),
                    }
                    product = response.get("product")
                    if product:
                        self.service.apply_server_snapshot(
                            product, response.get("rev", entry.base_rev), metadata
                        )
                    conflicts = response.get("conflicts") or []
                    if conflicts:
                        conflict_record = {
                            "product_id": entry.product_id,
                            "fields": conflicts,
                            "changeset_id": entry.changeset_id,
                            "timestamp": _utc_now_iso(),
                        }
                        with self._lock:
                            self._conflicts.append(conflict_record)
                with self._lock:
                    self._queue = [
                        item
                        for item in self._queue
                        if item.changeset_id != entry.changeset_id
                    ]
                    self._save_queue()
            except Exception as exc:  # pylint: disable=broad-except
                if self.logger:
                    self.logger.debug(
                        "Error enviando parche %s: %s", entry.changeset_id, exc
                    )
                entry.last_error = str(exc)
                entry.attempts += 1
                entry.last_attempt = _utc_now_iso()
                if self._is_network_error(exc):
                    entry.status = "pending"
                    delay = self._compute_retry_delay(entry.attempts)
                    entry.schedule_retry(delay)
                    if self.logger and entry.attempts in (1, 3, 5):
                        self.logger.warning(
                            "Sin conexión con %s; se reintentará cambioset %s en %ds",
                            self.api_base or "servidor remoto",
                            entry.changeset_id,
                            int(delay),
                        )
                else:
                    entry.status = "error"
                    entry.clear_retry()
                with self._lock:
                    self._save_queue()
        now = time.time()
        if now - self._last_pull_ts >= self.pull_interval:
            self._pull_changes()
            self._last_pull_ts = now

    def start_background(self, stop_event: threading.Event) -> None:
        """Start a background thread that processes the queue."""
        if not self.enabled:
            return

        def _runner():
            """Background loop for processing sync queue."""
            while not stop_event.is_set():
                try:
                    self.process_once()
                except Exception as exc:  # pylint: disable=broad-except
                    self.logger.error("Error en ciclo de sincronización: %s", exc)
                stop_event.wait(self.poll_interval)

        thread = threading.Thread(target=_runner, name="SyncEngineLoop", daemon=True)
        thread.start()
