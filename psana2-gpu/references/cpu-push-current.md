# Current CPU-Push Model

## Contents

- Status
- User path
- Integrated pipeline
- EventBuilder split
- BD scheduling
- Detector processing
- Result API
- MPI topology
- Current limitations

## Status

CPU-push is the implemented psana2 GPU model. Verify the active branch before
using this source map because names and ownership may evolve.

The authoritative tracked pipeline is:

```text
GpuEvents
  -> KvikioGpuReader
  -> EventPool
  -> GPUDetector.process_batch()
  -> fused_calib_gpu()
  -> GpuEventContext / GPUResult
```

The current detector implementation is uncompressed Jungfrau calibration.
Unsupported GPU detectors should fail explicitly.

## User Path

GPU processing is selected through normal `DataSource` construction:

```python
from psana import DataSource

ds = DataSource(
    exp="mfx100848724",
    run=51,
    gpu_det="jungfrau",
    batch_size=5,
    n_gpu_streams=2,
)
run = next(ds.runs())

for ctx in run.events():
    calib_gpu = ctx.get("calib").on_gpu
    energy = ctx.raw("gmd").energy
```

Confirm current kwargs in `datasource.py` and `ds_base.py`; examples can become
stale.

## Integrated Pipeline

```text
Smd0
  reads and distributes normal SMD chunks

EventBuilder
  aligns streams by timestamp
  produces CPU, GPU, and step batches

GpuEvents on the BD rank
  receives a coherent CPU/GPU batch pair
  retires the next reusable execution slot
  issues KvikIO reads for GPU descriptors
  runs EventManager for CPU-routed streams
  waits for KvikIO futures
  launches Jungfrau raw gather and fused calibration
  correlates CPU events and GPU results by timestamp
  yields GpuEventContext
```

Serial and MPI execution should use the same `GpuEvents` implementation with
different batch sources. Smd0, EB, and service ranks should not create CUDA
contexts merely because a GPU detector was requested.

## EventBuilder Split

Detector stream routing is derived from Configure metadata and DataSource
selection. EventBuilder emits:

```text
cpu_batch   Normal SMD event format with GPU-routed stream dgrams omitted
gpu_batch   Versioned GPU event/descriptor tables
step_batch  Transition history required by the BD
```

The CPU batch remains consumable by EventManager; omitted GPU stream entries
appear as missing dgrams. GPU descriptor rows carry bigdata offsets and sizes.
Both sides preserve the same event identity.

Inspect these before changing the split:

```text
psana/psana/eventbuilder.pyx
psana/psana/psexp/eventbuilder_manager.py
psana/psana/gpu/gpu_batch.py
psana/psana/dgramlite.pyx
```

## BD Scheduling

`GpuEvents` coordinates the CPU BD and its assigned GPU. KvikIO reads are issued
before CPU EventManager work so I/O can overlap CPU bigdata processing. The
current EventPool uses a ring of CUDA streams/slots.

One complete EB GPU batch currently maps to one EventPool slot. Pool depth
bounds in-flight batch count but not total memory. Reader and detector buffers
are reused per slot and grow to observed high-water sizes.

## Detector Processing

`GPUDetector` owns calibration state and detector-specific buffer caches. For
Jungfrau it:

1. Determines fixed raw layout from detector data.
2. Uses actual L1Accept child-XTC segment order for each routed stream.
3. Reorders pedestal and gain/mask arrays once for that order.
4. Gathers raw panels into contiguous slot/stream buffers when required.
5. Calls `fused_calib_gpu()` on the slot stream.
6. Returns per-event views into the reusable calibrated-output slot.

Pixel-exact segment order is a correctness invariant, not an optimization.

## Result API

The public GPU API currently exports:

```text
GPUResult
GpuEventContext
init_gpu_rank
```

`GPUResult.on_gpu` returns a CuPy array without D2H. `GPUResult.on_cpu` performs
a synchronous `.get()` and returns a NumPy copy.

There is no implemented `EventJoiner` or batched asynchronous D2H API. Current
internal timestamp matching is a per-event CPU/GPU correlation step, not a
checkpoint join API. Notes that define `EventJoiner` are proposals.

## MPI Topology

In CPU-push, each BD process owns one assigned GPU context. Several BDs may be
pinned to the same physical GPU. Current mapping is generally round-robin and
calibration constants may be shared between GPU peer processes.

One BD controlling multiple GPUs is not a current requirement. Multiple BDs on
one GPU require aggregate memory coordination; independent CuPy processes do
not automatically enforce a shared quota.

## Current Limitations

- EventPool slot count is not byte-budget backpressure.
- Generator progress participates in current result lifetime assumptions.
- An asynchronous downstream consumer cannot safely outlive slot reuse without
  a completion token.
- KvikIO CPU fallback is common on S3DF data paths; true GDS has not been the
  baseline for existing public-data acceptance.
- Only Jungfrau calibration is implemented.
- Common-mode and other detector operations may not be on GPU.
- Performance scripts are not correctness tests.

Use `psana/psana/gpu/notes/cpu_push_prototype.md` for a longer source-level
summary.
