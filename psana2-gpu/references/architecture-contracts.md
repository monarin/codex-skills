# psana2 GPU Architecture Contracts

## Contents

- Scope
- Shared data path
- GPU batch contract
- Event and transition coherence
- I/O terminology
- Detector metadata
- Ownership rules
- Architectural boundaries

## Scope

These contracts are shared by the current CPU-push implementation and possible
future GPU-pull implementations. They define what should remain stable while
queue ownership, MPI topology, detector support, and scheduling evolve.

## Shared Data Path

```text
Smd0
  -> normal SMD chunks
EventBuilder
  -> coherent CPU SMD batch
  -> versioned GPU descriptor batch
  -> step/transition batch
CPU BD or GPU-owning worker
  -> bigdata reads into GPU memory
  -> detector processing
  -> GPU result or bounded CPU join
```

Smd0 should not need detector-specific GPU logic. EventBuilder remains the
place where timestamp-aligned events are split into CPU-routed and GPU-routed
descriptions.

## GPU Batch Contract

The GPU batch is a transport ABI, not a Python object graph. It should remain
sendable as bytes without pickle and contain enough information to schedule
bigdata reads without reparsing SMD dgrams in the BD hot path.

The current conceptual layout is:

```text
[GpuBatchHeader][GpuEventTable][GpuDescTable]
```

The event table preserves event identity and descriptor ranges. The descriptor
table identifies GPU-routed stream data and includes the bigdata file offset
and read size. Verify exact fields and versioning in current `gpu_batch.py` and
`eventbuilder.pyx` before changing the ABI.

Required properties:

- Explicit magic/version and bounds validation.
- Fixed-width little-endian fields where applicable.
- Timestamp and batch event identity sufficient for CPU/GPU correlation.
- Missing GPU dgrams represented without shifting event identity.
- Stream IDs interpreted as indices into psana's active stream/file list.
- No detector payload copy inside the descriptor batch.
- Compatibility handling or explicit version rejection on layout changes.

## Event And Transition Coherence

CPU and GPU batches must describe the same EventBuilder event range. A missing
GPU dgram does not remove the corresponding CPU event. The BD joins by stable
event identity, normally timestamp plus batch ordering.

Transition invariants:

- Configure establishes detector metadata and calibration setup.
- BeginStep waits for work using previous constants before updating them.
- Ordinary transitions do not drain unrelated work unnecessarily.
- EndRun and end-of-input drain pending work and partial joins exactly once.
- Partial-tail batches preserve event order and do not lose results.

## I/O Terminology

Use precise language:

- `GDS`: a CPU process submits cuFile/KvikIO I/O whose destination is GPU VRAM,
  avoiding a CPU payload bounce when filesystem and driver support it.
- `CPU fallback`: storage data passes through CPU memory and is copied to GPU
  memory by the KvikIO compatibility path.
- `GPU direct read` means the GDS destination path. It does not mean a CUDA
  kernel opens a file or invokes `pread()`.

Always check runtime I/O mode. Code working with KvikIO does not prove GDS was
active.

## Detector Metadata

Configure describes detector names, algorithms, fields, and segment membership.
L1Accept ShapesData carries NamesId identity and event payloads.

For Jungfrau, Configure membership alone does not determine physical panel
order in the L1Accept dgram. GPU gather preserves child-XTC traversal order, so
calibration arrays must be reordered to that observed order after validating
that its segment set matches Configure.

Use `psana-xtc-config` when changing Names/ShapesData or payload logic. Do not
replace Dgram/DescData functionality with a shallow parser unless a measured
hot-path requirement justifies it.

## Ownership Rules

Every design must identify owners for:

```text
GPU batch bytes and descriptor views
bigdata input buffers
raw gather/scratch buffers
calibrated outputs
downstream GPU results
pinned D2H buffers
CPU joined results
```

A view does not own its storage. The owner cannot recycle a buffer until all
consumers complete. Synchronizing one CUDA stream does not prove work submitted
later to another stream has completed. Cross-stream consumers must return CUDA
events or an equivalent completion token.

## Architectural Boundaries

Keep these distinctions visible:

```text
batch_size          EB-to-BD communication unit
GPU subbatch        execution/admission unit
pool depth          maximum concurrent execution units
D2H chunk           physical transfer unit
join_size           logical CPU delivery unit
```

Do not make one knob silently perform all five roles.
