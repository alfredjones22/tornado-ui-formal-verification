# Publication file cleanup

The publisher authorized deletion of four files from the UI repository before publication:

- PLAN.md
- TORNADO_WITHDRAWAL_DESIGN.md
- deployment/saga-proxy/worker.js
- deployment/saga-proxy/wrangler.jsonc

The now-orphaned tests/saga-proxy.test.js was also removed: it imported the deleted worker and would otherwise break npm test. This test concerns the removed proxy deployment, not the frontend withdrawal flow.

The exact five removals are pinned in release/ui-source-revision.json by the verification profile. The record includes original sizes and SHA-256 values and binds to the unchanged baseline digest. All original files remain in the immutable snapshot as historical capture evidence. No frontend runtime, build configuration, dependency or README change is authorized by this revision.

Consumer verification validates the original snapshot and this revision, requires all five files to be absent from a supplied UI checkout, and checks exact bytes and inventory for all 127 remaining UI files. Reintroduced removed files, other missing files, additional files and changed content are rejected. There is no general documentation, deployment-directory or test-file exclusion.

The isolated rebuild also removes exactly these five files before building. Every SDK artifact, registry-package file and all 65 UI output files must still match, and the CID remains bafybeifsqylni6qcznv2b27gymbymruqhmhp6kjy2sp6hafz3iqq3ezmha. The release and final verification reports include the pinned source revision. The manifest and checks remain authoritative after redundant dependency/generated-output copies are removed; see [repository-cleanup.md](repository-cleanup.md). The eight claims and their assumptions are unchanged.

reports/publication-cleanup-check.json records targeted acceptance/rejection checks. reports/release-correspondence.json records the subsequent exact rebuild and CID comparison. Older saved consumer reports identify their previous run; they are not silently rewritten as new evidence.

Maintainers can rerun the focused checks with .venv/bin/python scripts/validate-publication-cleanup.py. The full release verdict remains npm run verify -- --ui /path/to/ui.
