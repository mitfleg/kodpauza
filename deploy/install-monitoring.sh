#!/usr/bin/env bash

set -euo pipefail

monitor_script="${KODPAUZA_MONITOR_SCRIPT:-/home/deploy/monitor-production.sh}"
notify_script="${KODPAUZA_NOTIFY_SCRIPT:-/home/deploy/notify-telegram.sh}"

chmod 700 "$monitor_script" "$notify_script"

current="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "$current" | grep -v '# kodpauza-production-monitor' || true)"
{
  printf '%s\n' "$filtered"
  printf '%s\n' '*/5 * * * * /home/deploy/monitor-production.sh >>/home/deploy/monitor-production.log 2>&1 # kodpauza-production-monitor'
} | awk 'NF || !seen++' | crontab -

/home/deploy/monitor-production.sh
echo 'Production monitoring installed (every 5 minutes).'

