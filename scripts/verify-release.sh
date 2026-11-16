#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
.venv/bin/python scripts/check-baseline.py
node release/verify-release.mjs
