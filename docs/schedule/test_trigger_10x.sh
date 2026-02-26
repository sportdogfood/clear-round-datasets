#!/usr/bin/env bash
set -euo pipefail

CYCLES="${CYCLES:-10}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-300}"
LOG_DIR="${LOG_DIR:-docs/schedule/logs}"
mkdir -p "$LOG_DIR"

LOG_FILE="${LOG_FILE:-$LOG_DIR/trigger_accuracy_$(date -u +%Y%m%dT%H%M%SZ).log}"

{
  echo "# trigger accuracy log"
  echo "# utc_start=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "# cycles=$CYCLES interval_seconds=$INTERVAL_SECONDS"
  echo "cycle,utc_iso,epoch_s,delta_from_prev_s"
} >> "$LOG_FILE"

prev_epoch=""
for i in $(seq 1 "$CYCLES"); do
  epoch="$(date -u +%s)"
  iso="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  if [[ -z "$prev_epoch" ]]; then
    delta="NA"
  else
    delta="$((epoch - prev_epoch))"
  fi

  echo "$i,$iso,$epoch,$delta" >> "$LOG_FILE"
  prev_epoch="$epoch"

  if [[ "$i" -lt "$CYCLES" ]]; then
    sleep "$INTERVAL_SECONDS"
  fi
done

echo "Wrote log: $LOG_FILE"
