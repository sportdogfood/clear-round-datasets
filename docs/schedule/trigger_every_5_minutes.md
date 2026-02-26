# Trigger every 5 minutes between a start and finish time

If you are using a cron-style trigger, the basic pattern is:

```cron
*/5 X-Y * * *
```

- `*/5` = every 5 minutes
- `X-Y` = hour window (24-hour clock)

## Examples

Run every 5 minutes from **09:00 to 17:55**:

```cron
*/5 9-17 * * *
```

Run every 5 minutes from **13:00 to 15:55**:

```cron
*/5 13-15 * * *
```

## If you need exact start/end minutes

Cron hour ranges are coarse. If your time window starts/ends at non-:00 boundaries, split into multiple lines.

Example: from **09:10** to **17:40** every 5 minutes:

```cron
10-59/5 9 * * *
*/5 10-16 * * *
0-40/5 17 * * *
```

## GitHub Actions example

```yaml
on:
  schedule:
    - cron: "*/5 9-17 * * *"
```

> Note: GitHub Actions cron uses UTC unless your workflow logic adjusts for timezone.

## How to test it now for 10 cycles

If you want to verify behavior immediately, use one of these options.

### Option A: Real 5-minute cadence (takes ~50 minutes)

Run this in a shell. It executes every 5 minutes and stops after 10 runs:

```bash
./docs/schedule/test_trigger_10x.sh
```

By default this writes a CSV-style log file to:

```text
docs/schedule/logs/trigger_accuracy_<UTC timestamp>.log
```

Each row includes:

- cycle number
- UTC timestamp
- epoch seconds
- delta seconds from previous cycle (target: ~300)

### Option B: Accelerated validation (10 quick cycles)

For quick correctness checks, keep the same loop logic but reduce the sleep value.

```bash
INTERVAL_SECONDS=5 ./docs/schedule/test_trigger_10x.sh
```

This does **not** validate production timing, but it validates your task logic, stop condition, and logging.

### Validate “between X and Y” window in logs

After the run, inspect the latest log and confirm timestamps are within your intended `X`→`Y` window:

```bash
latest_log="$(ls -1t docs/schedule/logs/trigger_accuracy_*.log | head -n 1)"
echo "Using log: $latest_log"
cat "$latest_log"
```

Quick interval accuracy check (delta should be close to `300` seconds in real mode):

```bash
latest_log="$(ls -1t docs/schedule/logs/trigger_accuracy_*.log | head -n 1)"
awk -F, 'NR>4 && $4!="NA" {print "cycle=" $1 " delta_s=" $4}' "$latest_log"
```
