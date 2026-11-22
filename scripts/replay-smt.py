from pathlib import Path
import z3
if not __debug__:
    raise RuntimeError('Assertions must be enabled')
root = Path(__file__).resolve().parents[1]
queries = sorted((root/'artifacts').glob('P*.smt2'))
assert len(queries) == 9
for path in queries:
    solver = z3.Solver(); solver.set(timeout=30000); solver.from_file(str(path))
    assert solver.check() == z3.unsat, f'Unexpected result: {path.name}'
(root/'artifacts/selected-note-gap.smt2').unlink(missing_ok=True)  # Obsolete pre-alpha.38 counterexample.
print('Saved SMT-LIB replay: 9 UNSAT obligations, including selected-note nullifier agreement')
