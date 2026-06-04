# Developer Internals Reference

## Table of Contents

- Core flow
- DataSource and Run types
- MPI roles
- SMD0 and chunk boundaries
- EventBuilder
- BigData reads
- Transition propagation
- MFX and shared calibration constants
- Debugging checklist

## Core Flow

Use current source as the authority. This file is a guide to where to look and what invariants to expect.

Main paths:

- Factory and mode selection: `psana/psana/datasource.py`
- Shared parameters and file discovery: `psana/psana/psexp/ds_base.py`
- MPI role setup and SMD0/EB/BD nodes: `psana/psana/psexp/node.py`
- SMD read manager: `psana/psana/psexp/smdreader_manager.py`
- Cython SMD reader: `psana/psana/smdreader.pyx`
- Parallel stream reader: `psana/psana/parallelreader.pyx`
- Event builder: `psana/psana/eventbuilder.pyx`
- EB manager wrapper: `psana/psana/psexp/eventbuilder_manager.py`
- BigData event materialization: `psana/psana/psexp/events.py`, `psana/psana/psexp/event_manager.py`
- Run classes and detector/calib setup: `psana/psana/psexp/run.py`

The offline MPI data path is:

```text
SMD0 rank
  SmdReaderManager -> SmdReader/ParallelReader
  repack smd + step history chunks
  send to EB

EB ranks
  EventBuilderManager -> EventBuilder
  build timestamp-aligned events and step batches
  send per-destination batches to local BD ranks

BD ranks
  Events -> EventManager
  read bigdata dgrams using offsets from smd dgrams
  yield dgram lists to RunParallel.events()/steps()
```

## DataSource And Run Types

`psana.DataSource()` dispatches by kwargs:

- `shmem`: `ShmemDataSource`, except MPI SRV ranks become `NullDataSource`.
- `exp`: `SerialDataSource` when non-MPI or MPI world size is one; `MPIDataSource` for SMD0/EB/BD ranks; `NullDataSource` for SRV ranks.
- `files`: `SingleFileDataSource`.
- `drp`: `DrpDataSource`.

Important `Run` classes in `run.py`:

- `Run`: common detector creation, envstore, transition handling, calibration setup.
- `RunSerial`: experiment-directory non-MPI path using `SmdReaderManager`.
- `RunParallel`: MPI path. Creates `Smd0`, `EventBuilderNode`, or `BigDataNode` according to role.
- `RunSingleFile`: direct `DgramManager` iteration over one or more XTC files.
- `RunShmem`: shared-memory path with no SMD event-building routine.
- `RunDrp`: DRP Python path with no SMD event-building routine.
- `RunSmallData`: callback-side run object used by EventBuilder/SMD callbacks.

`DataSourceBase._setup_run_files()` discovers smd files and matching bigdata files. It asks the logbook DB for expected stream files when available and falls back to disk discovery for explicit `dir=` cases. It sets `dsparms.smd_files`, `xtc_files`, and `use_smds`.

`DataSourceBase._apply_detector_selection()` implements `detectors`, `xdetectors`, and `small_xtc`. `small_xtc` swaps selected detector streams to use bigdata files where SMD files would normally be used, so callback code can inspect those detectors.

## MPI Roles

`Communicators` in `node.py` creates the psana MPI topology.

- World tail ranks reserved by `PS_SRV_NODES` are SRV and excluded from `psana_group`.
- World rank 0 is SMD0.
- `PS_EB_NODES` controls the number of EB ranks. Default is `1`.
- In normal mode, `bd_main_rank % PS_EB_NODES` splits ranks into EB/BD groups. Rank 0 within each `bd_comm` is EB; the remaining ranks are BD.
- `smd_comm` contains SMD0 and EB ranks, so SMD0 only sends chunks to EBs.
- `bd_comm` contains one EB and its BD clients.
- `PS_EB_NODE_LOCAL=1` colocates non-marching EB/BD groups by node and may override `PS_EB_NODES` through `_ensure_local_eb_nodes()`.
- `PS_SHMEM_SCOPE=NUMA` makes shared calibration helpers use the NUMA communicator instead of the whole node communicator.

The MPI PDF at `/sdf/home/m/monarin/tmp/psana_mpi_4layers.pdf` shows the four-layer mental model: SMD0 reads small XTC, EBs receive small data and run optional filtering/destination logic, BDs fetch big XTC using smd offsets, and SRVs gather/write small user data.

## SMD0 And Chunk Boundaries

`ParallelReader.force_read()` is the low-level stream scanner:

- Copies unseen bytes to the beginning of each buffer.
- Reads more bytes from each smd file descriptor.
- Parses each datagram into per-stream arrays: timestamp, service, start offset, end offset.
- Sets `has_l1` when a stream has `L1Accept` or `L1Accept_EndOfBatch`.
- Copies non-L1 transitions into `step_bufs`.
- Detects oversized datagrams through `chunk_overflown`.

`SmdReaderManager` owns the retry/read loop:

- `get_next_dgrams()` calls `build_batch_view(batch_size=1, ignore_transition=False)` to fetch Configure/BeginRun-style transitions.
- `chunks()` repeatedly calls `build_batch()` and yields chunk numbers for SMD0.
- `build_batch()` passes `PS_SMD_N_EVENTS` through `get_smd_n_events()` as the SMD0-to-EB batch size, capped by `max_events`.
- `PS_SMD_CHUNKSIZE` controls the SMD read buffer size.

`SmdReader.build_batch_view()` determines the visible window for each stream.

Normal mode, `find_limit_ts()`:

- For Configure/BeginRun or other transition fetches (`ignore_transition=False`), it picks the stream whose latest ready datagram has the smallest timestamp.
- For normal data batches (`ignore_transition=True`), it chooses a winner in tiers:
  - Tier 1: streams with at least `batch_size` pending L1 events. Lowest latest timestamp wins.
  - Tier 2: streams with some pending L1 events but fewer than `batch_size`. Used for partial batches when no tier-1 stream exists.
  - Fallback: transition-only streams, used only when no stream has pending L1 events.
- The winner timestamp becomes the initial `limit_ts`.
- The winner is then walked to enforce `batch_size` and `max_events`. In data batches, counts apply to L1 events; transitions do not count as L1.
- The final winner datagram timestamp becomes the real `limit_ts`.
- Every other stream must have ready data through `limit_ts`; otherwise the method returns `False` and the manager reads/retries.
- For each stream, `i_st_blocks`, `i_en_blocks`, and `block_sizes` define the SMD chunk to show or repack. Step-buffer indices are calculated similarly.

Integrating mode, `find_intg_limit_ts()`:

- `dsparms.intg_stream_id` is the winner stream.
- The function walks the integrating stream and skips transitions until it finds the next L1-style integrating event.
- It computes `limit_ts = integrating_event_ts + intg_delta_t` in nanoseconds, then converts back to psana timestamp format.
- Other streams must have latest ready timestamps greater than or equal to that limit. If not, the integrating event is split and the batch waits for more data unless a partial batch must be forced.
- `build_batch_view()` calls `find_intg_limit_ts()` repeatedly until `PS_SMD_N_EVENTS` integrating events are collected or EndRun/partial-batch conditions force completion.
- `mark_endofbatch()` finds the stream with the largest timestamp in the sub-batch and changes the final L1 service to `L1Accept_EndOfBatch`; user code sees this through `evt.EndOfBatch()`.
- In integrating mode, `DataSource(batch_size=...)` is not the SMD0-to-EB chunk size. `PS_SMD_N_EVENTS` is.

`SmdReader.repack_parallel()` combines missing step history, current SMD block data, optional fake step transitions, and a `PacketFooter` into one contiguous buffer per EB. `PS_SMD_REPACK_MAX_BUFSIZE` caps this send buffer.

## EventBuilder

`EventBuilderNode.start()` does EB work:

- Requests one SMD chunk from SMD0 over `smd_comm`.
- Wraps the chunk in `EventBuilderManager`.
- Iterates `eb_man.batches()` to build event batches and step batches.
- Sends batches to BD ranks over the local `bd_comm`.
- Tracks `StepHistory` so BDs that did not receive previous step transitions can be caught up before receiving later L1 events.
- Sends empty bytearrays to terminate BD ranks after the stream ends.

`EventBuilder` in `eventbuilder.pyx` aligns streams:

- `_gather_event()` reads the next datagram candidate from each stream view and chooses the minimum timestamp.
- Matching timestamp datagrams are included in the event; nonmatching candidates are rewound.
- Non-L1 transitions must be complete across all streams. If a transition is incomplete, EventBuilder raises.
- Fast path `_build_fast_batch()` builds bytearray event batches without proxy events when there is no callback, no timestamp filter, and no integrating proxy need.
- Proxy path builds `ProxyEvent` objects for `smd_callback`, timestamp filtering, or integrating mode.
- `ProxyEvent.set_destination()` records a user destination. `gen_bytearray_batch()` groups by destination. Destination `0` means any BD rank.
- Non-L1 events are copied into both the normal batch and the step batch for each destination.

For explicit destinations, the current EB node validates destination IDs against the local `bd_comm` size. This is why explicit destination logic is safest with `PS_EB_NODES=1`.

## BigData Reads

`BigDataNode.start()` is a request/receive loop:

- Sends a request payload to EB containing local BD rank and previous read/processing stats.
- Receives an EB bytearray batch.
- Passes `get_smd` into `Events`, then yields dgram lists produced by `EventManager`.

`Events.__next__()` refills `EventManager` when the current batch is exhausted. For MPI BigData, it calls `get_smd()` to receive the next EB batch.

`EventManager` turns SMD batches into actual dgrams:

- `PacketFooter` identifies the number and size of events in the EB batch.
- `_get_offset_and_size()` scans each smd event and records per-event, per-stream arrays:
  - SMD byte offset and size inside the EB batch.
  - BigData file offset and size from `d.smdinfo[0].offsetAlg.intOffset` and `intDgramSize`.
  - Service IDs and chunk change information.
- `_get_bd_offset_and_size()` groups contiguous BigData reads until a cutoff, limited by `PS_BD_CHUNKSIZE`.
- `_fill_bd_chunk()` uses `os.pread()` to read a contiguous BigData window into `bd_bufs`.
- `_read()` retries short reads up to `max_retries`.
- `_get_next_dgrams()` yields:
  - SMD-view datagrams for no-bigdata cases, transitions, streams selected by `use_smds`, or smd-only mode.
  - BigData-view datagrams for L1 events that need bigdata payloads.
  - `None` for missing datagrams.
- If a datagram was marked `L1Accept_EndOfBatch`, `_get_next_dgrams()` sets `_endofbatch` on the produced dgram.

Chunked BigData files are switched on Enable transitions carrying `chunkinfo`; `_open_new_bd_file()` updates the file descriptor and current chunk ID.

## Transition Propagation

Transitions matter for envstore, steps, and detector configuration.

- Configure and BeginRun are fetched by SMD0 and broadcast in `MPIDataSource._get_configs()` and `_setup_beginruns()`.
- `ParallelReader` mirrors all non-L1 datagrams into `step_bufs`.
- `SmdReader.show(step_buf=True)` and `repack_parallel()` expose transitions as missing step history or current step data.
- `Smd0.start()` stores step history and sends missing steps to each EB before or after data chunks.
- `EventBuilder.gen_bytearray_batch()` sends non-L1 events to every destination batch and step batch.
- `EventBuilderNode` stores step batches in its own `StepHistory` and prepends missing step events for BDs that need them.
- `Run._handle_transition()` updates EnvStore for non-L1 dgrams and makes `Run.events()` swallow transitions.
- `Run.steps()` updates EnvStore for every transition and yields only on `BeginStep`.
- `PS_FAKESTEP_FLAG=1` can make `SmdReader` append fake `Disable`, `EndStep`, `BeginStep`, `Enable` transitions after L1/SlowUpdate conditions.

## MFX And Shared Calibration Constants

There are several related mechanisms. Check the active mode before assuming which one is in use.

`datasource.py` has MFX-specific DataSource tuning:

- `_force_mfx_overrides()` applies when `exp` starts with `mfx`.
- It sets `PS_SMD_N_EVENTS=5000`.
- It sets or caps `PS_EB_NODES` to the detected node count.
- It changes `batch_size` to `1` when the requested/default value is greater than `10`.

Generic calibration setup is in `Run._setup_run_calibconst()`:

- Without `use_calib_cache`, each detector's constants are fetched from the calibration DB through `calib_constants_all_types()`.
- With `use_calib_cache`, the run tries to load constants from shared cache files and validates detector info before accepting them.
- `skip_calib_load` can skip selected detectors or all detectors.

MPI shared calibration distribution is in `RunParallel._setup_run_calibconst()`:

- On SMD0, normal `Run._setup_run_calibconst()` fetches calibration constants.
- SMD0 converts calibration constants to a calibration-XTC buffer with `CalibXtcConverter`.
- `_distribute_calib_xtc()` broadcasts the buffer size and content through node-leader and node communicators.
- It allocates a per-node shared-memory window with `MPI.Win.Allocate_shared`, populates it on the shared-memory leader, and calls `load_calib_xtc_from_buffer()` so all ranks use views backed by shared memory.
- `PS_SHMEM_SCOPE=NUMA` narrows this sharing to NUMA communicators.

Jungfrau/MFX-heavy derived data sharing:

- `_setup_jungfrau_shared_calib()` is enabled by `PS_JF_SHARE_DERIVED` unless set false. It uses `MPISharedMemory` and `psana.detector.UtilsJungfrau` to build shared derived Jungfrau calibration and masks for raw Jungfrau area detectors.
- `_setup_jungfrau_shared_caches()` is enabled by `PS_GEO_SHARE` unless set false. It creates `SharedGeoCache` and `SharedCalibcCache` backed by `MPISharedMemory`, seeds pixel coordinate/index data, and attaches these caches to detector interfaces during `Run.Detector()`.
- `Run.Detector()` propagates `_shared_geo_cache` and `_shared_calibc_cache` into detector interfaces when present.

For shared-memory DataSource and DRP modes, `RunShmem` and `RunDrp` also distribute `calibconst` through supervisor/publisher sockets rather than the MPI SMD0/EB/BD shared-window path.

## Debugging Checklist

- Identify DataSource kind and Run kind first.
- In MPI, log or inspect `Communicators._nodetype`, `world_rank`, `bd_rank`, `bd_size`, and `smd_comm` membership.
- For SMD0 chunk bugs, inspect `PS_SMD_N_EVENTS`, `PS_SMD_CHUNKSIZE`, `PS_SMD0_NUM_THREADS`, `PS_SMD_REPACK_MAX_BUFSIZE`, `find_limit_ts()`, and `find_intg_limit_ts()`.
- For integrating detector bugs, confirm `intg_det`, `intg_stream_id`, `intg_delta_t`, `PS_SMD_N_EVENTS`, and whether the expected stream reaches `limit_ts`.
- For BigData read bugs, inspect `use_smds`, `PS_BD_CHUNKSIZE`, `smdinfo` offsets/sizes, chunkinfo Enable transitions, and `_read()` retry logs.
- For step/envstore bugs, inspect `step_bufs`, both `StepHistory` instances, `Run._handle_transition()`, and `Run.steps()`.
- For MFX/Jungfrau memory issues, inspect `PS_SHMEM_SCOPE`, `PS_JF_SHARE_DERIVED`, `PS_GEO_SHARE`, node/NUMA rank logs, and whether shared-memory windows are freed in `RunParallel.close_shared_memory()`.
