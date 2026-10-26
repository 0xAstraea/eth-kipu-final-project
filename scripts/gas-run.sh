#!/usr/bin/env bash
# Runs the gas profiler under a named variant and stores the report in gas-reports/<name>.json.
# Usage: ./scripts/gas-run.sh <variant-name>
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:-baseline}"
export GAS_REPORT_NAME="$name"
npx hardhat compile >/dev/null 2>&1 || { npx hardhat compile; exit 1; }
npx hardhat run scripts/gas-profile.ts > "/tmp/gas-$name.log" 2>&1
tail -n 6 "/tmp/gas-$name.log"
