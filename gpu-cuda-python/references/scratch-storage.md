# Scratch Storage For GPU Sweeps And Tests

## Default locations

Put generated sweep results, profiling captures/exports, intermediates, staged
input copies, calibration snapshots, auxiliary builds, and frozen test
installations on scratch. This applies even when the main checkout is in home.
Honor an explicit user-selected destination; do not silently fall back to home
when scratch is unavailable or full.

- SDF: `/sdf/scratch/users/m/monarin/gpu-validation/<task>/<run-id>/`.
- Perlmutter: `$SCRATCH/psana2-gpu/<task>/<run-id>/`; verify `$SCRATCH` resolves
  to Mona's allocated scratch location before use.
- Node-local scratch, such as SDF `/lscratch`, is for temporary staging/cache
  work only. Verify it on the allocated node and copy needed outputs to shared
  scratch before the allocation ends. Do not assume login-node `/tmp` or
  `/lscratch` is visible to compute nodes or other ranks.

Use a unique run directory for each attempt; keep failed attempts distinguishable
from accepted measurements. Check writable space and compute-node visibility
before staging large data or submitting jobs.

## Route outputs before launching

- Give harnesses explicit source, build/install, and output roots. Do not derive
  generated outputs from a home checkout's working directory or script location.
- Direct build trees, temporary build files, copied environments, frozen
  installations, per-run compiler caches, and large test arrays to scratch.
  When a separate source worktree is needed only for a comparison, create it
  with Git's worktree commands on scratch and retain its commit identity.
- Create scheduler log directories before submission and set absolute stdout
  and stderr paths on scratch. Set process-scoped `TMPDIR`, `CUPY_CACHE_DIR`,
  and tool-specific cache paths where the workload uses them; do not change
  global shell configuration merely to run a sweep.
- Set explicit Nsight output paths for `.nsys-rep`, `.qdstrm`, SQLite exports,
  CSVs, and summaries. Report readers may export beside their input, so route
  those exports to scratch too.
- Keep one verified immutable copy of shared calibration/reference inputs per
  applicable dataset/configuration and link to it, recording hashes. Do not
  duplicate large snapshots for every repetition or modify linked inputs in
  place. Keep dependencies alive for every run that still uses them.
- A repository `validation/...` symlink may preserve a required legacy path,
  but record its scratch target and check writers do not recreate a home-side
  directory. Git worktrees share repository metadata: placing builds on scratch
  does not move the main `.git` object store.

## Preserve reproducibility without filling home

Keep maintained harnesses, tests, small manifests, and concise Markdown results
in the repository. Record the source commit and dirty changes, command, job ID,
host, environment/build identity, input hashes, and absolute artifact location.
Exclude generated binaries, calibration dumps, traces, and large results from
Git; ignoring them alone does not stop them consuming home space.

Scratch is working storage, not a permanent archive. Verify the site's current
retention policy when deciding how long evidence can remain there. Preserve
unique evidence supporting accepted results on an approved durable project or
archive location before purge or cleanup. Keep small summaries/provenance in
Git so results remain interpretable if regenerable intermediates are removed.

This default governs new runs. It does not authorize deleting old artifacts,
moving active builds, or rewriting another task's paths. For a requested
migration, check users/dependencies, copy and verify contents first, and update
paths or preserve links before removing the old copy.
