# Release provenance

Only the current verification target is distributed. The earlier local-SDK verifier archive was removed during repository cleanup because it was not read by setup or verification.

The initial pilot captured 371 files / 61,085,810 bytes with digest afc59995802a90139224447a88b234fa19eeb3d186a0bd2d2524cca4ca41570b. Its published CID was bafybeiayzgdn25ckbyxmyujd37esu5h6dhsr4df2jg6jksw3hagivwovxu. The registry-SDK update deliberately established the current baseline, rather than changing that target silently.

The current manifest retains the earlier release's digest, CID and original archive path as capture-time provenance. That historical path is not an active input or a directory consumers need. Current source, assumptions, proof/model code and build/CID checks are retained and rerun.
