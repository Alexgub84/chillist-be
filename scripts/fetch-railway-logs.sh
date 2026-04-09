#!/usr/bin/env bash
set -euo pipefail

HOURS="${1:-24}"
FILTER="${2:-}"
LOGS_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
mkdir -p "$LOGS_DIR"

OUTFILE="$LOGS_DIR/railway-$(date +%Y-%m-%d-%H%M%S).log"

echo "Fetching Railway logs for the last ${HOURS}h..."
if [ -n "$FILTER" ]; then
  echo "  Filter: $FILTER"
  railway logs --since "${HOURS}h" --filter "$FILTER" > "$OUTFILE"
else
  railway logs --since "${HOURS}h" > "$OUTFILE"
fi

LINES=$(wc -l < "$OUTFILE" | tr -d ' ')
echo "Done — ${LINES} lines written to $OUTFILE"
