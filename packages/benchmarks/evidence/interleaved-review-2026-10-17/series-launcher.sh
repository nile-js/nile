#!/usr/bin/env bash
set -eu
cd /home/kizz/CODE/new-nile/packages
active_pid=
restore_development() {
  python3 /tmp/nile-benchmark-restore.py
}
interrupt_series() {
  if [ -n "$active_pid" ]; then
    kill -TERM "$active_pid" 2>/dev/null || true
    wait "$active_pid" || true
  fi
  exit 130
}
trap interrupt_series INT TERM
python3 - <<'PY'
from pathlib import Path
import json,shutil
p=Path('benchmarks/results/process-audit-2026-10-17/paused-development.json')
d=json.loads(p.read_text())
if not d.get('restored'):raise SystemExit('Previous paused development work has not been restored')
destination=p.with_name('paused-development-before-interleaved.json')
if destination.exists():raise SystemExit('Interleaved series already launched; inspect its existing state')
shutil.copy2(p,destination)
PY
trap restore_development EXIT
python3 /tmp/nile-benchmark-pause.py
run_stage() {
  local task_stage="$1"
  shift
  echo "STAGE_START $task_stage"
  NODE_ENV=production node benchmarks/suite/run-interleaved-count.mjs "$@" > "benchmarks/results/interleaved-series-2026-10-17/$task_stage.log" 2>&1 &
  active_pid=$!
  wait "$active_pid"
  active_pid=
  echo "STAGE_COMPLETE $task_stage"
}
run_stage node-corrective --selection benchmarks/evidence/interleaved-review-2026-10-17/node-corrective-selection.json --nile-revision 9f5a173
run_stage bun-main --runtime bun --framework nile,elysia,effect --nile-revision 9f5a173
run_stage bun-components --runtime bun --framework nile,hono,bun --nile-revision 9f5a173
run_stage bun-durability --runtime bun --framework nile,hono,bun --requests 18000 --sqlite-synchronous full --nile-revision 9f5a173
