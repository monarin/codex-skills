#!/usr/bin/env bash
set -u

timeout_seconds="${S3DF_VERIFY_TIMEOUT_SECONDS:-20}"
hosts=("$@")
if [[ "${#hosts[@]}" -eq 0 ]]; then
    hosts=(psbuildrc sdfiana)
fi

overall_status=0

printf 'Checking sdflogin gateway... '
if gateway_error="$(
    ssh \
        -o BatchMode=yes \
        -o NumberOfPasswordPrompts=0 \
        -o ConnectTimeout="$timeout_seconds" \
        -o ConnectionAttempts=1 \
        -o ControlMaster=no \
        -o ControlPath=none \
        sdflogin true \
        2>&1 >/dev/null
)"; then
    printf 'OK\n'
else
    status=$?
    printf 'FAILED (exit %s)\n' "$status"
    if [[ -n "$gateway_error" ]]; then
        printf '%s\n' "$gateway_error" >&2
    fi
    for host in "${hosts[@]}"; do
        printf 'Checking %s... BLOCKED (sdflogin authentication failed)\n' "$host"
    done
    exit 1
fi

for host in "${hosts[@]}"; do
    printf 'Checking %s... ' "$host"

    if error_output="$(
        ssh \
            -o BatchMode=yes \
            -o NumberOfPasswordPrompts=0 \
            -o ConnectTimeout="$timeout_seconds" \
            -o ConnectionAttempts=1 \
            -o ControlMaster=no \
            -o ControlPath=none \
            "$host" true \
            2>&1 >/dev/null
    )"; then
        printf 'OK\n'
    else
        status=$?
        printf 'FAILED (exit %s)\n' "$status"
        if [[ -n "$error_output" ]]; then
            printf '%s\n' "$error_output" >&2
        fi
        overall_status=1
    fi
done

exit "$overall_status"
