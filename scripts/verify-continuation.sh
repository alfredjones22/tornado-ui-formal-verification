#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p artifacts/continuation reports/continuation
node -e 'const fs=require("fs"); for(const [p,v] of [["vue","3.5.44"],["@vue/compiler-sfc","3.5.44"],["sdk-viem","2.54.1"],["@reduxjs/toolkit","2.12.0"],["micro-zk-proofs","0.3.1"],["@noble/curves","2.2.0"],["@noble/hashes","2.2.0"]]) if(JSON.parse(fs.readFileSync("node_modules/"+p+"/package.json")).version!==v) throw Error("Wrong dependency "+p)'
.venv/bin/python scripts/check-baseline.py
node continuation/source-facts.mjs
.venv/bin/python continuation/verify-boundaries.py
node --test continuation/sdk-boundaries.test.mjs > reports/continuation/sdk.tap
tail -9 reports/continuation/sdk.tap
node --test continuation/ui-scheduling.test.mjs > reports/continuation/ui-scheduling.tap
tail -9 reports/continuation/ui-scheduling.tap
.venv/bin/python scripts/summarize-continuation.py
