#!/bin/bash
# End-to-end suites. Each run starts the built app on a fresh in-memory database with the scripted test agent.
# Needs: `npm run build` first, and Playwright with Chromium (`npx playwright install chromium` once).
# Usage: tests/e2e/run.sh            (all suites)
#        tests/e2e/run.sh places.js  (one suite)
set -u
cd "$(dirname "$0")/../.."
ROOT=$(pwd); E2E="$ROOT/tests/e2e"; mkdir -p "$E2E/out"
SUITES=${1:-"accounts.js life.js garden.js archives.js places.js"}
fail=0
for s in $SUITES; do
  pkill -f "next start -p 3100" 2>/dev/null; sleep 0.5
  PGLITE_DIR=memory WHATSTAYED_MOCK=1 npx next start -p 3100 > "$E2E/out/server.log" 2>&1 &
  SERVER=$!
  for i in $(seq 1 60); do curl -s -o /dev/null localhost:3100/welcome && break; sleep 0.5; done
  (cd "$E2E/out" && node "$E2E/$s") > "$E2E/out/${s%.js}.txt" 2>&1
  echo "$s: $(grep -c '^PASS' "$E2E/out/${s%.js}.txt") passed, $(grep -c '^FAIL\|CRASH' "$E2E/out/${s%.js}.txt") failed"
  grep -q '^FAIL\|CRASH' "$E2E/out/${s%.js}.txt" && fail=1
  kill $SERVER 2>/dev/null
done
pkill -f "next start -p 3100" 2>/dev/null
exit $fail
