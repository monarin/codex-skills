#!/usr/bin/env bash
set -u

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
overall_status=0

if ! "${script_dir}/verify-s3df-hosts.sh"; then
  overall_status=1
fi

printf 'Checking perlmutter... '
if nersc_error="$(
  ssh \
    -o BatchMode=yes \
    -o NumberOfPasswordPrompts=0 \
    -o ConnectTimeout="${NERSC_VERIFY_TIMEOUT_SECONDS:-20}" \
    -o ConnectionAttempts=1 \
    -o ControlMaster=no \
    -o ControlPath=none \
    perlmutter true \
    2>&1 >/dev/null
)"; then
  printf 'OK\n'
else
  status=$?
  printf 'FAILED (exit %s)\n' "$status"
  if [[ -n "$nersc_error" ]]; then
    printf '%s\n' "$nersc_error" >&2
  fi
  overall_status=1
fi

exit "$overall_status"
