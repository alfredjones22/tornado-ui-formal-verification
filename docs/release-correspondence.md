# Source, locked package, exact output hashes and IPFS CID

Expected and publisher-reported upload CID:

    bafybeifsqylni6qcznv2b27gymbymruqhmhp6kjy2sp6hafz3iqq3ezmha

The pinned deployment record reports the publisher's independent upload. Gateway delivery/execution and availability are not checked by verification.

## Reproduce

```sh
npm run setup
npm run verify
```

The verify:release script checks only the baseline/rebuild/CID evidence. The full verify command is required for the final scoped verdict. Setup installs integrity-locked dependencies; no network is needed during verification. Reports and logs are regenerated locally and ignored by Git.

## Exact source and package chain

The immutable manifest records the original 388-entry target with digest 8640d00237f117f233719d30047ef876e40e7894fae1ef6ed49fc7f3404b9f31. Its source/output hashes remain unchanged by repository cleanup. The current UI source revision removes exactly five non-runtime publication files; all 127 remaining files must match. See [publication-cleanup.md](publication-cleanup.md).

Every full verification run:

1. Validates the immutable manifest digest, retained source/input hashes and the pinned publication-cleanup revision. Original hashes for every expected output remain in the manifest.
2. Checks SDK artifacts/package content against that manifest using the actual integrity-locked registry install. Duplicate copies of these files are not stored under baseline/.
3. Rebuilds retained SDK source with the original configuration, pinned tools and reconstructed dependency layout. All 14 captured artifacts must match their original hashes and the installed registry package. Every published SDK JavaScript file must be covered.
4. Checks all 17 installed SDK package files, version, URL/integrity declarations and absence of local dependency links. The extra declaration dist/merkle-tree.node.d.ts plus package.json and README.md are pinned package inputs without a source-rebuild claim.
5. Applies exactly the five recorded removals, then builds the UI with the installed registry SDK. The complete 65-file inventory and every byte must match the original manifest's hashes. Generated HTML/JavaScript/CSS/fonts are not retained as redundant baseline copies; missing, extra or changed outputs fail this comparison.
6. Computes the byte-checked rebuilt directory CID and requires it to match the pinned expected CID and the publisher-reported upload CID.

This retains exact source-to-package-to-output correspondence. No output normalization occurs. The manifest commits to the captured output contents under SHA-256 assumptions; a second copy of generated output is not necessary to compare those bytes. The original full directory was previously checked against the same CID before redundant output copies were removed.

## Build inputs and original layout

UI dependencies/tools are pinned in its captured npm lockfile, including Vite 8.3.5, Vue/compiler-sfc 3.5.44, vue-tsc 3.3.14 and TypeScript 5.9.3. The SDK rebuild uses tsup 8.5.1, esbuild 0.27.7, Rollup 4.62.2 and TypeScript 5.9.3.

All 39 external runtime-package inputs are obtained through the SDK toolchain lockfile. release/runtime-layout.json records their original paths, selected file sets, dependency links and content digests. For the three former vendored packages, their library files match npm exactly. Two original package.json files under release/package-metadata/ preserve workspace metadata/formatting that differs from published packaging. They are applied only to the isolated reconstruction, never to installed packages. Each complete reconstructed package must retain its original digest.

The parent SDK tsconfig, runtime-layout descriptor, toolchain metadata/lockfile, package metadata and deployment record are pinned by release/input-manifest.json and the verification profile. Original relative pnpm/workspace paths are preserved because esbuild embeds paths in comments/wrapper keys. Nothing reads an original developer checkout.

The 42 exact compressed public proving/history/relayer assets remain under baseline/build/offline/. They are copied build inputs, not generated executable code. The unchanged UI asset verifier checks decoded sizes/hashes against captured manifests. Preserving gzip packaging bytes avoids assuming that recompression produces an identical CID. These assets are retained so setup does not depend on public IPFS gateway availability.

The exact README and all remaining source bytes stay pinned; there is no general Markdown or test/deployment-directory exemption.

## IPFS import contract

Pinned ipfs-unixfs-importer 17.1.1 and blockstore-core 7.0.1 compute the directory offline: CIDv1, SHA-256, raw leaves, fixed 262,144-byte chunks, balanced layout with 174 children, links-first field order, single-leaf reduction, a 262,144-byte directory sharding threshold and links-bytes sharding strategy. Contents sit directly at the CID root, without an extra enclosing name, mode or mtime. Full parameters are in release/cid.mjs and the generated report.

## Meaning and limits

This is reproducible-build evidence and content identity under toolchain/hash assumptions, not a semantic proof about all generated JavaScript. Compilers, external-library contracts, browser/runtime semantics and the FV assumptions remain trusted. The matching independent upload CID is a publisher report, not an authenticated external attestation. Other UI routes are outside the scoped verification claims.
