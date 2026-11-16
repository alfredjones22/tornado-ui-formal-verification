# Registry SDK release — 16 November 2026

The user requested a new release using the exact published @kohaku-eth/tornado-cash 0.1.0-alpha.37 package, then authorized calculating its expected CID and retargeting FV before independently deploying it.

## Change and target

The UI differs from the original runtime/source capture in exactly four files: package.json, package-lock.json, vite.config.ts and README.md. The SDK dependency is now an exact registry pin with a resolved tarball URL and SHA-512 integrity. The local SDK build command, sibling-directory Vite access and obsolete worker-loader alias were removed. Setup documentation now describes the registry package. The README contains the new CID as plain text.

No application TypeScript/Vue source changed, including the direct-withdrawal validator, SDK adapter and caller. The claims, conditional semantics and option A confirmation decision are unchanged. All required checks are rerun for the new target; earlier PASS reports are not reused as this release's verdict.

New baseline: 388 files / 63,309,993 bytes, digest 8640d00237f117f233719d30047ef876e40e7894fae1ef6ed49fc7f3404b9f31.

Expected CID: bafybeifsqylni6qcznv2b27gymbymruqhmhp6kjy2sp6hafz3iqq3ezmha.

The earlier baseline digest and CID are recorded in [release-history.md](release-history.md); the unused verifier archive is not distributed. The active baseline was deliberately revised; the old target was not silently modified or accepted through a README exception.

## SDK source correspondence

Every one of the original 14 captured SDK artifacts matches the installed npm package byte for byte. Those artifacts include every published SDK JavaScript file. The retained source and pinned reconstruction still have to rebuild those exact 14 artifacts during every full verification.

The registry package contains 17 files. Its one additional dist file, merkle-tree.node.d.ts, is a non-executable TypeScript declaration not present in the previous captured build. It is pinned and compared as package content, as are the package README and package.json. No source-rebuild claim is made for these three package files. Published package metadata replaces workspace dependency specifiers with registry versions; that metadata is part of the frozen package and UI lockfile.

The release check rejects local SDK links, local lockfile dependencies, any registry-package inventory/content drift, missing source coverage of published JavaScript, SDK rebuild mismatches, UI rebuild mismatches and CID mismatches. It does not replace the installed npm package with the retained source build. Vite uses the actual registry package.

## Deployment comparison

The CID is computed offline with the same explicit UnixFS import settings that reproduced the previous published release: CIDv1, raw leaves, SHA-256, 262,144-byte chunks, balanced layout and the contents of dist at the root, without mode/mtime metadata. Full settings are in release/cid.mjs and the generated release report.

The publisher independently uploaded the build and reported the exact expected CID. The pinned [deployment record](../release/deployment.json) records this comparison, and every full verifier run checks that its reported CID agrees with the frozen and rebuilt directories. This records a publisher report; service pinning, gateway delivery and availability were not checked. Different uploader import settings can produce a different CID for identical file content; compare settings if the independently published CID differs.

## Checks

The UI's clean dependency install, 590 tests, typecheck and IPFS build check passed after the dependency change. FV reruns 22 conditional SMT obligations, seven lifecycle properties, 71 captured-source implementation tests, 448 concrete/symbolic cases and mutation checks. Current results and consumer positive/negative validation are recorded under reports/; saved reports identify their target digest and run.

The frozen manifest retains the deployment status recorded at capture time. The current profile, pinned deployment record and regenerated release report record the later matching upload. No frozen UI, SDK or build bytes were changed by recording it.

## Later publication cleanup

The publisher subsequently removed PLAN.md, TORNADO_WITHDRAWAL_DESIGN.md and the two unused deployment/saga-proxy files. The proxy-only test that imported the deleted worker was also removed to keep npm test working. Exactly these five non-runtime removals are pinned as a source revision without altering the immutable snapshot. All 127 remaining UI files must match, and the rebuild with these files absent must reproduce the same 65 output files and CID. See [publication-cleanup.md](publication-cleanup.md).
