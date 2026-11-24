# Source, locked package, exact output hashes and IPFS CID

Expected and publisher-reported upload CID:

    bafybeifhtg6uy25vunell43ocrxxers3c5pvst7qlxr77xlco3lqpbjxr4

The pinned deployment record reports the publisher's independent upload. Gateway delivery/execution and availability are not checked by verification.

## Reproduce

```sh
npm run setup
npm run verify
```

The verify:release script checks only the baseline/rebuild/CID evidence. The full verify command is required for the final scoped verdict. Setup installs integrity-locked dependencies; no network is needed during verification. Reports and logs are regenerated locally and ignored by Git.

## Exact source and package chain

The immutable manifest records the 412-entry target with digest c35725f429a509211569d25a3079e34c224776afc59bb73d9397782f45eaafa7. Its 129 UI source files capture clean main commit `1da44cd3b0a66508f7bd19d25adcbe8c8f8963aa` exactly. The source revision allows no file exceptions.

Every full verification run:

1. Validates the immutable manifest digest, retained source/input hashes and exact UI source revision. Original hashes for every expected output remain in the manifest.
2. Checks SDK artifacts/package content against that manifest using the actual integrity-locked registry install. Duplicate copies of these files are not stored under baseline/.
3. Rebuilds retained SDK source with the original configuration, pinned tools and reconstructed dependency layout. All 14 captured artifacts must match their original hashes and the installed registry package. Every published SDK JavaScript file must be covered.
4. Checks all 16 installed SDK package files, version, URL/integrity declarations and absence of local dependency links. All 14 published `dist/` files are source-rebuilt; package.json and README.md are integrity-pinned package inputs without a source-rebuild claim.
5. Builds the exact captured UI main source with the installed registry SDK. The complete 65-file inventory and every byte must match the manifest's hashes. Generated HTML/JavaScript/CSS/fonts are not retained as redundant baseline copies; missing, extra or changed outputs fail this comparison.
6. Computes the byte-checked rebuilt directory CID and requires it to match the pinned expected CID and the publisher-reported upload CID.

This retains exact source-to-package-to-output correspondence. No output normalization occurs. The manifest commits to the captured output contents under SHA-256 assumptions; a second copy of generated output is not necessary to compare those bytes. The clean UI main build was independently computed to the publisher-supplied CID before recapture.

## Build inputs and original layout

UI dependencies/tools are pinned in its captured npm lockfile, including Vite 8.3.5, Vue/compiler-sfc 3.5.44, vue-tsc 3.3.14 and TypeScript 5.9.3. The SDK rebuild uses tsup 8.5.1, esbuild 0.27.7, Rollup 4.62.2 and TypeScript 5.9.3.

All 39 external runtime-package inputs are obtained through the SDK toolchain lockfile. release/runtime-layout.json records their original paths, selected file sets, dependency links and content digests. For the three former vendored packages, their library files match npm exactly. Two original package.json files under release/package-metadata/ preserve workspace metadata/formatting that differs from published packaging. They are applied only to the isolated reconstruction, never to installed packages. Each complete reconstructed package must retain its original digest.

The parent SDK tsconfig, runtime-layout descriptor, toolchain metadata/lockfile, package metadata and deployment record are pinned by release/input-manifest.json and the verification profile. Original relative pnpm/workspace paths are preserved because esbuild embeds paths in comments/wrapper keys. Nothing reads an original developer checkout.

The 42 exact compressed public proving/history/relayer assets remain under baseline/build/offline/. They are copied build inputs, not generated executable code. The unchanged UI asset verifier checks decoded sizes/hashes against captured manifests. Preserving gzip packaging bytes avoids assuming that recompression produces an identical CID. These assets are retained so setup does not depend on public IPFS gateway availability.

The exact UI README and all 128 other captured UI source files stay pinned; there is no general Markdown or test/deployment-directory exemption.

## IPFS import contract

Pinned ipfs-unixfs-importer 17.1.1 and blockstore-core 7.0.1 compute the directory offline: CIDv1, SHA-256, raw leaves, fixed 262,144-byte chunks, balanced layout with 174 children, links-first field order, single-leaf reduction, a 262,144-byte directory sharding threshold and links-bytes sharding strategy. Contents sit directly at the CID root, without an extra enclosing name, mode or mtime. Full parameters are in release/cid.mjs and the generated report.

## Meaning and limits

This is reproducible-build evidence and content identity under toolchain/hash assumptions, not a semantic proof about all generated JavaScript. Compilers, external-library contracts, browser/runtime semantics and the FV assumptions remain trusted. The matching independent upload CID is a publisher report, not an authenticated external attestation. Other UI routes are outside the scoped verification claims.
