#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<18)) throw Error("Use Node >=22.18.0 (nvm use)")'
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ required"'
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check --no-cache-dir -r requirements.txt
npm ci --cache .npm-cache --ignore-scripts --no-audit --no-fund
npm ci --prefix release/sdk-toolchain --cache .npm-cache --ignore-scripts --no-audit --no-fund
.venv/bin/python release/prepare-workspace.py
npm ci --prefix .release-work/ui --cache .npm-cache --ignore-scripts --no-audit --no-fund
