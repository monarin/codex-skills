# User-Facing psana Reference

## Table of Contents

- Entry points
- Tests and examples
- DataSource modes
- Runs, events, steps, and detectors
- Smalldata and callbacks
- Detector selection and SMD callbacks
- Shared memory and live mode
- Timestamp jumps
- Integrating detectors
- Verification habits

## Entry Points

Use this reference when the task is about user scripts, examples, tests, or public psana behavior. Primary sources:

- `psana/psana/tests`
- `/sdf/home/m/monarin/tmp/psana_example.pdf`
- `psana/psana/datasource.py`
- `psana/psana/psexp/ds_base.py`
- `psana/psana/psexp/run.py`

Extract the PDF text with:

```bash
gs -q -sDEVICE=txtwrite -o - /sdf/home/m/monarin/tmp/psana_example.pdf
```

## Tests And Examples

High-signal user-facing files in `psana/psana/tests`:

- `user_loops.py`: basic `DataSource`, `run.events()`, `run.steps()`, detectors, epics/scan access.
- `ds.py`: common `DataSource` patterns, filters, `small_xtc`, `smd_callback`, event and step loops.
- `run_steps.py` and `run_steps_w_ts_filter.py`: step iteration and timestamp filtering.
- `test_run_build_table.py` and `run_build_table_performance.py`: `run.build_table()` and `run.event(ts)`.
- `run_intg_det.py`, `run_andor.py`, `run_andor_delta.py`: integrating detector behavior.
- `run_smalldata.py`, `run_smalldata_group.py`, `test_smalldata_callback.py`: smalldata output and callbacks.
- `test_shmem.py`, `test_shmem_w_supervisor.py`, `shmem_client.py`, `test_calib_prefetch_cache_shmem.py`: shared-memory runs and calibration cache tests.
- `livemode.py`, `test_live_transfer.py`: live mode and `.xtc2.inprogress` handling.
- `test_ds_dir_fallback.py`: explicit `dir=` fallback when DB stream discovery and local files differ.

## DataSource Modes

`psana.DataSource()` is a factory:

- `DataSource(exp=..., run=..., dir=...)` uses experiment XTC directories. In non-MPI mode it returns `SerialDataSource`; in MPI mode it returns `MPIDataSource` for SMD0/EB/BD ranks and `NullDataSource` for SRV ranks.
- `DataSource(files=...)` returns `SingleFileDataSource`.
- `DataSource(shmem=...)` returns `ShmemDataSource` for live shared-memory clients, with SRV ranks mapped to `NullDataSource` when `PS_SRV_NODES` consumes ranks.
- `DataSource(drp=...)` returns `DrpDataSource`.

Common kwargs are defined in `DataSourceBase`: `batch_size`, `max_events`, `detectors`, `xdetectors`, `small_xtc`, `timestamps`, `live`, `smd_callback`, `intg_det`, `intg_delta_t`, `psmon_publish`, `use_calib_cache`, `cached_detectors`, and logging kwargs.

## Runs, Events, Steps, And Detectors

Canonical pattern:

```python
from psana import DataSource

ds = DataSource(exp="tmoc00118", run=222, dir="/sdf/data/lcls/ds/prj/public01/xtc", max_events=10)
run = next(ds.runs())
det = run.Detector("tmo_opal1")

for evt in run.events():
    image = det.raw.image(evt)
    if image is None:
        continue
```

For scans, use `run.steps()` and create scan detectors with `run.Detector(...)`. `run.step(evt)` returns the current step value for an event. `run.detnames`, `run.epicsinfo`, `run.scaninfo`, and `run.xtcinfo` are useful discovery surfaces.

Warn about `Detector` objects outside loops in MPI mode: helper ranks execute user code but may receive `None` or never enter the event loop. Create or use detector objects inside `for run in ds.runs()` and event/step loops when possible.

## Smalldata And Callbacks

Set `PS_SRV_NODES` before constructing the DataSource when writing smalldata in MPI mode. `DataSource.smalldata()` returns the writer/gatherer interface.

Important behavior:

- `smd.event(evt, **data)` accepts kwargs or a dictionary.
- Hierarchical dictionaries become HDF5 groups.
- Variable-length data must use a `var_` prefix.
- Use `align_group=` or `unaligned_` prefixes for data that should not be padded to the main event rate.
- `smd.sum()`, `min()`, and `max()` are collective operations. All relevant ranks must call them.
- Prefer `max_events=` over breaking out of an MPI event loop early, because helper ranks must shut down cleanly.
- Call `smd.done()` at the end of the run.

## Detector Selection And SMD Callbacks

Use `detectors=[...]` to keep only needed detector streams. Use `xdetectors=[...]` to exclude detector streams. Selection works at stream granularity, so another detector in the same stream may be included or excluded with the requested detector.

Use `smd_callback=callback` to filter events or set destinations on EB ranks before BigData fetch. If the callback needs regular detector data, add those detector names to `small_xtc=[...]`. Epics and scan detectors are available automatically.

Example callback shape:

```python
def smd_callback(run):
    opal = run.Detector("tmo_opal1")
    for evt in run.events():
        img = opal.raw.image(evt)
        if img is not None:
            evt.set_destination((evt.timestamp % n_bd_nodes) + 1)
            yield evt
```

Explicit destination selection is most reliable with `PS_EB_NODES=1`; the current EventBuilder code treats explicit destination IDs inside each EB's local `bd_comm`.

## Shared Memory And Live Mode

For DAQ shared memory:

```python
ds = DataSource(shmem="tmo")
```

Find the shared-memory tag from DAQ `.cnf` files or `/dev/shm/PdsMonitorSharedMemory_*`. Multi-core shared-memory scripts often use `PS_SRV_NODES=1` and smalldata callbacks to gather worker results for plotting. On DRP nodes, OpenMPI may need explicit BTL options, for example `--mca btl vader,self` for same-node use.

For live filesystem mode:

```python
ds = DataSource(exp="tmoc00118", run=222, dir="/sdf/data/lcls/ds/prj/public01/xtc", live=True)
```

Live mode waits for `.xtc2` or `.xtc2.inprogress` files and uses retry settings. Prefer FFB paths such as `SIT_PSDM_DATA=/sdf/data/lcls/drpsrcf/ffb` or explicit `dir=/sdf/data/lcls/drpsrcf/ffb/<hutch>/<exp>/xtc`.

## Timestamp Jumps

Two user-facing paths exist:

- `DataSource(..., timestamps=np.asarray(..., dtype=np.uint64))` filters events to known timestamps.
- `with run.build_table() as success: evt = run.event(ts)` builds a timestamp-to-offset table first.

`run.build_table()` is blocking, supports MPI mode with one EB, and is not meant for live/streaming mode. In MPI `RunParallel.build_table()`, only BD ranks get `success=True`.

## Integrating Detectors

Use `intg_det="<slow_detector_name>"` on `DataSource`. The detector named here should be the slowest integrating detector.

Operational rules:

- Set `PS_SMD_N_EVENTS` small, often `1`, before constructing the DataSource.
- In integrating mode, `DataSource(batch_size=...)` is ignored for SMD0-to-EB chunking; `PS_SMD_N_EVENTS` controls the number of integrating events per batch.
- `max_events` counts integrating detector events.
- `DataSource.smalldata(batch_size=...)` still controls smalldata gather/write cadence and does not count integrating detector events.
- Use `evt.EndOfBatch()` to detect the end of the current integrating window.
- `intg_delta_t` is a positive integer nanosecond shift for the integration window.
- Multiple integrating detectors should have readout rates that are multiples of each other and in phase. If using a delta, all integrating detectors need the same delta.

Typical pattern:

```python
import os
from psana import DataSource

os.environ["PS_SMD_N_EVENTS"] = "1"
ds = DataSource(exp="xpptut15", run=1, dir="/sdf/data/lcls/ds/prj/public01/xtc/intg_det", intg_det="andor")
run = next(ds.runs())
andor = run.Detector("andor")

for evt in run.events():
    data = andor.raw.calib(evt)
    if evt.EndOfBatch():
        ...
```

## Verification Habits

For code changes, choose focused tests:

- Basic DataSource/event behavior: `pytest psana/psana/tests/test_run_calibconst.py`, `pytest psana/psana/tests/test_run_build_table.py`, or a nearby test.
- MPI helper behavior: inspect `psana/psana/tests/byhand_mpi.py` and `byhand_run_steps.py`; these run `mpirun` subprocesses and may need the psana environment.
- Shared-memory behavior: `test_shmem.py`, `test_shmem_w_supervisor.py`, and `test_calib_prefetch_cache_shmem.py` may be platform/environment-sensitive.
- Integrating detector behavior: `python psana/psana/tests/run_intg_det.py` or the `byhand_mpi.py` path that launches it.
