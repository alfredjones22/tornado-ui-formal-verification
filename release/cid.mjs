import { importer } from 'ipfs-unixfs-importer';
import { fixedSize } from 'ipfs-unixfs-importer/chunker';
import { balanced } from 'ipfs-unixfs-importer/layout';
import { MemoryBlockstore } from 'blockstore-core/memory';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const importSettings = Object.freeze({ cidVersion: 1, rawLeaves: true, wrapWithDirectory: true,
  chunkSize: 262144, layout: 'balanced', maxChildrenPerNode: 174, fieldOrder: 'links-first',
  reduceSingleLeafToSelf: true, leafType: 'file', shardSplitThresholdBytes: 262144,
  shardSplitStrategy: 'links-bytes', hash: 'sha2-256', metadata: 'no mode or mtime', directory: 'contents at CID root' });
export async function directoryCID(directory) {
  function files(dir, prefix = '') {
    return readdirSync(dir, { withFileTypes: true }).sort((a,b) => Buffer.compare(Buffer.from(a.name),Buffer.from(b.name))).flatMap(e => {
      if (e.isSymbolicLink()) throw Error('Symlinks are not supported release inputs');
      return e.isDirectory() ? files(resolve(dir,e.name),prefix+e.name+'/') : [{ path: prefix+e.name, content: readFileSync(resolve(dir,e.name)) }];
    });
  }
  let root;
  for await (const entry of importer(files(directory),new MemoryBlockstore(),{
    cidVersion: 1, rawLeaves: true, wrapWithDirectory: true,
    chunker: fixedSize({chunkSize:262144}), layout: balanced({maxChildrenPerNode:174}),
    fieldOrder:'links-first', reduceSingleLeafToSelf:true, leafType:'file',
    shardSplitThresholdBytes:262144, shardSplitStrategy:'links-bytes'
  })) root=entry;
  if (!root || root.path !== '') throw Error('Expected a UnixFS root directory');
  return root.cid.toString();
}
