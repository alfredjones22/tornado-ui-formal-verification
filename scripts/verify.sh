#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p artifacts/continuation reports/continuation
node -e 'if ((v=>v[0]<22||(v[0]===22&&v[1]<18))(process.versions.node.split(".").map(Number))) throw Error("Use Node >=22.18.0"); for (const [p,v] of [["typescript","5.9.3"],["viem","2.55.19"]]) if(require(p+"/package.json").version!==v) throw Error("Wrong tool version: "+p)'
PY=.venv/bin/python
"$PY" -c 'import z3; assert z3.get_version_string() == "4.15.4"'
"$PY" scripts/check-baseline.py
node pilot/extract-validator.mjs
node pilot/make-mutants.mjs
node lean/generate-validator.mjs
"$PY" scripts/verify-lean.py
node lean/check-mutants.mjs
node pilot/generate-corpus.mjs
"$PY" pilot/verify-validator.py
"$PY" scripts/replay-smt.py
"$PY" model/lifecycle.py
node --test pilot/conformance.test.mjs > reports/conformance.tap
tail -9 reports/conformance.tap
sh scripts/verify-continuation.sh
node release/verify-release.mjs
"$PY" scripts/summarize.py
