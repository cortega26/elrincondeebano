#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"

node "${repo_root}/tools/guardrails/dependency-manifest-compat.mjs"

max_attempts="${NPM_CI_MAX_ATTEMPTS:-3}"
base_delay_seconds="${NPM_CI_RETRY_DELAY_SECONDS:-10}"

export npm_config_fetch_retries="${npm_config_fetch_retries:-5}"
export npm_config_fetch_retry_factor="${npm_config_fetch_retry_factor:-2}"
export npm_config_fetch_retry_mintimeout="${npm_config_fetch_retry_mintimeout:-10000}"
export npm_config_fetch_retry_maxtimeout="${npm_config_fetch_retry_maxtimeout:-120000}"

attempt=1

while true; do
  echo "::group::npm ci attempt ${attempt}/${max_attempts}"

  set +e
  npm ci "$@"
  status=$?
  set -e

  echo "::endgroup::"

  if [ "$status" -eq 0 ]; then
    exit 0
  fi

  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "npm ci failed after ${attempt} attempts." >&2
    exit "$status"
  fi

  delay_seconds=$((base_delay_seconds * attempt))
  echo "npm ci failed with exit code ${status}. Retrying in ${delay_seconds}s..." >&2
  sleep "${delay_seconds}"
  attempt=$((attempt + 1))
done
