"""Keep immutable artifact hashes; read registry artifacts from the locked install."""
from pathlib import Path
EXTERNAL_NAMESPACES={'sdk-dist','sdk-package'}
def generated_output(row):
    return row['namespace']=='build' and not row['path'].startswith('offline/')
def distributed_input(row):
    return row['namespace'] not in EXTERNAL_NAMESPACES and not generated_output(row)
def stored_path(root,row):
    if generated_output(row):return None  # Verified against the immutable manifest after rebuilding.
    if row['namespace'] in EXTERNAL_NAMESPACES:
        package=root/'.release-work/ui/node_modules/@kohaku-eth/tornado-cash'
        if not package.is_dir() or package.is_symlink():
            raise RuntimeError('Locked registry SDK missing or locally linked; run npm run setup')
        return package/('dist' if row['namespace']=='sdk-dist' else '')/row['path']
    return root/'baseline'/row['namespace']/row['path']
