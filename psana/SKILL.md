---
name: psana
description: Use when working on the LCLS2 psana module in ~/lcls2, including user-facing DataSource/Run/Detector examples, psana/psana/tests drivers, smalldata, live/shared-memory usage, integrating detectors, timestamp jumps, and developer internals for SmdReader, ParallelReader, EventBuilder, BigData, DataSource types, Run types, MPI role flow, transition distribution, and MFX/Jungfrau shared calibration constants.
---

# psana

Use this skill for psana work in the local `~/lcls2` checkout. Prefer current source over memory, because psana internals change often.

## First Checks

1. Confirm the repository root is `~/lcls2` or locate it before reading paths.
2. Start with `rg` over the relevant psana files instead of relying on stale notes.
3. Separate user-facing behavior from developer internals:
   - For user scripts, examples, tests, `DataSource`, `Run`, `Detector`, smalldata, live mode, timestamp jumps, or integrating detectors, read `references/user-facing.md`.
   - For SMD0, `SmdReader`, `ParallelReader`, `EventBuilder`, BigData, MPI roles, transition propagation, chunk boundaries, or shared calibration constants, read `references/developer-internals.md`.
4. If the request mentions a PDF, use the local PDFs:
   - User guide/example: `/sdf/home/m/monarin/tmp/psana_example.pdf`
   - MPI four-layer flowchart: `/sdf/home/m/monarin/tmp/psana_mpi_4layers.pdf`
   If text extraction is needed and `pdftotext` is unavailable, `gs -q -sDEVICE=txtwrite -o - <pdf>` works on this system.

## Source Map

- Public factory: `psana/psana/datasource.py`
- DataSource base and kwargs: `psana/psana/psexp/ds_base.py`
- DataSource implementations: `serial_ds.py`, `mpi_ds.py`, `singlefile_ds.py`, `shmem_ds.py`, `drp_ds.py`, `null_ds.py`
- Run implementations: `psana/psana/psexp/run.py`
- SMD0 and MPI role code: `psana/psana/psexp/node.py`
- SMD reader manager: `psana/psana/psexp/smdreader_manager.py`
- SMD chunk boundary logic: `psana/psana/smdreader.pyx`
- Parallel stream reader: `psana/psana/parallelreader.pyx`
- Event building: `psana/psana/eventbuilder.pyx`, `psana/psana/psexp/eventbuilder_manager.py`
- BigData event materialization: `psana/psana/psexp/events.py`, `psana/psana/psexp/event_manager.py`
- Packet layout helper: `psana/psana/psexp/packet_footer.py`
- Tests and user drivers: `psana/psana/tests`

## Working Pattern

When asked to explain or change behavior:

1. Identify the active DataSource kind first: `exp`, `files`, `shmem`, or `drp`, and whether MPI mode is active.
2. Identify the Run kind next: `RunSerial`, `RunParallel`, `RunSingleFile`, `RunShmem`, `RunDrp`, or `RunSmallData`.
3. Trace the event path:
   - Serial exp data: `SmdReaderManager -> BatchIterator/EventBuilder -> Events/EventManager -> Run.events`.
   - MPI exp data: `SMD0 -> EventBuilderNode -> BigDataNode -> Events/EventManager -> RunParallel.events`.
   - Single file or shmem: `DgramManager -> Events -> Run.events`, with no SMD0 event-building layer.
4. For chunk boundary questions, inspect `SmdReader.build_batch_view()` and the relevant `find_limit_ts()` or `find_intg_limit_ts()` branch.
5. For BigData read questions, inspect `EventManager._get_offset_and_size()`, `_fill_bd_chunk()`, `_read()`, and `_get_next_dgrams()`.
6. For transition questions, follow `step_bufs`, `StepHistory`, `repack_parallel()`, `repack_for_bd()`, and `Run._handle_transition()`.

## Skill Scope

Keep this as one `psana` skill for now. The user-facing and internals paths share the same `DataSource -> Run -> events/steps` concepts, so one trigger with split references is easier to use.

Consider splitting later only if the references become too large or independent:

- `psana-user-analysis`: examples, tests, smalldata, live mode, timestamp jumps, integrating detector scripts.
- `psana-mpi-internals`: SMD0, SmdReader, EventBuilder, BigData, MPI flow, transition distribution.
- `psana-calib-shmem`: MFX/Jungfrau shared calibration constants and geometry/cache sharing.
