#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<18)) throw Error("Use Node >=22.18.0 (nvm use)")'
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ required"'
if ! command -v elan >/dev/null 2>&1; then
  echo 'Elan is required for the pinned Lean proof; install Elan and rerun setup.' >&2
  exit 1
fi
lean_toolchain=$(cat lean-toolchain)
if [ "$lean_toolchain" != 'leanprover/lean4:v4.29.1' ]; then
  echo 'Unsupported Lean toolchain pin.' >&2
  exit 1
fi
if ! elan run "$lean_toolchain" lean --version >/dev/null 2>&1; then
  elan toolchain install "$lean_toolchain"
fi
lean_version=$(elan run "$lean_toolchain" lean --version)
case "$lean_version" in
  *'version 4.29.1,'*'commit f72c35b3f637c8c6571d353742168ab66cc22c00,'*) ;;
  *) echo "Wrong Lean release: $lean_version" >&2; exit 1 ;;
esac
printf 'Pinned Lean: %s\n' "$lean_version"
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check --no-cache-dir -r requirements.txt
npm ci --cache .npm-cache --ignore-scripts --no-audit --no-fund
npm ci --prefix release/sdk-toolchain --cache .npm-cache --ignore-scripts --no-audit --no-fund
.venv/bin/python release/prepare-workspace.py
npm ci --prefix .release-work/ui --cache .npm-cache --ignore-scripts --no-audit --no-fund
